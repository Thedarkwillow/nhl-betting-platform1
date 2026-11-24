"use strict";
const fs=require("node:fs"),path=require("node:path");
const OUT=path.resolve(__dirname,"../outputs/the-odds-api/nhl/prizepicks-2025-26-opening-probe-latest.json");
const SAMPLES=[{season:"2025-26",date:"2025-10-21T21:00:00Z",team:"Toronto"},
 {season:"2025-26",date:"2025-11-20T21:00:00Z",team:"New York"},
 {season:"2025-26",date:"2025-12-15T21:00:00Z",team:"Colorado"},
 {season:"2025-26",date:"2026-01-22T21:00:00Z",team:"Boston"}];
const base="https://api.the-odds-api.com/v4";
const quota=h=>{const v=h?.get?.("x-requests-remaining");return v==null?null:(Number.isFinite(+v)?+v:null)};
const spent=h=>{const v=h?.get?.("x-requests-last");return v==null?0:(Number.isFinite(+v)?+v:0)};
async function request(url,key,client=fetch){
 const u=new URL(url);u.searchParams.set("apiKey",key);
 const r=await client(u,{signal:AbortSignal.timeout(25000)});
 let body={};try{body=await r.json()}catch{}
 return {ok:r.ok,status:r.status,body,remaining:quota(r.headers),spent:spent(r.headers),
  errorCode:typeof body?.error_code==="string"?body.error_code:null};
}
function choose(events,sample){
 const start=Date.parse(sample.date);
 const eligible=(Array.isArray(events)?events:[]).filter(e=>
  /^[a-f0-9]{20,}$/i.test(e?.id||"")&&Date.parse(e.commence_time)>start&&
  Date.parse(e.commence_time)<start+20*3600000);
 eligible.sort((a,b)=>
  Number(!(a.home_team+" "+a.away_team).includes(sample.team))-
  Number(!(b.home_team+" "+b.away_team).includes(sample.team))||
  Date.parse(a.commence_time)-Date.parse(b.commence_time));
 return eligible[0]||null;
}
function extract(doc){
 const book=(doc?.data?.bookmakers||[]).find(b=>b.key==="prizepicks");
 const markets=(book?.markets||[]).filter(m=>m.key==="player_shots_on_goal_alternate");
 const outcomes=markets.flatMap(m=>m.outcomes||[]).filter(o=>
  ["Over","Under"].includes(o?.name)&&typeof o.description==="string"&&Number.isFinite(o.point));
 return {bookmakerPresent:!!book,marketPresent:markets.length>0,outcomeCount:outcomes.length,
  sourceMultiplierCount:outcomes.filter(o=>typeof o.multiplier==="number"&&Number.isFinite(o.multiplier)).length,
  datedOfferRecords:outcomes.map(o=>({player:o.description,side:o.name,market:"player_shots_on_goal_alternate",line:o.point,
   indicativePrice:Number.isFinite(o.price)?o.price:null,
   sourceMultiplier:Number.isFinite(o.multiplier)?o.multiplier:null,
   reportedStandardGoblinDemonTier:null,
   originalTierVerified:false,actualPrizePicksLineupPayoutVerified:false,
   sourceProvenance:"The Odds API archived bookmaker-labelled PrizePicks snapshot"})),
  examples:outcomes.slice(0,5).map(o=>({player:o.description,side:o.name,line:o.point,
   indicativePrice:Number.isFinite(o.price)?o.price:null,
   sourceMultiplier:Number.isFinite(o.multiplier)?o.multiplier:null,
   originalPrizePicksTierVerified:false,exactLineupPayoutVerified:false}))};
}
async function probe(key,client=fetch){
 const result={generatedAt:new Date().toISOString(),
  provider:"The Odds API v4",sport:"icehockey_nhl",bookmaker:"prizepicks",
  market:"player_shots_on_goal_alternate",includeMultipliers:true,
  maxPossibleCredits:55,creditsSpentObserved:0,status:"not_started",accountQuotaBefore:null,
  accountQuotaAfter:null,results:[],originalPrizePicksAPI:false,
  olderSeasonsFullArchiveVerified:false,historicalLineChangesComplete:false,
  originalTierAndPayoutVerified:false,
  warning:"Four single-event dated samples within 2025-26, NOT full season coverage. Historical provider snapshot records carry book and indicative price, not first-party tier or actual lineup payout. Keep original third-party records separate from SportsGameOdds. Do not infer Goblin/Demon solely from alt markets or odds."};
 if(!key){result.status="missing_ODDS_API_KEY";return result}
 const acct=await request(base+"/sports",key,client); // zero-credit endpoint
 result.accountQuotaBefore=acct.remaining;result.accountQuotaAfter=acct.remaining;
 if(!acct.ok){result.status="account_http_"+acct.status;result.errorCode=acct.errorCode;return result}
 if(acct.remaining===null||acct.remaining<100){result.status="insufficient_or_unknown_quota";return result}
 for(const sample of SAMPLES){
  if(result.creditsSpentObserved>45||result.accountQuotaAfter!==null&&result.accountQuotaAfter<100){
   result.status="credit_safety_stop";break;
  }
  const record={season:sample.season,snapshotRequested:sample.date,status:"not_started"};
  result.results.push(record);
  const events=await request(base+"/historical/sports/icehockey_nhl/events?date="+encodeURIComponent(sample.date),key,client);
  result.creditsSpentObserved+=events.spent;result.accountQuotaAfter=events.remaining;
  if(!events.ok){record.status="historical_events_http_"+events.status;record.errorCode=events.errorCode;
   result.status=events.errorCode==="HISTORICAL_UNAVAILABLE_ON_FREE_USAGE_PLAN"?
    "historical_plan_required":"historical_access_unavailable";break}
  record.eventsAvailable=Array.isArray(events.body?.data)?events.body.data.length:0;
  const ev=choose(events.body?.data,sample);
  if(!ev){record.status="no_event_found_in_sample";continue}
  record.eventId=ev.id;record.eventStart=ev.commence_time;
  const u=new URL(base+"/historical/sports/icehockey_nhl/events/"+ev.id+"/odds");
  for(const [k,v] of Object.entries({date:sample.date,bookmakers:"prizepicks",
   markets:"player_shots_on_goal_alternate",includeMultipliers:"true",oddsFormat:"american"}))
   u.searchParams.set(k,v);
  const odds=await request(u.toString(),key,client);
  result.creditsSpentObserved+=odds.spent;result.accountQuotaAfter=odds.remaining;
  if(!odds.ok){record.status="historical_odds_http_"+odds.status;record.errorCode=odds.errorCode;
   if(odds.errorCode==="HISTORICAL_UNAVAILABLE_ON_FREE_USAGE_PLAN"){
    result.status="historical_plan_required";break;
   }
   if(odds.status===429){result.status="quota_exhausted";break}continue}
  Object.assign(record,extract(odds.body));
  record.actualSnapshotTimestamp=odds.body?.timestamp??null;
  record.status=record.bookmakerPresent?"prizepicks_in_sample":"no_prizepicks_in_sample";
 }
 if(result.status==="not_started")result.status="probe_complete";
 return result;
}
async function main(){
 const data=await probe(process.env.ODDS_API_KEY);
 fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(data,null,2)+"\n");
 console.log(JSON.stringify({status:data.status,remaining:data.accountQuotaAfter,
  spent:data.creditsSpentObserved,samples:data.results.map(s=>({
   season:s.season,status:s.status,alternateProps:s.outcomeCount||0
  }))}));
}
if(require.main===module)main().catch(e=>{console.error("Probe error:",e.name);process.exitCode=1});
module.exports={probe,choose,extract};
