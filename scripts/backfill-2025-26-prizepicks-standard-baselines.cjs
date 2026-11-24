"use strict";
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const ALT_DIR=path.join(ROOT,"outputs/the-odds-api/nhl/2025-26-fall-backfill/by-date");
const ALT_SAMPLES=path.join(ROOT,"outputs/the-odds-api/nhl/prizepicks-2025-26-opening-probe-latest.json");
const BASE=path.join(ROOT,"outputs/the-odds-api/nhl/2025-26-standard-baselines");
const BASE_DIR=path.join(BASE,"by-event");
const PROGRESS=path.join(BASE,"progress.json");
const API="https://api.the-odds-api.com/v4";
const PER_RUN=100,OVERALL=500,MAX_REQUEST_COST=10,RESERVE=100;
const MARKET="player_shots_on_goal";
const ALT_MARKET="player_shots_on_goal_alternate";
const read=(file,fallback=null)=>{try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return fallback}};
function write(file,obj){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(obj,null,2)+"\n");
}
function headerNumber(headers,key){
 const raw=headers?.get?.(key);
 if(raw===null||raw===undefined)return null;
 const n=Number(raw);return Number.isFinite(n)&&n>=0?n:null;
}
async function request(endpoint,key,client=fetch){
 const u=new URL(API+endpoint);
 u.searchParams.set("apiKey",key);
 const response=await client(u,{signal:AbortSignal.timeout(25000)});
 let doc=null;try{doc=await response.json()}catch{}
 return {ok:response.ok,status:response.status,body:doc,
  last:headerNumber(response.headers,"x-requests-last"),
  remaining:headerNumber(response.headers,"x-requests-remaining"),
  errorCode:typeof doc?.error_code==="string"?doc.error_code:null};
}
function inputs(){
 const out=new Map();
 function insert(item){
  if(!/^[a-f0-9]{20,}$/i.test(item?.eventId||"")||!item.requestedAt||!item.startAt)return;
  const start=Date.parse(item.startAt),at=Date.parse(item.requestedAt);
  if(!Number.isFinite(start)||!Number.isFinite(at)||at>=start)return;
  const id=item.eventId+"_"+item.requestedAt.replace(/[^0-9]/g,"");
  const previous=out.get(id);
  if(!previous||previous.source==="opening_sample")out.set(id,{...item,id});
 }
 if(fs.existsSync(ALT_DIR)){
  for(const f of fs.readdirSync(ALT_DIR).filter(s=>s.endsWith(".json")).sort()){
   const day=read(path.join(ALT_DIR,f));
   if(day?.season!=="2025-26")continue;
   for(const event of day.events||[]){
    if(event.status!=="captured")continue;
    insert({eventId:event.id,requestedAt:day.requestedAsOf,
      alternateObservedAt:event.snapshotAt,
      startAt:event.startAt,home:event.home,away:event.away,
      altOffers:event.offers||[],source:"fall_backfill"});
   }
  }
 }
 const sample=read(ALT_SAMPLES);
 for(const block of sample?.results||[]){
  if(block.season!=="2025-26"||block.status!=="prizepicks_in_sample")continue;
  insert({eventId:block.eventId,requestedAt:block.snapshotRequested,
   alternateObservedAt:block.actualSnapshotTimestamp,startAt:block.eventStart,
   altOffers:(block.datedOfferRecords||[]).map(r=>({
    player:r.player,side:r.side,line:r.line,market:r.market,
    indicativeAmericanPrice:r.indicativePrice,
    oddsProviderObservedAt:block.actualSnapshotTimestamp
   })),source:"opening_sample"});
 }
 return [...out.values()].sort((a,b)=>a.requestedAt.localeCompare(b.requestedAt)||
  a.eventId.localeCompare(b.eventId));
}
function parseStandard(doc,item){
 const books=(doc?.data?.bookmakers||[]).filter(x=>x.key==="prizepicks");
 const markets=books.flatMap(b=>(b.markets||[]).filter(m=>m.key===MARKET));
 const stamp=typeof doc?.timestamp==="string"?doc.timestamp:null;
 const validStamp=Number.isFinite(Date.parse(stamp))&&
  Date.parse(stamp)<=Date.parse(item.requestedAt)&&
  Date.parse(stamp)<Date.parse(item.startAt);
 const quotes=[];
 if(validStamp){
  for(const m of markets)for(const o of m.outcomes||[]){
   if(!["Over","Under"].includes(o?.name)||typeof o.description!=="string"||
     !Number.isFinite(o.point))continue;
   quotes.push({player:o.description,side:o.name,market:MARKET,line:o.point,
    indicativeAmericanPrice:Number.isFinite(o.price)?o.price:null,
    sourceProvidedMultiplier:Number.isFinite(o.multiplier)?o.multiplier:null,
    sourceSnapshotAt:stamp,provider:"The Odds API",
    bookmaker:"prizepicks",originalPrizePicksStandardTierVerified:false,
    originalPlatformProjectionId:null,payoutMultiplierVerified:false});
  }
 }
 return {schemaVersion:1,season:"2025-26",eventId:item.eventId,
  requestedAsOf:item.requestedAt,sourceSnapshotAt:stamp,gameStartsAt:item.startAt,
  alternateSnapshotAt:item.alternateObservedAt,
  source: "The Odds API archived PrizePicks bookmaker-labelled standard NHL shots market",
  historicalStandardMarketKey:MARKET,bookmakerPresent:books.length>0,
  standardMarketPresent:markets.length>0,validPregameArchiveTimestamp:validStamp,
  originalPrizePicksStandardTierVerified:false,originalPlatformPayoutVerified:false,
  originalFirstPartyPlatformData:false,status:"captured",quotes};
}
function initial(){
 return {schemaVersion:1,season:"2025-26",
  generatedAt:null,status:"in_progress",perRunCreditCap:PER_RUN,
  totalCreditCap:OVERALL,creditsSpentTotal:0,creditsSpentLastRun:0,
  sourceEventsEligible:0,eventsChecked:0,
  gamesWithStandardMarket:0,standardQuoteRecords:0,
  sourceProvenance:"Independent historical The Odds API bookmaker-labelled PrizePicks market",
  market:MARKET,snapshotStrategy:"same requested as-of time as archived alternate market",
  sourceOriginalPlatformVerified:false,actualLineupPayoutVerified:false,
  warning:"Historical Standard-market quotes are labelled by an independent provider, not authenticated original PrizePicks offers. Same-time comparison with alt market is a directional indicator, not proof of original tier or payout."};
}
function tally(progress,source){
 const list=source||inputs();let checked=0,books=0,lines=0;
 for(const row of list){
  const item=read(path.join(BASE_DIR,row.id+".json"));
  if(item?.status!=="captured")continue;
  checked++;if(item.standardMarketPresent)books++;
  lines+=(item.quotes||[]).length;
 }
 return Object.assign(progress,{generatedAt:new Date().toISOString(),
  sourceEventsEligible:list.length,eventsChecked:checked,
  gamesWithStandardMarket:books,standardQuoteRecords:lines,
  status:checked===list.length&&list.length>0?"caught_up":
    progress.creditsSpentTotal>=OVERALL?"budget_exhausted":progress.status});
}
async function run(key,client=fetch,source){
 const candidates=source||inputs();
 const p=read(PROGRESS,initial());
 p.status="in_progress";p.creditsSpentLastRun=0;
 if(!key){p.status="missing_ODDS_API_KEY";return tally(p,candidates)}
 if(p.creditsSpentTotal>=OVERALL){p.status="budget_exhausted";return tally(p,candidates)}
 const account=await request("/sports",key,client);
 if(!account.ok){p.status="account_http_"+account.status;return tally(p,candidates)}
 let remaining=account.remaining;
 if(remaining===null||remaining<RESERVE+PER_RUN){
  p.status="insufficient_or_unknown_quota";return tally(p,candidates);
 }
 let used=0;
 for(const item of candidates){
  if(read(path.join(BASE_DIR,item.id+".json"))?.status==="captured")continue;
  if(used+MAX_REQUEST_COST>PER_RUN||
    p.creditsSpentTotal+used+MAX_REQUEST_COST>OVERALL||
    remaining<RESERVE+MAX_REQUEST_COST)break;
  const query=new URLSearchParams({date:item.requestedAt,bookmakers:"prizepicks",
   markets:MARKET,includeMultipliers:"true",oddsFormat:"american"});
  const x=await request("/historical/sports/icehockey_nhl/events/"+
   item.eventId+"/odds?"+query.toString(),key,client);
  const cost=x.last??MAX_REQUEST_COST;
  used+=cost;
  if(x.remaining!==null)remaining=x.remaining;
  if(cost>MAX_REQUEST_COST){p.status="unexpected_market_cost";break}
  if(!x.ok){p.status="historical_http_"+x.status;break}
  const data=parseStandard(x.body,item);
  if(!data.validPregameArchiveTimestamp){p.status="invalid_historical_snapshot_time";break}
  write(path.join(BASE_DIR,item.id+".json"),data);
 }
 p.creditsSpentTotal+=used;
 p.creditsSpentLastRun=used;
 tally(p,candidates);
 if(p.creditsSpentTotal>=OVERALL)p.status="budget_exhausted";
 write(PROGRESS,p);
 return p;
}
async function main(){
 const p=await run(process.env.ODDS_API_KEY);
 write(PROGRESS,p);
 console.log(JSON.stringify({status:p.status,creditsThisRun:p.creditsSpentLastRun,
  creditsTotal:p.creditsSpentTotal,maxTotal:p.totalCreditCap,
  gamesChecked:p.eventsChecked,eligible:p.sourceEventsEligible,
  withStandard:p.gamesWithStandardMarket,standardQuotes:p.standardQuoteRecords}));
 if(p.status.startsWith("historical_http_")||p.status==="invalid_historical_snapshot_time"||
  p.status==="unexpected_market_cost")process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error("Standard historical backfill:",e.name);process.exitCode=1});
module.exports={inputs,parseStandard,request,tally,run,initial};
