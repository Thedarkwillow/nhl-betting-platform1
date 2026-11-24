"use strict";
const {assertPrizePicksApiAllowed}=require("../src/prizepicksapi-november-quota-lock.cjs");
/**
 * One-off fixed-time NHL provider board capture. /projections is live per page;
 * /board?as_of= is a documented, point-in-time reconstruction. All pages use
 * an identical as_of timestamp. Fail closed if any page/credit is unverified.
 */
const fs=require("node:fs"),path=require("node:path");
const {providerUsage,cleanProviderError,USER_CONTEXT}=require("../src/prizepicksapi-nhl-request.cjs");
const {preflightNhlQuota,preflightNhlBoardStability}=require("./collect-prizepicks-free-api.cjs");
const {normalizeProjections}=require("../src/prizepicksapi-normalize.cjs");
const PAGE_LIMIT=200,MAX_PAGES=30,MAX_CREDITS=60,MIN_RESERVE=20;
async function requestAsOfPage(key,{asOf,cursor=null,limit=PAGE_LIMIT,client=fetch,page=1,
 wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 if(typeof key!=="string"||!key.trim())throw Error("Missing PRIZEPICKSAPI_KEY");
 if(!Number.isFinite(Date.parse(asOf)))throw Error("Invalid immutable as_of time");
 if(!Number.isInteger(limit)||limit<1||limit>PAGE_LIMIT)throw Error("Unsafe board page limit");
 if(cursor!==null&&(typeof cursor!=="string"||!/^[!-~]{1,200}$/.test(cursor)))
  throw Error("Unsafe board cursor");
 const url=new URL("https://prizepicksapi.com/api/v1/board");
 url.searchParams.set("league","NHL");
 url.searchParams.set("as_of",asOf);
 url.searchParams.set("limit",String(limit));
 if(cursor!==null)url.searchParams.set("cursor",cursor);
 let res;
 for(let attempt=0;attempt<3;attempt++){
  res=await client(url,{method:"GET",headers:{Authorization:"Bearer "+key,
   Accept:"application/json","X-User-Request":USER_CONTEXT},
   signal:AbortSignal.timeout(30000)});
  // Retry only transient 503, never 400, 401, 403, 429 or paid successes.
  // No provider quote rows are combined across attempts.
  if(res?.ok||res?.status!==503||attempt===2)break;
  await wait(1000*(attempt+1));
 }
 if(!res?.ok){
  let body=null;try{body=await res.json();}catch{}
  throw cleanProviderError(res?.status,body,{page,hasCursor:cursor!==null});
 }
 const document=await res.json();
 return {document,usage:providerUsage(res.headers)};
}
async function fetchAsOfBoard(key,{at=new Date().toISOString(),
 pageLimit=PAGE_LIMIT,maxPages=MAX_PAGES,fetchPage=requestAsOfPage,clock=Date.now}={}){
 const asOf=new Date(at).toISOString();
 if(!Number.isInteger(pageLimit)||pageLimit<1||pageLimit>PAGE_LIMIT||
    !Number.isInteger(maxPages)||maxPages<1||maxPages>MAX_PAGES)
  throw Error("Unsafe as-of budget configuration");
 let cursor=null,chargedCredits=0,quota=null,sourceObservedAt=null;
 const seenCursors=new Set(),seenIds=new Set(),offers=[];
 for(let pageNumber=1;pageNumber<=maxPages;pageNumber++){
  const result=await fetchPage(key,{asOf,limit:pageLimit,cursor,page:pageNumber});
  const {document,usage}=result||{},meta=document?.meta||{};
  if(usage?.unit==="credits"){
   if(!Number.isInteger(usage.creditsRemaining)||
      !Number.isInteger(usage.creditsCost)||usage.creditsCost<0||
      usage.creditsCost>Math.ceil(pageLimit/100))
    throw Error("Unverified board credits; archive unchanged");
   chargedCredits+=usage.creditsCost;
   if(chargedCredits>MAX_CREDITS)throw Error("Full board would exceed credit cap");
  }else if(usage?.unit==="requests"){
   if(!Number.isInteger(usage.requestsRemaining))
    throw Error("Unverified board request allowance; archive unchanged");
  }else throw Error("Unverified board quota unit; archive unchanged");
  quota=usage;
  // /board is fixed by the echoed as_of; envelope observed_at is the
  // latest live board refresh, NOT the timestamp of the historical replay.
  // Keep both clocks explicit. Never accept a different pin or stale,
  // partial, demo, plan-truncated or future-dated source response.
  const receivedAt=clock(),metaObserved=Date.parse(meta.observed_at),pin=Date.parse(asOf);
  if(Date.parse(meta.as_of)!==pin||meta.plan_limit!=null)
    throw Error("Immutable NHL board pin mismatch or plan truncation");
  if(meta.mode!=="live"||meta.source_status!=="fresh"||
     !Number.isFinite(receivedAt)||receivedAt<pin||receivedAt-pin>300000||
     !Number.isFinite(metaObserved)||metaObserved>receivedAt+1000||
     receivedAt-metaObserved>1800000)
    throw Error("As-of NHL provider board is not fresh and live; archive unchanged");
  if(!Array.isArray(document.data)||document.data.length>pageLimit)
    throw Error("Malformed immutable NHL board page");
  for(const offer of document.data){
   if(typeof offer?.id!=="string"||seenIds.has(offer.id)||
     !Number.isFinite(Date.parse(offer.observed_at))||
     Date.parse(offer.observed_at)>Date.parse(asOf)+1000)
    throw Error("Duplicate, unidentified or future NHL offer in immutable snapshot");
   seenIds.add(offer.id);
   offers.push(offer);
  }
  if(sourceObservedAt===null)sourceObservedAt=meta.observed_at;
  const next=meta.next_cursor??null;
  if(next===null){
   return {offers,asOf,pagesFetched:pageNumber,
    sourceObservedAt,chargedCredits,quotaUnit:usage.unit,
    creditsRemaining:usage.creditsRemaining??null,completePagination:true};
  }
  if(document.data.length===0||typeof next!=="string"||
      !/^[!-~]{1,200}$/.test(next)||seenCursors.has(next))
   throw Error("Malformed or repeated as-of board pagination cursor");
  seenCursors.add(next);
  if(pageNumber===maxPages)
   throw Error("As-of NHL board exceeds bounded pagination cap; archive unchanged");
  if(usage.unit==="credits"&&
     (chargedCredits+Math.ceil(pageLimit/100)>MAX_CREDITS||
      usage.creditsRemaining<Math.ceil(pageLimit/100)+MIN_RESERVE))
   throw Error("Insufficient credits for next immutable board page; archive unchanged");
  if(usage.unit==="requests"&&usage.requestsRemaining<2)
   throw Error("Insufficient requests for next immutable board page; archive unchanged");
  cursor=next;
 }
 throw Error("Immutable NHL board pagination incomplete");
}
async function main(){
 assertPrizePicksApiAllowed();
 const key=process.env.PRIZEPICKSAPI_KEY;
 const quota=await preflightNhlQuota(key);
 const stable=await preflightNhlBoardStability(key,{initial:quota.coverageDocument});
 const startedAt=new Date().toISOString();
 const capture=await fetchAsOfBoard(key,{at:startedAt});
 const completedAt=new Date().toISOString();
 const {rows,skipped}=normalizeProjections(capture.offers,completedAt,
  {validatedAsOfAt:capture.asOf});
 if(skipped.invalid>Math.max(5,Math.floor(capture.offers.length*.05)))
  throw Error("Immutable board has missing identity fields; archive unchanged");
 if(!rows.length)throw Error("No usable pregame NHL offers; archive unchanged");
 const requestedSlot=process.env.NHL_CAPTURE_SLOT||null;
 if(requestedSlot!==null&&!["06:00","09:00"].includes(requestedSlot))
  throw Error("Unsupported scheduled capture slot");
 const pacificParts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
  hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(completedAt));
 const localHour=Number(pacificParts.find(x=>x.type==="hour")?.value);
 const localMinute=Number(pacificParts.find(x=>x.type==="minute")?.value);
 const localMinutes=localHour*60+localMinute;
 const expectedMinutes=requestedSlot==="06:00"?360:requestedSlot==="09:00"?540:null;
 const capturedInTargetWindow=expectedMinutes===null?null:
  localMinutes>=expectedMinutes&&localMinutes<expectedMinutes+60;
 const report={schemaVersion:1,generatedAt:completedAt,
  requestedScheduledSlotPacific:requestedSlot,
  capturedInTargetWindow,
  sourceObservedAt:stable.secondObservedAt,firstPageLatestRefreshAt:capture.sourceObservedAt,boardAsOfAt:capture.asOf,
  snapshotMode:"immutable_as_of",provider:"prizepicksapi.com",source:"prizepicks",
  independentProvider:true,pagesFetched:capture.pagesFetched,
  totalOffers:capture.offers.length,normalizedRows:rows.length,skipped,
  completePagination:true,sourceStatus:"fresh",pageView:"full",
  pageLimit:PAGE_LIMIT,maxPages:MAX_PAGES,
  chargedCredits:capture.chargedCredits,quotaUnit:capture.quotaUnit,
  creditsRemaining:capture.creditsRemaining,safeForLiveUse:false,
  warning:"Independent third-party reconstructed board, not authenticated PrizePicks live offer; no wagers.",rows};
 const folder=path.resolve(__dirname,"../outputs/free-source/nhl");
 fs.mkdirSync(path.join(folder,"snapshots"),{recursive:true});
 const stamp=completedAt.slice(0,19).replace(/[-:]/g,"")+"Z";
 fs.writeFileSync(path.join(folder,"snapshots",stamp+".json"),
  JSON.stringify(report,null,2)+"\n",{flag:"wx"});
 fs.writeFileSync(path.join(folder,"latest.json"),JSON.stringify(report,null,2)+"\n");
 // Preserve all source-side offers in the private backend for later audits.
 // Public site exports remain sanitized and do not read raw snapshots.
 const rawDir=path.join(folder,"raw-snapshots");
 fs.mkdirSync(rawDir,{recursive:true});
 fs.writeFileSync(path.join(rawDir,stamp+".json"),
  JSON.stringify({kind:"independent_nhl_asof_original_offers_v1",
   capturedAt:completedAt,boardAsOfAt:capture.asOf,provider:"prizepicksapi.com",
   pagesFetched:capture.pagesFetched,completePagination:true,
   offers:capture.offers},null,2)+"\n",{flag:"wx"});
 console.log(JSON.stringify({status:"saved",snapshotMode:"immutable_as_of",
  boardAsOfAt:capture.asOf,capturedAt:completedAt,
  offers:capture.offers.length,rows:rows.length,pages:capture.pagesFetched,
  completePagination:true,sourceStatus:"fresh",chargedCredits:capture.chargedCredits,
  quotaUnit:capture.quotaUnit,creditsRemaining:capture.creditsRemaining,
  freeCoverageStableBeforeCapture:stable.ready}));
}
if(require.main===module)main().catch(error=>{
 console.error(error.message);process.exitCode=1;
});
module.exports={PAGE_LIMIT,MAX_PAGES,fetchAsOfBoard,requestAsOfPage,main};
