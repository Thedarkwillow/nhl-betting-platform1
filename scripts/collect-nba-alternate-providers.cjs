"use strict";
// Provider-native IDs are intentionally not NBA.com IDs. No fabricated crosswalks.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const root=path.resolve(__dirname,".."),dir=path.join(root,"outputs/nba/authorized-providers");
const finite=Number.isFinite,dt=Date.parse,day=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&finite(dt(x))&&new Date(dt(x)).toISOString().slice(0,10)===x;
const et=t=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
const validTeam=x=>typeof x==="string"&&/^[A-Z]{2,3}$/.test(x);
const american=x=>Number.isInteger(x)&&Math.abs(x)>=100;
const markets=new Set(["player_points","player_rebounds","player_assists","player_threes","player_points_rebounds_assists","player_blocks","player_steals","player_points_rebounds","player_points_assists","player_rebounds_assists"]);
function normalizeGames(d,date,at){
 if(!day(date)||!finite(dt(at))||!Array.isArray(d?.data)||d.meta?.next_cursor!=null||d.data.length>100)throw Error("incomplete BDL schedule page");
 const rows=[],seen=new Set();
 for(const g of d.data){
  const home=g.home_team?.abbreviation,away=g.visitor_team?.abbreviation;
  if(!Number.isInteger(g.id)||g.id<=0||seen.has(g.id)||g.date!==date||!validTeam(home)||!validTeam(away)||home===away||!finite(dt(g.datetime))||et(g.datetime)!==date||
  !["scheduled","in_progress","final","postponed","canceled","delayed","suspended","abandoned","unknown"].includes(g.status_state))throw Error("unverified BDL game identity");
  seen.add(g.id);rows.push({providerGameId:String(g.id),gameIdNamespace:"balldontlie:nba",date,startAt:g.datetime,home,away,status:g.status_state,homeTeamId:g.home_team.id,awayTeamId:g.visitor_team.id});
 }
 return {kind:"nba_bdl_daily_schedule_v1",source:"BALLDONTLIE",sourceUrl:"https://api.balldontlie.io/v1/games",capturedAt:at,date,completePagination:true,rows,officialNBAIdentityCrosswalkVerified:false};
}
function requestHistory({playerId,market,from,to}){
 if(typeof playerId!=="string"||!/^\d{1,12}$/.test(playerId)||!markets.has(market)||!day(from)||!day(to)||dt(to)<dt(from)||dt(to)-dt(from)>24*86400000)throw Error("invalid or overlong history request");
 return {player_id:playerId,market,from_date:from,to_date:to,limit:25,league:"nba"};
}
function normalizeHistory(raw,q,at){
 const d=raw?.data;
 if(!d||String(d.player_id)!==q.player_id||d.market!==q.market||!Array.isArray(d.games)||d.count!==d.games.length||d.games.length>q.limit||typeof d.player_name!=="string"||!d.player_name.trim()||!finite(dt(at)))throw Error("unverified DunkAPI response");
 const seen=new Set(),rows=[];
 for(const g of d.games){
  if(typeof g.game_id!=="string"||!g.game_id||seen.has(g.game_id)||!day(g.game_date)||g.game_date<q.from_date||g.game_date>q.to_date||g.game_date>=et(at))throw Error("unverified historical game");
  seen.add(g.game_id);
  if(!finite(g.line)||g.line<0||!Number.isInteger(g.actual)||g.actual<0||!Number.isInteger(g.books)||g.books<1)continue;
  const result=g.actual===g.line?"push":g.actual>g.line?"over":"under";
  if(g.result!==result)throw Error("historical result mismatch");
  rows.push({providerGameId:g.game_id,gameIdNamespace:"dunkapi:nba",providerPlayerId:q.player_id,playerIdNamespace:"dunkapi:nba",player:d.player_name,gameDate:g.game_date,market:d.market,closingLine:g.line,openingLine:finite(g.open_line)?g.open_line:null,overOdds:american(g.over_odds)?g.over_odds:null,underOdds:american(g.under_odds)?g.under_odds:null,books:g.books,actual:g.actual,result});
 }
 return {kind:"nba_dunkapi_historical_market_research_v1",source:"DunkAPI",sourceUrl:"https://mcp.dunkapi.com/v1/get_prop_history",capturedAt:at,request:q,providerReportedTruncated:d.truncated===true,nextFromDate:d.next_from_date||null,rows,originalPrizePicksOfferVerified:false,exactPregameCaptureTimestampVerified:false,prospectiveValidationApproved:false};
}
async function bdlSchedule(key,date,client=fetch){
 if(!key)throw Error("missing BDL credential");
 const url=new URL("https://api.balldontlie.io/v1/games");url.searchParams.set("dates[]",date);url.searchParams.set("per_page","100");
 const r=await client(url,{headers:{Authorization:key,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error("BDL HTTP "+r.status);return normalizeGames(await r.json(),date,new Date().toISOString());
}
async function dunkHistoryEstimate(key,q,client=fetch){
 if(!key)throw Error("missing DunkAPI credential");
 const r=await client("https://mcp.dunkapi.com/v1/get_prop_history",{method:"POST",headers:{"x-api-key":key,Accept:"application/json","Content-Type":"application/json"},redirect:"error",signal:AbortSignal.timeout(20000),body:JSON.stringify({...q,estimate_only:true})});
 if(!r.ok)throw Error("DunkAPI HTTP "+r.status);
 const raw=await r.json(),d=raw?.data;
 if(d?.estimate_only!==true||d.tool!=="get_prop_history"||!Number.isInteger(d.credits)||d.credits<0||Array.isArray(d.games))throw Error("unverified noncharging estimate");
 return {credits:d.credits,estimateOnly:true};
}
// Actual metered retrieval is intentionally not automatically called by the scheduler.
// A caller must provide a durable, single-use reservation and a verified estimate.
async function dunkHistory(key,q,{estimate,reservation,client=fetch}={}){
 if(!key||!estimate?.estimateOnly||!Number.isInteger(estimate.credits)||estimate.credits<0||estimate.credits>10||reservation?.committed!==true||reservation.maxCredits!==10||JSON.stringify(reservation.request)!==JSON.stringify(q))throw Error("no verified bounded reservation");
 const r=await client("https://mcp.dunkapi.com/v1/get_prop_history",{method:"POST",headers:{"x-api-key":key,Accept:"application/json","Content-Type":"application/json"},redirect:"error",signal:AbortSignal.timeout(20000),body:JSON.stringify(q)});
 if(!r.ok)throw Error("DunkAPI HTTP "+r.status);return normalizeHistory(await r.json(),q,new Date().toISOString());
}
function reserveHistory(q,estimate){
 // Reserve before any charge; no retry after an uncertain outcome.
 if(!estimate?.estimateOnly||estimate.credits>10||estimate.credits<0)throw Error("estimate exceeds allowed credits");
 const date=et(new Date()),rel="outputs/nba/authorized-providers/dunk-reservations/"+date+".json",p=path.join(root,rel);
 const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]}).trim();
 if(git(["branch","--show-current"])!=="main")throw Error("reservation requires private main checkout");
 git(["fetch","-q","origin","main"]);
 if(git(["rev-parse","HEAD"])!==git(["rev-parse","origin/main"]))throw Error("concurrent update; no metered request");
 fs.mkdirSync(path.dirname(p),{recursive:true});
 fs.writeFileSync(p,JSON.stringify({kind:"nba_dunkapi_daily_reservation_v1",date,createdAt:new Date().toISOString(),maxCredits:10,estimatedCredits:estimate.credits,request:q})+"\n",{flag:"wx",mode:0o600});
 git(["add","-f",rel]);git(["commit","-qm","research: reserve single NBA DunkAPI history request"]);git(["push","-q","origin","HEAD:main"]);
 return {committed:true,maxCredits:10,request:q};
}
function save(family,doc){
 const p=path.join(dir,family,doc.capturedAt.replace(/[-:.]/g,"")+".json");fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(doc)+"\n",{flag:"wx",mode:0o600});
}
async function main(env=process.env){
 const report={kind:"nba_alternate_source_capture_v1",bdl:"missing_key_or_disabled",dunkAPI:"missing_key_or_disabled",bdlGames:0,dunkEstimatedCredits:null,dunkChargedRequests:0,sharedNhlNflRequests:0,validatedSelections:0};
 if(env.NBA_BDL_FREE_SOURCE_ENABLED==="1"&&env.NBA_BALLDONTLIE_API_KEY){
  try{const a=await bdlSchedule(env.NBA_BALLDONTLIE_API_KEY,et(new Date()));save("bdl-schedule",a);report.bdl="collected";report.bdlGames=a.rows.length;}catch(e){report.bdl="unavailable";}
 }
 if(env.NBA_DUNK_ESTIMATE_ENABLED==="1"&&env.NBA_DUNKAPI_API_KEY){
  try{const q=requestHistory({playerId:env.NBA_DUNK_PLAYER_ID,market:env.NBA_DUNK_MARKET,from:env.NBA_DUNK_FROM_DATE,to:env.NBA_DUNK_TO_DATE});
   const x=await dunkHistoryEstimate(env.NBA_DUNKAPI_API_KEY,q);report.dunkAPI="estimate_verified";report.dunkEstimatedCredits=x.credits;
   if(env.NBA_DUNK_HISTORY_MANUAL_APPROVED==="1"){const reservation=reserveHistory(q,x);report.dunkChargedRequests=1;const doc=await dunkHistory(env.NBA_DUNKAPI_API_KEY,q,{estimate:x,reservation});save("dunk-history",doc);report.dunkAPI="history_collected";report.dunkHistoryRows=doc.rows.length;}
  }catch(e){report.dunkAPI=report.dunkChargedRequests?"request_attempted_outcome_unverified":"estimate_or_reservation_unavailable";}
 }
 return report;
}
if(require.main===module)main().then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error("Alternate NBA source capture failed closed");process.exitCode=1;});
module.exports={normalizeGames,requestHistory,normalizeHistory,bdlSchedule,dunkHistoryEstimate,dunkHistory,main};
