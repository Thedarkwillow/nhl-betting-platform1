"use strict";
// Private, bounded authorized collection. Never print credentials, raw payloads,
// or URL query strings. No redirects, no retry on access denial/rate limits.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process"),{canonicalTeam}=require("../src/nhl-pregame-intel.cjs");
const ROOT=path.resolve(__dirname,".."),DIR="outputs/authorized-sources";
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
const dt=v=>typeof v==="string"?Date.parse(v):NaN, n=(x,lo,hi)=>typeof x==="number"&&Number.isFinite(x)&&x>=lo&&x<=hi;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const configs={
 natural_stat_trick:["NATURAL_STAT_TRICK_EXPORT_URL","NATURAL_STAT_TRICK_API_KEY",["naturalstattrick.com","www.naturalstattrick.com"]],
 hockey_reference:["HOCKEY_REFERENCE_EXPORT_URL","HOCKEY_REFERENCE_API_KEY",["hockey-reference.com","www.hockey-reference.com"]],
 sumer_sports:["SUMERSPORTS_EXPORT_URL","SUMERSPORTS_API_KEY",["sumersports.com","www.sumersports.com","api.sumersports.com"]],
 pro_football_reference:["PFR_EXPORT_URL","PFR_API_KEY",["pro-football-reference.com","www.pro-football-reference.com"]],
 fantasy_life:["FANTASY_LIFE_EXPORT_URL","FANTASY_LIFE_API_KEY",["fantasylife.com","www.fantasylife.com","api.fantasylife.com"]],
 rbsdm:["RBSDM_EXPORT_URL","RBSDM_API_KEY",["rbsdm.com","www.rbsdm.com"]]
};
function safeUrl(raw,hosts){
 const u=new URL(raw);if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||!hosts.includes(u.hostname))throw Error("unapproved_endpoint");
 return u;
}
async function request(url,{hosts,key,header="Authorization",fetcher=fetch,max=2_000_000}={}){
 const u=safeUrl(url,hosts);let r;
 try{r=await fetcher(u,{redirect:"error",signal:AbortSignal.timeout(20000),headers:{"User-Agent":"PrivateSportsResearch/1.0","Accept":"application/json,text/csv",...(key?{[header]:header==="Authorization"?"Bearer "+key:key}:{})}})}catch{throw Error("network_or_redirect_refused");}
 if(!r.ok)throw Error("http_"+r.status);
 if(!r.body||!r.body.getReader)throw Error("body_missing");
 const reader=r.body.getReader(),chunks=[];let bytes=0;
 try{for(;;){const x=await reader.read();if(x.done)break;bytes+=x.value.length;if(bytes>max){await reader.cancel();throw Error("payload_bound");}chunks.push(Buffer.from(x.value));}}finally{reader.releaseLock();}
 const text=Buffer.concat(chunks).toString("utf8"),type=(r.headers.get("content-type")||"").toLowerCase();
 if(type.includes("json"))return {format:"json",data:JSON.parse(text)};
 if(type.includes("csv")||type.includes("text/plain")&&/^[^\r\n<]+,[^\r\n<]+\r?\n/.test(text))return {format:"csv",data:text};
 throw Error("unverified_export_format");
}
function parseEdge(doc,offer){
 if(!doc||doc.player?.id!==offer.playerId||canonicalTeam(doc.player.team?.abbrev)!==canonicalTeam(offer.team))throw Error("edge_identity_mismatch");
 const zone=doc.zoneTimeDetails?.offensiveZonePctg,avg=doc.zoneTimeDetails?.offensiveZoneLeagueAvg,shot=doc.topShotSpeed?.imperial,speed=doc.skatingSpeed?.speedMax?.imperial;
 const features={};
 if(n(zone,0,1)&&n(avg,.01,1)){features.offensiveZoneTimePct=zone*100;features.offensiveZoneLeaguePct=avg*100;}
 if(n(shot,1,120))features.shotSpeedMph=shot;
 if(n(speed,1,35))features.skatingSpeedMph=speed;
 const hd=(doc.sogSummary||[]).filter(x=>["highdanger","high-danger","high_danger"].includes(String(x.locationCode||"").toLowerCase()));
 if(hd.length===1&&n(hd[0].shots,0,1000)&&Number.isInteger(hd[0].shots))features.highDangerShotsSeason=hd[0].shots;
 if(!Object.keys(features).length)throw Error("edge_no_valid_features");
 return features;
}
function edgeShadow(p,e,asOf){
 if(!e||e.playerId!==p.playerId||e.gameId!==p.gameId||e.team!==p.team||e.opponent!==p.opponent||!(dt(e.observedAt)<=dt(asOf)&&dt(asOf)-dt(e.observedAt)<=3600000&&dt(asOf)<dt(p.gameStartAt||p.eventStartsAt)-900000)||!["shotsOnGoal","goals"].includes(p.market)||!n(p.projection,0,25))return null;
 const f=e.features,zone=f.offensiveZoneTimePct,lg=f.offensiveZoneLeaguePct;
 if(!n(zone,0,100)||!n(lg,1,100))return null;
 // Very conservative PREDECLARED sensitivity; only zone opportunity enters the
 // projection. Shot/skate speed and danger counts are observed covariates.
 const mu=p.projection*clamp(1+.10*(zone/lg-1),.95,1.05);
 return {sourceId:"nhl_edge",playerId:p.playerId,gameId:p.gameId,market:p.market,line:p.line,tier:p.tier,originalSide:p.lean,gameStartAt:p.gameStartAt||p.eventStartsAt,champion:p.projection,shadow:mu,shadowSide:mu>p.line?"Higher":mu<p.line?"Lower":"Abstain",features:f,observedAt:e.observedAt,asOf,researchOnly:true,modelPromoted:false};
}
function originalBoard(now){
 const dir="outputs/research/snapshots",names=fs.readdirSync(path.join(ROOT,dir)).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort();
 if(!names.length)return null;
 const file=dir+"/"+names.at(-1),d=read(file),t=dt(now),built=dt(d.generatedAt);
 if(d.source!=="partner-api.prizepicks.com"||d.boardFresh!==true||d.boardCoverageComplete!==true||!(built<=t&&t-built<=1800000))return null;
 const git=args=>execFileSync("git",args,{cwd:ROOT,encoding:"utf8",timeout:15000,maxBuffer:64*1024*1024}).trim();
 const c=git(["log","--format=%H","--",file]).split("\n").filter(Boolean);if(c.length!==1)return null;
 const at=dt(git(["show","-s","--format=%cI",c[0]]));
 if(!(Math.floor(built/1000)*1000<=at&&at<=t))return null;
 return {file,sha:c[0],rows:(d.rankedProps||[]).filter(p=>Number.isInteger(p.playerId)&&Number.isInteger(p.gameId)&&["shotsOnGoal","goals"].includes(p.market)&&p.tier==="Standard"&&dt(p.gameStartAt||p.eventStartsAt)>t+1200000)};
}
const pause=()=>new Promise(r=>setTimeout(r,1200));
async function main(env=process.env){
 const start=new Date().toISOString(),report={kind:"private_authorized_source_collection_v1",generatedAt:start,ownerAuthorizationReported:true,providers:{},publicRows:0,modelPromoted:false},archive={};
 let b;try{b=originalBoard(start)}catch{}
 const candidates=[...new Map((b?.rows||[]).map(p=>[p.playerId,p])).values()].slice(0,8),edge=[];
 // Explicit season avoids /now redirect. One request/player, no retries.
 if(candidates.length){
  for(const p of candidates){
   try{const d=await request("https://api-web.nhle.com/v1/edge/skater-detail/"+p.playerId+"/20262027/2",{hosts:["api-web.nhle.com"]});const f=parseEdge(d.data,p);edge.push({playerId:p.playerId,gameId:p.gameId,team:p.team,opponent:p.opponent,observedAt:new Date().toISOString(),features:f});}
   catch(e){report.providers.nhl_edge={status:e.message==="http_401"||e.message==="http_403"?"access_denied":e.message==="http_429"?"rate_limited":"partial_or_schema_mismatch"};if(["http_401","http_403","http_429"].includes(e.message))break;}
   await pause();
  }
 }
 const now=new Date().toISOString(),shadows=(b?.rows||[]).flatMap(p=>{const v=edgeShadow(p,edge.find(x=>x.playerId===p.playerId&&x.gameId===p.gameId),now);return v?[v]:[]});
 report.providers.nhl_edge={...report.providers.nhl_edge,status:edge.length?"source_observed":report.providers.nhl_edge?.status||"no_fresh_original_board",players:edge.length,requestedMaximum:candidates.length,shadowRows:shadows.length};
 if(edge.length)archive.nhl_edge={source:"NHL EDGE",sourceSnapshot:b.file,sourceCommit:b.sha,records:edge,shadowRows:shadows,asOf:now};
 if(env.FANTASYPROS_API_KEY){
  try{
   const d=await request("https://api.fantasypros.com/public/v2/json/nfl/players",{hosts:["api.fantasypros.com"],key:env.FANTASYPROS_API_KEY,header:"x-api-key"});
   const a=d.data?.players;if(!Array.isArray(a)||!a.length)throw Error("player_schema_unverified");
   archive.fantasypros={source:"FantasyPros",kind:"player_identity_metadata_only",observedAt:new Date().toISOString(),data:d.data};
   report.providers.fantasypros={status:"player_metadata_received",players:a.length,projectionModelReady:false};
  }catch(e){report.providers.fantasypros={status:"credential_or_feed_failed",reason:/^http_\d+$/.test(e.message)?e.message:"schema_or_network"};}
 }else report.providers.fantasypros={status:"FANTASYPROS_API_KEY_required"};
 // Operator-supplied approved export paths; don't invent undocumented APIs.
 for(const [id,[urlVar,keyVar,hosts]] of Object.entries(configs)){
  if(!env[urlVar]){report.providers[id]={status:"authorized_export_url_required",urlSecret:urlVar,keySecret:keyVar};continue;}
  try{const d=await request(env[urlVar],{hosts,key:env[keyVar]});archive[id]={source:id,observedAt:new Date().toISOString(),format:d.format,data:d.data,normalizationPending:true};report.providers[id]={status:"export_received_schema_review_pending",format:d.format,modelReady:false};}
  catch(e){report.providers[id]={status:"export_unavailable",reason:/^http_\d+$/.test(e.message)?e.message:"endpoint_or_schema"};}
  await pause();
 }
 report.generatedAt=new Date().toISOString();
 fs.mkdirSync(path.join(ROOT,DIR,"snapshots"),{recursive:true});
 if(Object.keys(archive).length){const f=report.generatedAt.slice(0,19).replace(/[-:]/g,"")+"Z.json";fs.writeFileSync(path.join(ROOT,DIR,"snapshots",f),JSON.stringify({kind:"private_authorized_source_archive_v1",generatedAt:report.generatedAt,providers:archive,modelPromoted:false})+"\n",{flag:"wx",mode:0o600});report.archive=DIR+"/snapshots/"+f;}
 fs.writeFileSync(path.join(ROOT,DIR,"status-latest.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({kind:report.kind,providers:Object.fromEntries(Object.entries(report.providers).map(([k,v])=>[k,v.status])),edgePlayers:edge.length,edgeShadowRows:shadows.length,publicRows:0}));
}
if(require.main===module)main().catch(()=>{console.error("Private authorized source capture failed closed.");process.exitCode=1;});
module.exports={safeUrl,request,parseEdge,edgeShadow,originalBoard,main};
