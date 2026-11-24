"use strict";
/**
 * Immutable, private NFL PrizePicksAPI as-of board; separate 06:00 and 09:00 Pacific.
 * No first-party authentication claim. Never place wagers or generate picks.
 * Requires provider credits sufficient for an ENTIRE NFL board before first billable call.
 */
const fs=require("node:fs"),path=require("node:path");
const {providerUsage,cleanProviderError,USER_CONTEXT}=require("../src/prizepicksapi-nhl-request.cjs");
const {classifyMarket}=require("../src/nfl-market-registry.cjs");
const ROOT=path.resolve(__dirname,"..");
const API="https://prizepicksapi.com/api/v1";
const MAX_CREDITS=160,MIN_RESERVE=40,PAGE_SIZE=1000,MAX_PAGES=20;
const SLOTS=Object.freeze({"06:00":"0600","09:00":"0900"});
function pacificClock(date){
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",
  hourCycle:"h23"}).formatToParts(date);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return {date:p.year+"-"+p.month+"-"+p.day,minutes:Number(p.hour)*60+Number(p.minute)};
}
function requireSlot(slot,clock){
 if(!SLOTS[slot])throw Error("NFL_CAPTURE_SLOT must be 06:00 or 09:00");
 const expected=slot==="06:00"?360:540;
 if(clock.minutes<expected||clock.minutes>=expected+60)
  throw Error("Outside authentic "+slot+" Pacific source window; zero paid NFL calls");
}
function capturePath(date,slot){return path.join(ROOT,"outputs/nfl/boards",date,SLOTS[slot]+".json");}
async function request(key,endpoint,params={},client=fetch){
 const u=new URL(API+endpoint);
 for(const [k,v] of Object.entries(params))if(v!==null)u.searchParams.set(k,String(v));
 const r=await client(u,{method:"GET",headers:{Authorization:"Bearer "+key,
  Accept:"application/json","X-User-Request":USER_CONTEXT},signal:AbortSignal.timeout(30000)});
 if(!r?.ok){
  let body;try{body=await r.json();}catch{}
  throw cleanProviderError(r?.status,body,{hasCursor:params.cursor!==null});
 }
 return {body:await r.json(),usage:providerUsage(r.headers)};
}
async function fetchComplete(key,{at=new Date().toISOString(),requester=request}={}){
 if(!key)throw Error("Missing PRIZEPICKSAPI_KEY; zero paid NFL calls");
 const pre=await requester(key,"/coverage");
 const usage=pre.usage;
 // Without a verified reserve covering ALL expected pages, do not even start.
 if(usage?.unit==="credits"){
  if(!Number.isInteger(usage.creditsRemaining)||usage.creditsRemaining<MAX_CREDITS+MIN_RESERVE)
   throw Error("NFL quota preflight blocked: full-board reserve unavailable; zero paid board calls");
 }else if(usage?.unit==="requests"){
  if(!Number.isInteger(usage.requestsRemaining)||usage.requestsRemaining<MAX_PAGES+10)
   throw Error("NFL request preflight blocked: insufficient allowance");
 }else throw Error("NFL quota unit unverified; zero paid board calls");
 const items=[],ids=new Set(),cursors=new Set();
 let cursor=null,cost=0,pages=0,observedAt=null;
 for(let n=1;n<=MAX_PAGES;n++){
  const page=await requester(key,"/board",{league:"NFL",as_of:at,view:"compact",limit:PAGE_SIZE,cursor});
  const m=page.body?.meta||{},v=page.usage;
  if(v?.unit!==usage.unit)throw Error("NFL quota unit changed mid capture; discard board");
  if(v.unit==="credits"){
   if(!Number.isInteger(v.creditsCost)||v.creditsCost<0||v.creditsCost>10||
      !Number.isInteger(v.creditsRemaining))throw Error("Invalid NFL billing evidence");
   cost+=v.creditsCost;
   if(cost>MAX_CREDITS)throw Error("NFL board credit cap exceeded");
  }else if(!Number.isInteger(v.requestsRemaining))throw Error("Missing NFL request budget");
  if(m.mode!=="live"||m.source_status!=="fresh"||
   !Number.isFinite(Date.parse(m.observed_at))||
   Date.parse(m.observed_at)>Date.parse(at)+60000||
   Date.parse(at)-Date.parse(m.observed_at)>30*60000)
   throw Error("NFL as-of provider snapshot stale or not verified live");
  if(!Array.isArray(page.body.data)||page.body.data.length>PAGE_SIZE)
   throw Error("Malformed NFL provider board page");
  if(observedAt===null)observedAt=m.observed_at;
  for(const p of page.body.data){
   if(p?.league!=="NFL"||p?.status!=="active"||p?.is_demo===true||
    (p?.source!==undefined&&p.source!=="prizepicks")||
    typeof p.id!=="string"||ids.has(p.id)||
    !Number.isFinite(Date.parse(p.observed_at))||
    Date.parse(p.observed_at)>Date.parse(at)+1000)
     throw Error("Malformed, duplicated or future NFL provider offer");
   ids.add(p.id);items.push(p);
  }
  pages=n;
  const next=m.next_cursor??null;
  if(next===null)return {items,pages,cost,observedAt,quotaUnit:v.unit,
   creditsRemaining:v.creditsRemaining??null,completePagination:true};
  if(page.body.data.length===0||typeof next!=="string"||
   !/^[!-~]{1,200}$/.test(next)||cursors.has(next))
    throw Error("Invalid NFL provider pagination cursor");
  cursors.add(next);
  if(n===MAX_PAGES)throw Error("NFL full board exceeded bounded page ceiling");
  if(v.unit==="credits"&&(cost+10>MAX_CREDITS||
   v.creditsRemaining<10+MIN_RESERVE))
   throw Error("NFL full-board quote budget exhausted: archive unchanged");
  if(v.unit==="requests"&&v.requestsRemaining<2)
   throw Error("NFL full-board request budget exhausted");
  cursor=next;
 }
 throw Error("Incomplete NFL board");
}
function summarize(offers,at){
 const parsed=[],unknown={};
 let futureOffers=0,started=0,invalid=0;
 for(const p of offers){
  const compact=typeof p.player==="string";
  const label=compact?p.stat:p.market?.stat;
  const player=compact?p.player:p.player?.name,team=compact?p.team:p.player?.team;
  const startsAt=compact?p.starts_at:p.event?.starts_at;
  const period=compact?p.period:p.market?.period;
  const sel=compact?(p.sides||[]).map(side=>({side,tier:p.tier,available:true})):p.selections;
  if(typeof label!=="string"||typeof player!=="string"||
     typeof team!=="string"||!Number.isFinite(p.line)||
     !Number.isFinite(Date.parse(startsAt))||!Array.isArray(sel)){
    invalid++;continue;
  }
  if(Date.parse(startsAt)<=Date.parse(at)){started++;continue;}
  futureOffers++;
  const found=classifyMarket("prizepicks",label,{period,
   observedAt:p.observed_at,participants:1});
  if(found.status!=="recognized_research_only")unknown[label]=(unknown[label]||0)+1;
  const sides=sel.filter(s=>s?.available===true&&
    ["more","less"].includes(String(s.side).toLowerCase())&&
    ["standard","goblin","demon"].includes(String(s.tier).toLowerCase())&&
    (String(s.tier).toLowerCase()==="standard"||String(s.side).toLowerCase()==="more"))
   .map(s=>({side:s.side,tier:s.tier}));
  parsed.push({id:p.id,player,team,market:label,marketId:found.marketId??found.id??null,
   marketClassification:found.status,period:period??null,startsAt,line:p.line,
   observedAt:p.observed_at,sides,playerId:compact?p.player_id??null:p.player?.id??null,
   opponent:compact?p.opponent??null:p.event?.opponent??null});
 }
 return {offers:parsed,futureOffers,startedOffers:started,invalidOffers:invalid,
  unmappedMarkets:unknown,unmappedCount:Object.values(unknown).reduce((a,b)=>a+b,0)};
}
async function capture(slot,{now=new Date(),key=process.env.PRIZEPICKSAPI_KEY,
 fetcher=fetchComplete,save=true}={}){
 const clock=pacificClock(now);requireSlot(slot,clock);
 const dest=capturePath(clock.date,slot);
 if(fs.existsSync(dest))return {status:"already_archived",path:dest,date:clock.date,slot};
 const asOf=now.toISOString();
 const full=await fetcher(key,{at:asOf});
 if(!full.completePagination||!full.items?.length)
  throw Error("NFL complete board not returned; previous archive unchanged");
 const summary=summarize(full.items,asOf);
 if(summary.invalidOffers>Math.max(10,Math.floor(full.items.length*.05)))
  throw Error("NFL offer identity completeness failure; do not archive");
 const finished=new Date();
 requireSlot(slot,pacificClock(finished));
 const report={schemaVersion:1,kind:"nfl_independent_prizepicksapi_board",
  platform:"prizepicks",provider:"prizepicksapi.com",datePacific:clock.date,slotPacific:slot,
  requestedAt:asOf,capturedAt:finished.toISOString(),
  providerObservedAt:full.observedAt,completePagination:true,
  rawOfferCount:full.items.length,pagesFetched:full.pages,chargedCredits:full.cost,
  quotaUnit:full.quotaUnit,creditsRemaining:full.creditsRemaining,
  sourceAuthenticatedFirstParty:false,liveOriginalPlatformAvailabilityVerified:false,
  validProspectivePicks:0,commercialDisplayApproved:false,
  isResearchOnly:true, rawProviderOffers:full.items, ...summary};
 if(save){
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
 }
 return {status:"saved",path:dest,date:clock.date,slot,
  rawOffers:full.items.length,normalizedFutureOffers:summary.offers.length,
  unknown:summary.unmappedCount,credits:full.cost,pages:full.pages};
}
async function main(){
 const slot=process.env.NFL_CAPTURE_SLOT;
 try{console.log(JSON.stringify(await capture(slot)));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
if(require.main===module)main();
module.exports={pacificClock,requireSlot,capturePath,fetchComplete,summarize,capture};
