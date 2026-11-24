"use strict";
const {assertPrizePicksApiAllowed}=require("../src/prizepicksapi-november-quota-lock.cjs");
const fs=require("node:fs"),path=require("node:path");
const {normalizeProjections}=require("../src/prizepicksapi-normalize.cjs");
const {requestNhlPage,providerUsage,USER_CONTEXT}=require("../src/prizepicksapi-nhl-request.cjs");
const {compareNhlCoverageSnapshots}=require("../src/prizepicksapi-nhl-coverage-stability.cjs");

// Free plan: at most six compact pages per capture (up to 6,000 offers).
// Each 1000-row compact page is 10 credits on newer plans, not 1 credit.
// Scheduled cadence and credit guards are defined in the workflow.
// Never silently publish a partial board as complete.
const PAGE_LIMIT=1000,MAX_PAGES=6,MAX_CREDITS_PER_CAPTURE=60,MIN_CREDITS_RESERVE=20;
async function fetchCompleteBoard(key,{fetchPage=requestNhlPage,at=new Date().toISOString(),
 pageLimit=PAGE_LIMIT,maxPages=MAX_PAGES}={}){
 if(!key)throw Error("Missing PRIZEPICKSAPI_KEY secret in GitHub Actions");
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>MAX_PAGES||
    !Number.isInteger(pageLimit)||pageLimit<1||pageLimit>PAGE_LIMIT)
   throw Error("Unsafe NHL provider request budget");
 const now=Date.parse(at);
 if(!Number.isFinite(now))throw Error("Invalid capture timestamp");
 const offers=[],seen=new Set();
 let cursor=null,firstObserved=null,chargedCredits=0,lastQuota=null;
 for(let i=0;i<maxPages;i++){
  const result=await fetchPage(key,{view:"compact",limit:pageLimit,cursor,page:i+1,withUsage:true});
  const page=result?.document||result,usage=result?.usage||null,m=page?.meta||{};
  // On a credit-metered plan the provider confirms the actual charge and
  // remainder. On legacy request plans the remaining request allowance
  // is reported separately. Unknown quotas prohibit additional pages.
  if(usage?.unit==="credits"){
   if(!Number.isInteger(usage.creditsCost)||usage.creditsCost<0||
      usage.creditsCost>Math.ceil(pageLimit/100)||
      !Number.isInteger(usage.creditsRemaining))
     throw Error("Missing or invalid credit cost headers; aborting NHL capture");
   chargedCredits+=usage.creditsCost;
   if(chargedCredits>MAX_CREDITS_PER_CAPTURE)
     throw Error("Exceeded configured per-run NHL credit ceiling");
  }
  lastQuota=usage;
  if(m.mode!=="live"||m.source_status!=="fresh"||
     !Number.isFinite(Date.parse(m.observed_at))||
     Math.abs(now-Date.parse(m.observed_at))>1800000)
    throw Error("Source did not confirm live and fresh; previous snapshot retained");
  if(firstObserved===null)firstObserved=m.observed_at;
  // A traversal crossing board refreshes cannot be a consistent snapshot.
  if(m.observed_at!==firstObserved){
    const error=Error("Provider refreshed NHL board during pagination; previous snapshot retained");
    error.captureDiagnostics={
      kind:"nhl_inconsistent_provider_board_pagination",failedPage:i+1,
      previousPages:i,priorPageRows:offers.length,
      firstBoardObservedAt:firstObserved,conflictingBoardObservedAt:m.observed_at,
      chargedCreditsKnownToCollector:chargedCredits,
      lastKnownRemaining:usage?.creditsRemaining??usage?.requestsRemaining??null,
      providerQuotaUnit:usage?.unit||"unknown"
    };
    throw error;
  }
  if(!Array.isArray(page.data)||page.data.length>pageLimit)
    throw Error("Malformed NHL API compact page; previous snapshot retained");
  offers.push(...page.data);
  const next=m.next_cursor??null;
  if(next===null)return {offers,pagesFetched:i+1,sourceObservedAt:firstObserved,
    pageView:"compact",pageLimit,maxPages,chargedCredits,
    quotaUnit:usage?.unit||"unknown",creditsRemaining:usage?.creditsRemaining??null,
    completePagination:true};
  if(!page.data.length||typeof next!=="string"||
      !/^[!-~]{1,200}$/.test(next)||seen.has(next))
    throw Error("Invalid or repeated NHL pagination cursor; previous snapshot retained");
  seen.add(next);
  // The provider charges per REQUESTED page, even if few rows are returned.
  // Do not spend the next 10 credits if it would cross the reserve or
  // advertised workspace limit. This is a post-page guard; the first
  // page may still cost credits, so the schedule is deliberately infrequent.
  if(usage?.unit==="credits"){
   const nextCharge=Math.ceil(pageLimit/100);
   if(chargedCredits+nextCharge>MAX_CREDITS_PER_CAPTURE||
      usage.creditsRemaining<nextCharge+MIN_CREDITS_RESERVE)
    throw Error("Insufficient confirmed NHL API credits for another full-board page; previous snapshot retained");
  }else if(usage?.unit==="requests"){
   if(!Number.isInteger(usage.requestsRemaining)||usage.requestsRemaining<2)
    throw Error("Insufficient confirmed NHL API request allowance; previous snapshot retained");
  }else throw Error("NHL provider quota unit unknown; refusing another billed page");
  cursor=next;
 }
 throw Error("NHL board exceeds "+(pageLimit*maxPages)+
  "-offer bounded collection; previous snapshot retained (not a complete board)");
}
// The documented /coverage call costs zero credits. Verify the workspace
// allowance BEFORE spending a 10-credit first projection page.
async function preflightNhlQuota(key,{client=fetch,
 wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 legacyDailyOnly=false}={}){
 if(!key)throw Error("Missing PRIZEPICKSAPI_KEY secret in GitHub Actions");
 let r;
 for(let attempt=0;attempt<3;attempt++){
  r=await client("https://prizepicksapi.com/api/v1/coverage",{
   method:"GET",headers:{Authorization:"Bearer "+key,
    Accept:"application/json","X-User-Request":USER_CONTEXT},
   signal:AbortSignal.timeout(15000)});
  // Coverage costs zero credits. Retry ONLY a temporary 503, never
  // authentication, permission, monthly quota or validation errors.
  if(r?.ok||r?.status!==503||attempt===2)break;
  await wait(1000*(attempt+1));
 }
 if(!r?.ok)throw Error("Free NHL quota preflight HTTP "+Number(r?.status||0));
 const usage=providerUsage(r.headers);
 // During the short daily capture pilot, accept ONLY the observed legacy
 // request-metered plan with substantial unused allowance. If the account
 // switches to per-row credits, stop before the billable projections call.
 if(legacyDailyOnly&&(usage.unit!=="requests"||
    !Number.isInteger(usage.requestsRemaining)||usage.requestsRemaining<100))
  throw Error("Daily NHL capture skipped: legacy request quota not verified above 100; zero projection calls");
 if(usage.unit==="credits"){
  if(!Number.isInteger(usage.creditsRemaining)||
      usage.creditsRemaining<MAX_CREDITS_PER_CAPTURE+MIN_CREDITS_RESERVE)
   throw Error("NHL capture skipped: insufficient confirmed free API credits for worst-case board plus reserve");
 }else if(usage.unit==="requests"){
  if(!Number.isInteger(usage.requestsRemaining)||
      usage.requestsRemaining<MAX_PAGES+2)
   throw Error("NHL capture skipped: insufficient confirmed legacy API request allowance");
 }else throw Error("NHL capture skipped: provider quota contract could not be verified");
 let coverageDocument=null;
 try{if(typeof r.json==="function")coverageDocument=await r.json();}catch{}
 return {...usage,coverageDocument};
}
async function preflightNhlBoardStability(key,{initial,client=fetch,
 wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 now=new Date().toISOString()}={}){
 if(!key)throw Error("Missing PRIZEPICKSAPI_KEY secret in GitHub Actions");
 if(!initial||!Array.isArray(initial.data))
  throw Error("NHL capture skipped: usable first free coverage snapshot missing");
 await wait(12000);
 const r=await client("https://prizepicksapi.com/api/v1/coverage",{
  method:"GET",headers:{Authorization:"Bearer "+key,Accept:"application/json",
   "X-User-Request":USER_CONTEXT},signal:AbortSignal.timeout(15000)
 });
 if(!r?.ok)throw Error("NHL capture skipped: second free coverage check HTTP "+Number(r?.status||0));
 const usage=providerUsage(r.headers);
 if(usage.unit==="credits"&&usage.creditsCost!==0)
  throw Error("Coverage endpoint unexpectedly billed credits; refusing projections pages");
 const stable=compareNhlCoverageSnapshots(initial,await r.json(),now);
 if(!stable.ready)throw Error("NHL capture skipped before paid pagination: "+stable.reasons.join(", "));
 return stable;
}
async function main(){
 assertPrizePicksApiAllowed();
 const key=process.env.PRIZEPICKSAPI_KEY;
 const budget=await preflightNhlQuota(key,{legacyDailyOnly:process.env.NHL_DAILY_LEGACY_ONLY==="1"});
 const freeCoverage=await preflightNhlBoardStability(key,{initial:budget.coverageDocument});
 const at=new Date().toISOString();
 const {offers,pagesFetched,sourceObservedAt,chargedCredits,quotaUnit,creditsRemaining}=await fetchCompleteBoard(key,{at});
 const {rows,skipped}=normalizeProjections(offers,at);
 // Report aggregate rejection reasons only. No raw provider rows, player
 // names or tokens appear in workflow logs after a failed collection.
 if(skipped.invalid>Math.max(5,Math.floor(offers.length*.05)))
   throw Error("Compact provider schema lacks NHL game/prop identity: "+
    skipped.invalid+"/"+offers.length+" invalid; previous snapshot retained");
 if(!rows.length)throw Error("No fresh pregame NHL offers: "+
   JSON.stringify({totalOffers:offers.length,skipped})+
   "; previous snapshot retained");
 const report={schemaVersion:1,generatedAt:at,sourceObservedAt,provider:"prizepicksapi.com",
   source:"prizepicks",independentProvider:true,pagesFetched,totalOffers:offers.length,
   normalizedRows:rows.length,skipped,completePagination:true,sourceStatus:"fresh",
   pageView:"compact",pageLimit:PAGE_LIMIT,maxPages:MAX_PAGES,
   chargedCredits,quotaUnit,creditsRemaining,
   safeForLiveUse:false,
   warning:"Third-party feed, not independently checked against PrizePicks; no verified hit rates or bets.",rows};
 const dir=path.resolve(__dirname,"../outputs/free-source/nhl");
 fs.mkdirSync(path.join(dir,"snapshots"),{recursive:true});
 const stamp=at.slice(0,19).replace(/[-:]/g,"")+"Z";
 fs.writeFileSync(path.join(dir,"snapshots",stamp+".json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
 fs.writeFileSync(path.join(dir,"latest.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({pages:pagesFetched,offers:offers.length,rows:rows.length,skipped,
  pageView:"compact",completePagination:true,providerRequests:pagesFetched,
  quotaUnit,chargedCredits,creditsRemaining,
  quotaPreflightRemaining:budget.creditsRemaining??budget.requestsRemaining,
  freeCoverageStableBeforeCapture:freeCoverage.ready,
  firstCoverageObservedAt:freeCoverage.firstObservedAt,
  lastCoverageObservedAt:freeCoverage.secondObservedAt}));
}
if(require.main===module)main().catch(e=>{
 if(e.captureDiagnostics){
  const dir=path.resolve(__dirname,"../outputs/health");
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"nhl-paid-capture-failure.json"),
   JSON.stringify({schemaVersion:1,recordedAt:new Date().toISOString(),
    ...e.captureDiagnostics,completeBoardPublished:false,
    eligibleProspectiveSelections:0,paidCaptureAutomaticallyRetried:false,
    originalPlatformAvailabilityVerified:false},null,2)+"\n");
 }
 console.error(e.message);process.exitCode=1;
});
module.exports={main,fetchCompleteBoard,preflightNhlQuota,preflightNhlBoardStability,
 PAGE_LIMIT,MAX_PAGES,MAX_CREDITS_PER_CAPTURE,MIN_CREDITS_RESERVE};
