"use strict";
const fs=require("node:fs"),path=require("node:path");
const {matchEvent,normalizeUnderdogEvent,MARKETS}=require("../src/nhl-oddsapi-underdog.cjs");
const root=path.resolve(__dirname,"..");
const API="https://api.the-odds-api.com/v4",MIN_RESERVE=350,MAX_SINGLE_CALL_CREDITS=4;
function quota(h,key){
 const v=Number(h?.get?.(key));
 return Number.isFinite(v)&&v>=0?v:null;
}
async function request(endpoint,key,client=fetch){
 const u=new URL(API+endpoint);u.searchParams.set("apiKey",key);
 const r=await client(u,{signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error("The Odds API status "+r.status+"; no retry or extra paid request");
 return {data:await r.json(),remaining:quota(r.headers,"x-requests-remaining"),
  cost:quota(r.headers,"x-requests-last")};
}
async function collect(key,{client=fetch,now=new Date().toISOString(),schedule,players}={}){
 if(!key)throw Error("ODDS_API_KEY not configured; cannot collect");
 if(!schedule?.complete||!players?.players)throw Error("Official NHL schedule and identities required before any paid request");
 // Endpoint /sports is non-odds metadata used to observe a safely large
 // remaining balance. Unknown quota => no paid request.
 const preflight=await request("/sports",key,client);
 if(preflight.remaining===null||preflight.remaining<MIN_RESERVE+MAX_SINGLE_CALL_CREDITS)
  return {status:"quota_guard_blocked",requestedPaidEvents:0,rows:[],remaining:preflight.remaining};
 const events=await request("/sports/icehockey_nhl/events",key,client);
 const candidates=(Array.isArray(events.data)?events.data:[]).filter(x=>matchEvent(x,schedule,now))
  .sort((a,b)=>Date.parse(a.commence_time)-Date.parse(b.commence_time));
 const next=candidates.find(x=>Date.parse(x.commence_time)-Date.parse(now)<=36*3600000);
 if(!next)return {status:"no_nearby_verified_nhl_events",requestedPaidEvents:0,rows:[]};
 // Exactly ONE event, TWO listed markets, ONE paid call: no retries.
 const query=new URLSearchParams({regions:"us_dfs",bookmakers:"underdog",
  markets:Object.keys(MARKETS).join(","),oddsFormat:"american"});
 const event=await request("/sports/icehockey_nhl/events/"+
  encodeURIComponent(next.id)+"/odds?"+query.toString(),key,client);
 if(event.cost===null||event.cost>MAX_SINGLE_CALL_CREDITS)
  throw Error("Unexpected odds API market charge; stop and review budget immediately");
 const norm=normalizeUnderdogEvent(event.data,schedule,players,now);
 if(!norm.rows.length)return {status:"no_fresh_official_id_matched_underdog_quotes",
  requestedPaidEvents:1,creditsCharged:event.cost,rows:[],errors:norm.errors};
 return {status:"sampled_underdog_nhl_event",requestedPaidEvents:1,
  creditsCharged:event.cost,remaining:event.remaining,rows:norm.rows,errors:norm.errors};
}
async function main(){
 const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
 const key=process.env.ODDS_API_KEY;
 const now=new Date().toISOString();
 const result=await collect(key,{now,
  schedule:read("outputs/official-nhl/season-schedules/2026-27.json"),
  players:read("outputs/projections/players.json")});
 if(!result.rows.length){console.log(JSON.stringify({status:result.status,
  paidEventCalls:result.requestedPaidEvents,skipped:"no trustworthy fresh lines"}));return;}
 const doc={schemaVersion:1,kind:"approved_underdog_nhl_offers",generatedAt:now,
  provider:"The Odds API us_dfs / underdog",platform:"underdog",
  completePagination:true,scope:"ONE_VERIFIED_EVENT_ONLY",fullNhlBoardCoverageVerified:false,
  currentSourceVendorAuthenticated:true,originalUnderdogPlatformAuthenticated:false,
  commercialDerivedPublicDisplayAuthorized:process.env.UNDERDOG_DERIVED_PUBLIC_DISPLAY_AUTHORIZED==="true",
  count:result.rows.length,creditsCharged:result.creditsCharged,
  remainingProviderCredits:result.remaining,sourceLimitations:result.errors,
  originalUnderdogSettlementVerified:false,rows:result.rows};
 const dir=path.join(root,"outputs/underdog/nhl");fs.mkdirSync(path.join(dir,"snapshots"),{recursive:true});
 const stamp=now.slice(0,19).replace(/[-:]/g,"")+"Z",json=JSON.stringify(doc,null,2)+"\n";
 fs.writeFileSync(path.join(dir,"snapshots",stamp+".json"),json,{flag:"wx"});
 fs.writeFileSync(path.join(dir,"latest.json"),json);
 console.log(JSON.stringify({status:result.status,rows:result.rows.length,
  sampledEvents:1,creditsCharged:result.creditsCharged,
  originalPlatformVerified:false,commercialPublicRightsExplicit:doc.commercialDerivedPublicDisplayAuthorized}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={request,collect,quota};
