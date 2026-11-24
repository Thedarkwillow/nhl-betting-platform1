"use strict";
const fs=require("node:fs"),path=require("node:path");
const {canSpend:canSpendShared}=require("./oddsapi-shared-historical-budget.cjs");
const {inputs}=require("./backfill-2025-26-prizepicks-standard-baselines.cjs");
const ROOT=path.resolve(__dirname,".."),BASE=path.join(ROOT,"outputs/the-odds-api/nhl/2025-26-all-props");
const EVENT_DIR=path.join(BASE,"by-event"),PROGRESS_FILE=path.join(BASE,"progress.json");
const SUMMARY_FILE=path.join(BASE,"standard-alternate-matches-latest.json");
const API="https://api.the-odds-api.com/v4",SPORT="icehockey_nhl";
const BASE_MARKETS=["player_total_saves","player_shots_on_goal","player_points","player_assists",
 "player_goals","player_power_play_points","player_blocked_shots","player_faceoffs_won","player_time_on_ice"];
const SCORER_MARKETS=["player_goal_scorer_anytime","player_goal_scorer_first","player_goal_scorer_last"];
const ALL_MARKETS=[...BASE_MARKETS,...BASE_MARKETS.map(x=>x+"_alternate"),...SCORER_MARKETS];
const ALLOWED=new Set(ALL_MARKETS);
const PRIORITY=["player_total_saves","player_total_saves_alternate","player_shots_on_goal",
 ...ALL_MARKETS.filter(x=>!["player_total_saves","player_total_saves_alternate","player_shots_on_goal"].includes(x))];
const RUN_CAP=180,TOTAL_CAP=2000,MIN_REMAINING=350,MAX_BATCH_MARKETS=2;
const MAX_BATCH_COST=10*MAX_BATCH_MARKETS;
const read=(f,d=null)=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch{return d}};
function save(f,v){fs.mkdirSync(path.dirname(f),{recursive:true});
 fs.writeFileSync(f,JSON.stringify(v,null,2)+"\n")}
const hval=(h,k)=>{const v=h?.get?.(k);if(v==null)return null;const n=Number(v);
 return Number.isFinite(n)&&n>=0?n:null};
async function request(endpoint,key,client=fetch){
 const u=new URL(API+endpoint);u.searchParams.set("apiKey",key);
 const r=await client(u,{signal:AbortSignal.timeout(25000)});
 let body=null;try{body=await r.json()}catch{}
 return {ok:r.ok,status:r.status,body,cost:hval(r.headers,"x-requests-last"),
  remaining:hval(r.headers,"x-requests-remaining"),
  errorCode:typeof body?.error_code==="string"?body.error_code:null};
}
const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function snapshotValid(iso,item){
 const at=Date.parse(iso),asof=Date.parse(item.requestedAt),first=Date.parse(item.alternateObservedAt);
 return Number.isFinite(at)&&Number.isFinite(asof)&&Number.isFinite(first)&&
  at<=asof&&at<Date.parse(item.startAt)&&Math.abs(at-first)<=5*60000;
}
function discoverMarkets(json){
 const b=(json?.data?.bookmakers||[]).find(x=>x.key==="prizepicks");
 return {bookmakerPresent:!!b,keys:[...new Set((b?.markets||[]).map(m=>m.key).filter(x=>ALLOWED.has(x)))]};
}
function normalizeQuotes(json,keys,snapshot){
 const book=(json?.data?.bookmakers||[]).find(b=>b.key==="prizepicks");
 const rows=[];
 for(const m of book?.markets||[]){
  if(!keys.includes(m.key))continue;
  for(const o of m.outcomes||[]){
   const side=String(o.name||"");
   const player=typeof o.description==="string"?o.description:
    SCORER_MARKETS.includes(m.key)&&side&&!["Yes","No"].includes(side)?side:null;
   if(!player||!Number.isFinite(o.point)&&!SCORER_MARKETS.includes(m.key))continue;
   rows.push({market:m.key,player,side,point:Number.isFinite(o.point)?o.point:null,
    indicativePrice:Number.isFinite(o.price)?o.price:null,
    providerReportedMultiplier:Number.isFinite(o.multiplier)?o.multiplier:null,
    sourceSnapshotAt:snapshot,originalPrizePicksTierVerified:false,
    originalPrizePicksPayoutVerified:false,source:"The Odds API historical prizepicks bookmaker quote"});
  }
 }
 return rows;
}
function newEvent(item){
 return {schemaVersion:1,eventId:item.eventId,season:"2025-26",
  requestedAsOf:item.requestedAt,eventStartsAt:item.startAt,
  alternateSourceObservedAt:item.alternateObservedAt,
  marketDiscoveryComplete:false,bookmakerPresent:null,marketKeysAvailable:[],
  marketsAttempted:[],snapshots:[],quotes:[],status:"in_progress",
  originalPlatformSourceVerified:false,actualPayoutVerified:false,
  partialTimeCoverage:true};
}
function itemFile(item){return path.join(EVENT_DIR,item.id+".json")}
function mergeCachedAlternates(item,event){
 const exists=new Set((event.quotes||[]).map(q=>
  [q.market,norm(q.player),q.side,q.point,q.indicativePrice,q.sourceSnapshotAt].join("|")));
 for(const r of item.altOffers||[]){
  if(r.market!=="player_shots_on_goal_alternate")continue;
  const q={market:r.market,player:r.player,side:r.side,point:r.line,
   indicativePrice:r.indicativeAmericanPrice??r.indicativePrice??null,
   providerReportedMultiplier:r.sourceProvidedMultiplier??null,
   sourceSnapshotAt:r.oddsProviderObservedAt||item.alternateObservedAt,
   originalPrizePicksTierVerified:false,originalPrizePicksPayoutVerified:false,
   source:"reused_saved_alternate_shots_quote"};
  if(!snapshotValid(q.sourceSnapshotAt,item))continue;
  const id=[q.market,norm(q.player),q.side,q.point,q.indicativePrice,q.sourceSnapshotAt].join("|");
  if(!exists.has(id)){event.quotes.push(q);exists.add(id)}
 }
}
function buildMatches(item,event){
 const valid=(event.quotes||[]).filter(q=>snapshotValid(q.sourceSnapshotAt,item));
 const quoteSeen=new Set(),quotes=[];
 for(const q of valid){
  const id=[q.market,norm(q.player),q.side,q.point,q.indicativePrice,q.sourceSnapshotAt].join("|");
  if(quoteSeen.has(id))continue;
  quoteSeen.add(id);quotes.push(q);
 }
 const byStandard=new Map();
 for(const q of quotes){
  if(!BASE_MARKETS.includes(q.market)||!["Over","Under"].includes(q.side)||!Number.isFinite(q.point))continue;
  const id=[q.market,norm(q.player),q.side].join("|");
  if(!byStandard.has(id))byStandard.set(id,[]);
  if(!byStandard.get(id).some(x=>x.point===q.point))byStandard.get(id).push(q);
 }
 const pairs=[],unmatched=[],standalone=[];
 for(const a of quotes){
  if(SCORER_MARKETS.includes(a.market)){
   standalone.push({market:a.market,player:a.player,side:a.side,
    price:a.indicativePrice,originalTierVerified:false});
   continue;
  }
  if(!a.market.endsWith("_alternate"))continue;
  const base=a.market.slice(0,-"_alternate".length);
  if(!BASE_MARKETS.includes(base))continue;
  const options=byStandard.get([base,norm(a.player),a.side].join("|"))||[];
  const general={eventId:item.eventId,requestedAsOf:item.requestedAt,
   player:a.player,market:base,side:a.side,alternateLine:a.point,
   alternatePrice:a.indicativePrice,alternateObservedAt:a.sourceSnapshotAt,
   originalPrizePicksTierVerified:false,actualPayoutVerified:false};
  if(options.length!==1){
   unmatched.push({...general,reason:options.length?"ambiguous_standard_market":"missing_standard_market"});
   continue;
  }
  const b=options[0],delta=a.point-b.point;
  const difficulty=a.side==="Over"?Math.sign(delta):a.side==="Under"?Math.sign(-delta):0;
  const indicated=difficulty>0&&a.indicativePrice===100?"Demon":
   difficulty<0&&a.indicativePrice===-137?"Goblin":null;
  pairs.push({...general,standardLine:b.point,
   standardPrice:b.indicativePrice,standardObservedAt:b.sourceSnapshotAt,
   relativeToStandard:difficulty>0?"harder":difficulty<0?"easier":"same",
   providerIndicatedTier:indicated,
   evidenceLevel:"independent_same_game_same_snapshot_market_and_player",
   originalPrizePicksTierVerified:false});
 }
 return {pairs,unmatched,standalone,quoteRecords:quotes.length,
  byMarket:Object.fromEntries([...new Set(quotes.map(x=>x.market))].sort().map(k=>
   [k,quotes.filter(x=>x.market===k).length]))};
}
function summary(items,creditSpent=0){
 const byMarket={},indicated={Goblin:0,Demon:0},data={schemaVersion:1,
  generatedAt:new Date().toISOString(),season:"2025-26",
  availableDocumentedNhlMarketKeys:ALL_MARKETS,
  unsupportedHitMarketsDeferred:true,
  sourceEvents:items.length,eventsDiscovered:0,eventsCompleted:0,
  quotesSaved:0,standardAlternatePairs:0,alternateMissingStandard:0,
  scorerOnlyQuotes:0,providerTierIndicators:indicated,
  sourceOnlyFromProvider:true,originalPrizePicksPayoutVerified:false,
  originalTierVerified:false,fullSeasonCoverageVerified:false,
  creditsUsedInThisAudit:0,creditsSpentCollectorTotal:creditSpent,byMarket,
  caution:"Historical source snapshots at the same as-of time, not original PrizePicks first-party offers. Provider-indicated Goblin/Demon is not verified original tier. No payout or settlement verification. Hits intentionally excluded pending real source market support."};
 for(const item of items){
  const ev=read(itemFile(item));if(!ev)continue;
  if(ev.marketDiscoveryComplete)data.eventsDiscovered++;
  if(ev.status==="complete")data.eventsCompleted++;
  const result=buildMatches(item,ev);
  data.quotesSaved+=result.quoteRecords;
  data.standardAlternatePairs+=result.pairs.length;
  data.alternateMissingStandard+=result.unmatched.length;
  data.scorerOnlyQuotes+=result.standalone.length;
  for(const p of result.pairs)if(p.providerIndicatedTier)indicated[p.providerIndicatedTier]++;
  for(const [k,n] of Object.entries(result.byMarket))byMarket[k]=(byMarket[k]||0)+n;
  ev.analysis=result;
  save(itemFile(item),ev);
 }
 return data;
}
function progressBase(){
 return {schemaVersion:1,status:"in_progress",generatedAt:null,
  season:"2025-26",perRunCreditCap:RUN_CAP,totalCreditCap:TOTAL_CAP,
  creditsSpentTotal:0,creditsSpentLastRun:0,remainingProviderCredits:null,
  sourceEventsEligible:0,eventsCompleted:0,marketsAttempted:0,
  note:"Credit cap applies to this collector in addition to existing October-December archive cap. Two markets requested per batch maximum, 10 credits per returned historical market."};
}
async function run(key,client=fetch,candidates=inputs()){
 const p=read(PROGRESS_FILE,progressBase());
 p.creditsSpentLastRun=0;
 if(!key){p.status="missing_key";return p}
 if(p.creditsSpentTotal>=TOTAL_CAP){p.status="budget_exhausted";return p}
 const acct=await request("/sports",key,client);
 if(!acct.ok){p.status="account_http_"+acct.status;return p}
 if(acct.remaining===null||acct.remaining<MIN_REMAINING+RUN_CAP||
    !canSpendShared(0,{accountRemaining:acct.remaining}).allowed){
  p.status="low_or_unknown_quota_or_shared_cap";return p
 }
 let spent=0,remaining=acct.remaining,halt=false;
 p.status="in_progress";
 function accountCost(cost){p.creditsSpentTotal+=cost;spent+=cost;p.creditsSpentLastRun=spent;
  save(PROGRESS_FILE,p)}
 for(const item of candidates){
  const ev=read(itemFile(item))||newEvent(item);
  mergeCachedAlternates(item,ev);
  if(ev.status==="complete"){save(itemFile(item),ev);continue}
  if(!ev.marketDiscoveryComplete){
   if(spent+1>RUN_CAP||p.creditsSpentTotal+1>TOTAL_CAP||remaining<MIN_REMAINING+1)break;
   if(!canSpendShared(1,{accountRemaining:remaining}).allowed){
    p.status="shared_budget_paused";halt=true;break;
   }
   const q="?date="+encodeURIComponent(item.requestedAt)+"&bookmakers=prizepicks";
   const d=await request("/historical/sports/"+SPORT+"/events/"+item.eventId+"/markets"+q,key,client);
   const cost=d.cost??1;accountCost(cost);
   if(d.remaining!==null)remaining=d.remaining;
   if(!d.ok||cost>1){p.status="discovery_http_"+d.status;halt=true;break}
   if(!snapshotValid(d.body?.timestamp,item)){p.status="invalid_discovery_snapshot";halt=true;break}
   const found=discoverMarkets(d.body);
   ev.bookmakerPresent=found.bookmakerPresent;
   ev.marketKeysAvailable=found.keys;
   ev.marketDiscoveryComplete=true;
   ev.discoverySnapshotAt=d.body.timestamp;
   save(itemFile(item),ev);
  }
  // Don't pay to recollect alternate shots already captured in this as-of snapshot.
  const candidatesKeys=PRIORITY.filter(k=>ev.marketKeysAvailable.includes(k)&&
   !ev.marketsAttempted.includes(k)&&!(k==="player_shots_on_goal_alternate"&&
   (item.altOffers||[]).some(x=>x.market===k)));
  if((item.altOffers||[]).some(x=>x.market==="player_shots_on_goal_alternate")&&
    !ev.marketsAttempted.includes("player_shots_on_goal_alternate")){
   ev.marketsAttempted.push("player_shots_on_goal_alternate");
   save(itemFile(item),ev);
  }
  for(let i=0;i<candidatesKeys.length;i+=MAX_BATCH_MARKETS){
   const keys=candidatesKeys.slice(i,i+MAX_BATCH_MARKETS);
   const worstCost=keys.length*10;
   if(spent+worstCost>RUN_CAP||p.creditsSpentTotal+worstCost>TOTAL_CAP||
     remaining<MIN_REMAINING+worstCost){halt=true;break}
   if(!canSpendShared(worstCost,{accountRemaining:remaining}).allowed){
    p.status="shared_budget_paused";halt=true;break;
   }
   const qs=new URLSearchParams({date:item.requestedAt,bookmakers:"prizepicks",
    markets:keys.join(","),includeMultipliers:"true",oddsFormat:"american"});
   const r=await request("/historical/sports/"+SPORT+"/events/"+item.eventId+
    "/odds?"+qs.toString(),key,client);
   const cost=r.cost??worstCost;accountCost(cost);
   if(r.remaining!==null)remaining=r.remaining;
   if(!r.ok||cost>worstCost){p.status="market_http_"+r.status;halt=true;break}
   if(!snapshotValid(r.body?.timestamp,item)){p.status="invalid_market_snapshot";halt=true;break}
   ev.quotes.push(...normalizeQuotes(r.body,keys,r.body.timestamp));
   ev.marketsAttempted.push(...keys);
   ev.snapshots.push({at:r.body.timestamp,requestedMarkets:keys,chargedCredits:cost});
   save(itemFile(item),ev);
  }
  if(p.status!=="in_progress")break;
  const remainingKeys=ev.marketKeysAvailable.filter(k=>!ev.marketsAttempted.includes(k));
  if(remainingKeys.length===0){ev.status="complete";save(itemFile(item),ev)}
  if(halt)break;
 }
 p.remainingProviderCredits=remaining;
 p.sharedHistoricalBudgetPolicy="2025-26 fall + all NHL markets <=2500 combined, minimum 350 provider credits reserved";
 p.generatedAt=new Date().toISOString();
 p.sourceEventsEligible=candidates.length;
 p.eventsCompleted=candidates.filter(i=>read(itemFile(i))?.status==="complete").length;
 p.marketsAttempted=candidates.reduce((n,i)=>n+(read(itemFile(i))?.marketsAttempted?.length||0),0);
 if(p.creditsSpentTotal>=TOTAL_CAP)p.status="budget_exhausted";
 save(PROGRESS_FILE,p);
 save(SUMMARY_FILE,summary(candidates,p.creditsSpentTotal));
 return p;
}
async function main(){
 const p=await run(process.env.ODDS_API_KEY);
 console.log(JSON.stringify({status:p.status,usedRun:p.creditsSpentLastRun,
  usedTotal:p.creditsSpentTotal,cap:p.totalCreditCap,
  eventsDone:p.eventsCompleted,eventsAvailable:p.sourceEventsEligible,
  marketsAttempted:p.marketsAttempted}));
 if(p.status.startsWith("market_http_")||p.status.startsWith("discovery_http_")||
  p.status.startsWith("invalid_"))process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error("Historic NHL all-prop collector failed:",e.name);process.exitCode=1});
module.exports={BASE_MARKETS,SCORER_MARKETS,ALL_MARKETS,discoverMarkets,
 normalizeQuotes,buildMatches,summary,snapshotValid,run,request};
