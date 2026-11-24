"use strict";
const fs=require("node:fs"),path=require("node:path");
const {MARKETS,normalizePrizePicksOddsApiEvent}=
 require("../src/nhl-oddsapi-prizepicks-backup.cjs");
const {matchEvent}=require("../src/nhl-oddsapi-underdog.cjs");
const ROOT=path.resolve(__dirname,".."),BASE="https://api.the-odds-api.com/v4";
const MAX_EVENTS=2,MARKET_KEYS=Object.keys(MARKETS),
 MAX_CREDITS=MAX_EVENTS*MARKET_KEYS.length,RESERVE_CREDITS=350;
function quota(headers,key){
 const v=headers?.get?.(key);
 return typeof v==="string"&&/^\d{1,8}$/.test(v)?Number(v):null;
}
async function request(endpoint,key,client=fetch){
 if(!key)throw Error("ODDS_API_KEY missing; no requests");
 const u=new URL(BASE+endpoint);u.searchParams.set("apiKey",key);
 const r=await client(u,{signal:AbortSignal.timeout(30000)});
 if(!r?.ok)throw Error("The Odds API safe HTTP "+Number(r?.status||0)+
  "; no automatic paid retry or raw provider body logged");
 return {data:await r.json(),remaining:quota(r.headers,"x-requests-remaining"),
  charged:quota(r.headers,"x-requests-last")};
}
async function collect(key,{client=fetch,now=new Date().toISOString(),
 schedule,projections,maxEvents=MAX_EVENTS}={}){
 if(!key)throw Error("ODDS_API_KEY missing");
 if(schedule?.complete!==true||!Array.isArray(schedule.games)||!projections?.players)
  throw Error("Complete official NHL season schedule and player model identities required");
 if(!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>MAX_EVENTS)
  throw Error("Backup NHL provider request budget must not exceed 2 events");
 const before=await request("/sports",key,client); // zero-cost endpoint
 const ceiling=maxEvents*MARKET_KEYS.length;
 if(before.remaining===null||before.remaining<RESERVE_CREDITS+ceiling)
  return {status:"no_budget_verified",paidCalls:0,chargedCredits:0,
   remaining:before.remaining,rows:[],eventsCovered:[],eligibleToFreeze:false};
 const upcoming=await request("/sports/icehockey_nhl/events",key,client);
 const candidates=(Array.isArray(upcoming.data)?upcoming.data:[]).filter(e=>
  matchEvent(e,schedule,now)&&Date.parse(e.commence_time)>Date.parse(now)+30*60000&&
  Date.parse(e.commence_time)-Date.parse(now)<=48*3600000)
  .sort((a,b)=>Date.parse(a.commence_time)-Date.parse(b.commence_time)||String(a.id).localeCompare(String(b.id)))
  .slice(0,maxEvents);
 if(!candidates.length)return {status:"no_eligible_official_nhl_games",paidCalls:0,
  chargedCredits:0,remaining:before.remaining,rows:[],
  eventsCovered:[],eligibleToFreeze:false};
 const rows=[],eventsCovered=[],issues={};
 let remaining=before.remaining,chargedCredits=0,paidCalls=0;
 for(const e of candidates){
  if(remaining===null||remaining<RESERVE_CREDITS+MARKET_KEYS.length)
   break;
  const params=new URLSearchParams({
   regions:"us_dfs",bookmakers:"prizepicks",oddsFormat:"american",
   markets:MARKET_KEYS.join(","),includeMultipliers:"true"
  });
  const result=await request("/sports/icehockey_nhl/events/"+encodeURIComponent(e.id)+
   "/odds?"+params,key,client);
  paidCalls++;
  if(result.charged===null||result.charged<0||result.charged>MARKET_KEYS.length)
   throw Error("Unexpected The Odds API PrizePicks per-event charge; stop and review quota");
  chargedCredits+=result.charged;
  remaining=result.remaining;
  if(chargedCredits>ceiling||remaining===null||remaining<RESERVE_CREDITS)
   throw Error("The Odds API PrizePicks quota safety violation; stop future requests");
  const parse=normalizePrizePicksOddsApiEvent(result.data,schedule,projections,now);
  const eventIdentity=matchEvent(e,schedule,now);
  for(const [k,v] of Object.entries(parse.issues))issues[k]=(issues[k]||0)+v;
  eventsCovered.push({gameId:eventIdentity.id,startsAt:eventIdentity.startTimeUTC,
   providerEventId:e.id,rows:parse.rows.length,sourceBookPresent:parse.issues.missingBook===0});
  rows.push(...parse.rows);
 }
 const status=rows.length?"partial_nhl_prizepicks_labelled_research":
  "no_valid_prizepicks_lines_in_verified_event_scope";
 return {status,paidCalls,chargedCredits,remaining,rows,eventsCovered,issues,
  scopeComplete:paidCalls===candidates.length,
  eligibleToFreeze:rows.some(x=>x.tier==="Standard")&&paidCalls===candidates.length,
  fullLeagueCoverageVerified:false,originalPrizePicksPlatformAuthenticated:false,
  exactAltTierVerified:false};
}
async function main(){
 const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
 const key=process.env.ODDS_API_KEY,now=new Date().toISOString();
 const result=await collect(key,{now,
  schedule:read("outputs/official-nhl/season-schedules/2026-27.json"),
  projections:read("outputs/projections/players.json")});
 const output={schemaVersion:1,kind:"provider_labelled_prizepicks_nhl_event_subset",
  generatedAt:now,provider:"The Odds API",platform:"prizepicks",
  sourceScope:"verified_selected_events",sourceStatus:result.status,
  coverage:{scopeComplete:result.scopeComplete===true,
   fullLeagueBoardVerified:false,marketSet:MARKET_KEYS,eventsCovered:result.eventsCovered||[]},
  completePagination:result.scopeComplete===true,
  fullNhlBoardCoverageVerified:false,
  originalPrizePicksPlatformAuthenticated:false,
  originalSpecialTierPayoutVerified:false,
  sourceVendorAuthenticated:!!key,
  commercialPublicRightsVerified:false,
  chargedCredits:result.chargedCredits||0,remainingProviderCredits:result.remaining??null,
  providerRequests:result.paidCalls,
  observedIssues:result.issues||{},rows:result.rows||[],
  warning:"One or two verified NHL event scopes, not a complete PrizePicks board. Independent provider-labelled odds only. Regular-market tiers are not authenticated by original platform; alternate Goblin/Demon tiers and payout multipliers unverified. Never publish as complete, current original-platform lines."};
 const dir=path.join(ROOT,"outputs/prizepicks-backup/nhl");
 fs.mkdirSync(path.join(dir,"snapshots"),{recursive:true});
 if(!result.rows?.length){
  console.log(JSON.stringify({status:result.status,paidCalls:result.paidCalls,
   chargedCredits:result.chargedCredits,rows:0,
   previousCompleteOrPartialSnapshotRetained:true}));
  return;
 }
 const stamp=now.slice(0,19).replace(/[-:]/g,"")+"Z";
 const json=JSON.stringify(output,null,2)+"\n";
 fs.writeFileSync(path.join(dir,"snapshots",stamp+".json"),json,{flag:"wx"});
 fs.writeFileSync(path.join(dir,"latest.json"),json);
 console.log(JSON.stringify({status:result.status,paidCalls:result.paidCalls,
  chargedCredits:result.chargedCredits,remaining:result.remaining,
  eventCount:result.eventsCovered.length,rows:result.rows.length,
  officialPrizePicksPlatformAuthenticated:false,
  fullLeagueCoverageVerified:false,alternateTierVerified:false}));
}
if(require.main===module)main().catch(e=>{
 console.error("NHL PrizePicks fallback: "+e.message);process.exitCode=1;
});
module.exports={collect,request,quota,MAX_EVENTS,MAX_CREDITS,RESERVE_CREDITS};
