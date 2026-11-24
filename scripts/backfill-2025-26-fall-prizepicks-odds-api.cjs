"use strict";
const fs=require("node:fs"),path=require("node:path");
const {canSpend:canSpendShared}=require("./oddsapi-shared-historical-budget.cjs");
const ROOT=path.resolve(__dirname,"../outputs/the-odds-api/nhl/2025-26-fall-backfill");
const DAYS=path.join(ROOT,"by-date"),PROGRESS=path.join(ROOT,"progress.json");
const API="https://api.the-odds-api.com/v4";
const START="2025-10-07",END="2025-12-31",AT="T21:00:00Z";
const MARKET="player_shots_on_goal_alternate";
const NIGHT_BUDGET=160,OVERALL_BUDGET=1000;
function dateRange(start,end){
 const out=[];
 for(let ms=Date.parse(start+"T00:00:00Z"),stop=Date.parse(end+"T00:00:00Z");ms<=stop;ms+=86400000)
  out.push(new Date(ms).toISOString().slice(0,10));
 return out;
}
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return fallback}};
function write(file,obj){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(obj,null,2)+"\n");
}
const headerNum=(headers,key)=>{
 const raw=headers?.get?.(key);
 const num=raw===null||raw===undefined?NaN:Number(raw);
 return Number.isFinite(num)&&num>=0?num:null;
};
async function request(endpoint,key,fetcher=fetch){
 const url=new URL(API+endpoint);url.searchParams.set("apiKey",key);
 const res=await fetcher(url,{signal:AbortSignal.timeout(25000)});
 let json=null;try{json=await res.json()}catch{}
 return {ok:res.ok,status:res.status,doc:json,
  last:headerNum(res.headers,"x-requests-last"),
  remaining:headerNum(res.headers,"x-requests-remaining"),
  errorCode:typeof json?.error_code==="string"?json.error_code:null};
}
function eventsFromResponse(data,date){
 const start=Date.parse(date+AT),stop=start+20*3600000,seen=new Set(),out=[];
 for(const e of data||[]){
  const t=Date.parse(e?.commence_time);
  if(typeof e?.id!=="string"||!/^[a-f0-9]{20,}$/i.test(e.id)||seen.has(e.id)||
    !Number.isFinite(t)||t<=start||t>=stop)continue;
  seen.add(e.id);
  out.push({id:e.id,startAt:e.commence_time,
   home:typeof e.home_team==="string"?e.home_team:null,
   away:typeof e.away_team==="string"?e.away_team:null,
   status:"pending",snapshotAt:null,offerCount:0,offers:[]});
 }
 out.sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt)||a.id.localeCompare(b.id));
 return out;
}
function extractOffers(body,game){
 const book=(body?.data?.bookmakers||[]).find(b=>b.key==="prizepicks");
 const markets=(book?.markets||[]).filter(m=>m.key===MARKET);
 const found=markets.flatMap(m=>m.outcomes||[]).filter(o=>
  ["Over","Under"].includes(o?.name)&&typeof o.description==="string"&&Number.isFinite(o.point));
 const snapshot=typeof body?.timestamp==="string"?body.timestamp:null;
 const pregame=Number.isFinite(Date.parse(snapshot))&&Date.parse(snapshot)<Date.parse(game.startAt);
 return {snapshotAt:snapshot,bookmakerPresent:!!book,quotes:found.map(o=>({
  book:"prizepicks",source:"The Odds API independent archived historical snapshot",
  market:MARKET,player:o.description,side:o.name,line:o.point,
  indicativeAmericanPrice:Number.isFinite(o.price)?o.price:null,
  sourceProvidedMultiplier:Number.isFinite(o.multiplier)?o.multiplier:null,
  oddsProviderObservedAt:snapshot,gameStartsAt:game.startAt,
  verifiedPregameProviderQuote:pregame,
  originalPrizePicksTier:null,originalPayoutMultiplierVerified:false,
  prizePicksOriginalProjectionId:null,completeIntradayMovementVerified:false
 }))};
}
function baseProgress(){
 return {schemaVersion:1,season:"2025-26",startDate:START,endDate:END,
  generatedAt:null,status:"in_progress",provider:"The Odds API",bookmaker:"prizepicks",
  requestedMarket:MARKET,snapshotClockUtc:"21:00:00",
  perRunCreditCap:NIGHT_BUDGET,totalCreditCap:OVERALL_BUDGET,
  creditsSpentTotal:0,lastRunCredits:0,requestsToday:0,
  dateWindowsCompleted:0,dateWindowsStarted:0,eventQuotesChecked:0,
  gamesWithBookmakerPresent:0,archivedOfferRows:0,
  independentSourceOnly:true,verifiedOriginalPrizePicksExport:false,
  originalGoblinDemonTiersVerified:false,actualPayoutMultipliersVerified:false,
  prospectivePredictionAccuracyVerified:false,
  warning:"Incremental single-snapshot per NHL date, typically one 21:00 UTC as-of time. A missing quote does not establish no PrizePicks offer. A historical book label is NOT first-party source verification, and indicative odds are NOT the original tier or lineup payout."};
}
function summarize(progress){
 const dates=dateRange(START,END);
 let completed=0,started=0,events=0,withBook=0,offers=0;
 for(const date of dates){
  const d=read(path.join(DAYS,date+".json"),null);
  if(!d)continue;started++;
  if(d.complete===true)completed++;
  for(const e of d.events||[]){
   if(e.status==="captured"){events++;if(e.bookmakerPresent){withBook++;offers+=e.offers.length}}
  }
 }
 Object.assign(progress,{generatedAt:new Date().toISOString(),dateWindowsCompleted:completed,
  dateWindowsStarted:started,eventQuotesChecked:events,
  gamesWithBookmakerPresent:withBook,archivedOfferRows:offers});
 if(completed===dates.length)progress.status="complete";
 else if(progress.creditsSpentTotal>=OVERALL_BUDGET-11)progress.status="budget_exhausted";
 return progress;
}
async function backfill(key,client=fetch,options={}){
 let progress=read(PROGRESS,baseProgress());
 if(!key){progress.status="missing_ODDS_API_KEY";return summarize(progress)}
 if(progress.status==="blocked"&&progress.lastError==="account_http_404"&&progress.creditsSpentTotal===0){progress.status="in_progress";delete progress.lastError;}
 if(["complete","budget_exhausted","blocked"].includes(progress.status))return summarize(progress);
 if(!Number.isInteger(progress.creditsSpentTotal)||progress.creditsSpentTotal<0)
  throw Error("Untrustworthy archived progress credit usage");
 const account=await request("/sports",key,client);
 if(!account.ok){progress.status="blocked";progress.lastError="account_http_"+account.status;return summarize(progress)}
 const available=account.remaining;
 if(available===null||available<350){progress.status="blocked";progress.lastError="insufficient_or_unknown_credits";return summarize(progress)}
 progress.status="in_progress";
 let used=0,requests=1,remaining=available;
 for(const day of dateRange(START,END)){
  const filepath=path.join(DAYS,day+".json");
  let doc=read(filepath,null);
  if(doc?.complete===true)continue;
  if(used+12>NIGHT_BUDGET||progress.creditsSpentTotal+used+12>OVERALL_BUDGET)break;
  if(!doc){
   if(!canSpendShared(1,{fallUncommitted:used,accountRemaining:remaining}).allowed){
    progress.status="shared_budget_paused";break;
   }
   const events=await request("/historical/sports/icehockey_nhl/events?date="+encodeURIComponent(day+AT),key,client);
   requests++;used+=events.last??1;
   if(events.remaining!==null)remaining=events.remaining;
   if(!events.ok){progress.status="blocked";progress.lastError="historical_event_http_"+events.status;break}
   if(!Array.isArray(events.doc?.data)){progress.status="blocked";progress.lastError="invalid_historical_event_list";break}
   doc={schemaVersion:1,provider:"The Odds API",season:"2025-26",day,
    requestedAsOf:day+AT,sourceArchiveTimestamp:events.doc.timestamp||null,
    complete:false,events:eventsFromResponse(events.doc.data,day),
    bookmaker:"prizepicks",sourceOriginalPlatform:false,tierVerified:false,
    actualPayoutVerified:false,oneAsOfPerDate:true};
   write(filepath,doc);
  }
  let interrupted=false;
  for(const event of doc.events){
   if(event.status==="captured")continue;
   if(used+12>NIGHT_BUDGET||progress.creditsSpentTotal+used+12>OVERALL_BUDGET){interrupted=true;break}
   if(!canSpendShared(10,{fallUncommitted:used,accountRemaining:remaining}).allowed){
    progress.status="shared_budget_paused";interrupted=true;break;
   }
   const suffix="/historical/sports/icehockey_nhl/events/"+event.id+"/odds";
   const p=new URLSearchParams({date:day+AT,bookmakers:"prizepicks",markets:MARKET,
     includeMultipliers:"true",oddsFormat:"american"});
   const res=await request(suffix+"?"+p,key,client);
   requests++;used+=res.last??10;
   if(res.remaining!==null)remaining=res.remaining;
   if(!res.ok){
    progress.lastError="historical_props_http_"+res.status;
    if(res.status===429||res.status===401||res.status===403)progress.status="blocked";
    else progress.status="error_retry_later";
    interrupted=true;break;
   }
   const {snapshotAt,bookmakerPresent,quotes}=extractOffers(res.doc,event);
   Object.assign(event,{status:"captured",snapshotAt,bookmakerPresent,
    offerCount:quotes.length,offers:quotes});
   write(filepath,doc);
   if(res.last!==null&&res.last>12){interrupted=true;progress.lastError="unexpected_market_credit_cost";break}
  }
  if(!interrupted&&doc.events.every(e=>e.status==="captured")){doc.complete=true;write(filepath,doc)}
  if(interrupted)break;
 }
 progress.creditsSpentTotal+=used;
 progress.lastRunCredits=used;
 progress.requestsToday=requests;
 if(progress.status==="error_retry_later")progress.status="in_progress";
 progress.accountCreditsAfterLastRequest=remaining;
 progress.sharedHistoricalBudgetPolicy="2025-26 fall + all NHL markets <=2500 combined, minimum 350 provider credits reserved";
 summarize(progress);
 if(progress.status==="in_progress"&&progress.creditsSpentTotal>=OVERALL_BUDGET-11)
  progress.status="budget_exhausted";
 write(PROGRESS,progress);
 return progress;
}
async function main(){
 const progress=await backfill(process.env.ODDS_API_KEY);
 write(PROGRESS,progress);
 console.log(JSON.stringify({status:progress.status,creditsSpentThisRun:progress.lastRunCredits,
  totalCredits:progress.creditsSpentTotal,budget:progress.totalCreditCap,
  daysCompleted:progress.dateWindowsCompleted,daysStarted:progress.dateWindowsStarted,
  gamesChecked:progress.eventQuotesChecked,bookmakerGames:progress.gamesWithBookmakerPresent,
  quotedOffers:progress.archivedOfferRows,error:progress.lastError||null}));
 if(progress.status==="blocked")process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error("Bounded NHL historical archive failed:",e.name);process.exitCode=1});
module.exports={dateRange,eventsFromResponse,extractOffers,backfill,baseProgress,request};
