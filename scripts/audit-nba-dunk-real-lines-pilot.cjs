"use strict";
// One explicitly requested, bounded historical research pilot. No live picks.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {dunkHistoryEstimate,dunkHistory}=require("./collect-nba-alternate-providers.cjs");
const ROOT=path.resolve(__dirname,".."),BASE="outputs/nba/authorized-providers",dt=Date.parse;
const Q=Object.freeze({player_id:"3112335",market:"player_points",from_date:"2025-10-21",to_date:"2025-12-07",limit:25,league:"nba"});
const git=args=>execFileSync("git",args,{cwd:ROOT,encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]}).trim();
const stamp=t=>t.replace(/[-:.]/g,""),day=t=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
function save(rel,x){const p=path.join(ROOT,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+"\n",{flag:"wx",mode:0o600});}
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const price=x=>Number.isInteger(x)&&Math.abs(x)>=100?(x<0?-x/(-x+100):100/(x+100)):null;
function evaluate(doc){
 if(doc?.kind!=="nba_dunkapi_historical_market_research_v1"||!Array.isArray(doc.rows))throw Error("unverified source archive");
 const sorted=[...doc.rows].sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.providerGameId.localeCompare(b.providerGameId));
 const seen=new Set(),rows=[];let warmup=0,push=0,unsupported=0;
 for(const [i,r] of sorted.entries()){
  if(seen.has(r.providerGameId)||r.providerPlayerId!==doc.request.player_id||r.market!==doc.request.market||!Number.isInteger(r.actual)||r.actual<0||!Number.isFinite(r.closingLine)||!Number.isFinite(dt(r.gameDate)))throw Error("invalid pilot row");
  seen.add(r.providerGameId);
  const past=sorted.slice(0,i).filter(x=>x.gameDate<r.gameDate).slice(-30);
  if(past.length<12){warmup++;continue;}
  const line=r.closingLine;if(line%1!==.5){unsupported++;continue;}
  if(r.actual===line){push++;continue;}
  // Exact existing v1 frequency-weighting formula. No invented minutes/team context.
  const values=past.map(x=>x.actual),recent=values.slice(-10),decided=values.filter(x=>x!==line),rd=recent.filter(x=>x!==line);
  const baseline=(1+decided.filter(x=>x>line).length)/(2+decided.length);
  const p=.65*baseline+.35*(1+rd.filter(x=>x>line).length)/(2+rd.length);
  const y=Number(r.actual>line),a=price(r.overOdds),b=price(r.underOdds);
  rows.push({gameId:r.providerGameId,gameDate:r.gameDate,line,actual:r.actual,priorGames:past.length,rawHigher:p,baselineHigher:baseline,marketHigher:a!==null&&b!==null?a/(a+b):null,y});
 }
 const metric=(a,key)=>({n:a.length,brier:mean(a.map(x=>(x[key]-x.y)**2)),logLoss:mean(a.map(x=>-(x.y?Math.log(x[key]):Math.log1p(-x[key])))),hitRate:mean(a.filter(x=>x[key]!==.5).map(x=>Number((x[key]>.5)===(x.y===1))))});
 const paired=rows.filter(x=>x.marketHigher!==null);
 return {kind:"nba_dunkapi_real_threshold_pilot_v1",generatedAt:new Date().toISOString(),request:doc.request,sourceCapturedAt:doc.capturedAt,player:sorted[0]?.player||null,sourceRows:sorted.length,warmup,unsupported,push,evaluated:rows.length,raw:metric(rows,"rawHigher"),baseline:metric(rows,"baselineHigher"),marketPaired:{model:metric(paired,"rawHigher"),baseline:metric(paired,"baselineHigher"),market:metric(paired,"marketHigher")},rows,actualHistoricalSportsbookThresholds:true,marketOddsAreProviderAggregates:true,priorPropCoveredAppearancesOnly:true,fullModelReplayed:false,minutesAndTeamContextUnverified:true,retrospectiveOnly:true,calibrationApproved:false,profitabilityVerified:false,actualWagersPlaced:0};
}
async function main(){
 if(process.env.NBA_DUNK_REAL_LINE_PILOT!=="1"||!process.env.NBA_DUNKAPI_API_KEY)throw Error("missing explicitly authorized pilot");
 const key=process.env.NBA_DUNKAPI_API_KEY,date=day(new Date()),rel=BASE+"/dunk-reservations/"+date+".json";
 const one=BASE+"/dunk-pilot-reservations/nikola-jokic-points-2025-10-21_2025-12-07.json";
 if(fs.existsSync(path.join(ROOT,rel))||fs.existsSync(path.join(ROOT,one)))throw Error("daily or pilot reservation exists; no request");
 const estimate=await dunkHistoryEstimate(key,Q);
 if(estimate.credits>10)throw Error("estimate exceeds 10 credits");
 git(["fetch","-q","origin","main"]);
 if(git(["branch","--show-current"])!=="main"||git(["rev-parse","HEAD"])!==git(["rev-parse","origin/main"]))throw Error("private main changed; no request");
 const reservation={kind:"nba_dunkapi_daily_reservation_v1",date,createdAt:new Date().toISOString(),maxCredits:10,estimatedCredits:estimate.credits,request:Q};
 save(rel,reservation);save(one,reservation);
 git(["add","-f",rel,one]);git(["commit","-qm","research: reserve one requested DunkAPI real-line pilot"]);git(["push","-q","origin","HEAD:main"]);
 const doc=await dunkHistory(key,Q,{estimate,reservation:{committed:true,maxCredits:10,request:Q}});
 save(BASE+"/dunk-history/"+stamp(doc.capturedAt)+".json",doc);
 const a=evaluate(doc);
 save(BASE+"/dunk-backtests/"+stamp(a.generatedAt)+".json",a);
 const {rows,...summary}=a;console.log(JSON.stringify({...summary,estimatedCredits:estimate.credits,meteredRequests:1,sharedNhlNflRequests:0}));
}
if(require.main===module)main().catch(e=>{console.error("Pilot stopped: "+String(e.message).split("\n")[0].slice(0,160));process.exitCode=1;});
module.exports={evaluate};
