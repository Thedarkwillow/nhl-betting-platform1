"use strict";
// Read-only bounded account audit. Never print a key, raw payload, raw market or player ID.
// Reference: https://getoddsapi.com/docs (free 100/day, v4/sports zero credit).
const ROOT="https://getoddsapi.com", SOURCES=["prizepicks","underdog"];
const numeric=v=>typeof v==="string"&&/^\d{1,12}$/.test(v)?Number(v):null;
const quota=h=>({used:numeric(h.get("x-requests-used")),remaining:numeric(h.get("x-requests-remaining")),last:numeric(h.get("x-requests-last")),limit:numeric(h.get("x-ratelimit-limit"))});
const validTime=v=>typeof v==="string"&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const scalar=v=>typeof v==="string"&&v.length>0||typeof v==="number"&&Number.isFinite(v);
function freeBudget(q,confirmed){
 // The documented free account allowance is 100/day. Require zero-credit
 // metadata with consistent counters, plus explicit free-plan/no-overage confirmation.
 // An arbitrary rate-limit header alone cannot prove that a subscription is free.
 return confirmed&&q.last===0&&q.remaining!==null&&q.remaining>=2&&q.used!==null&&q.remaining+q.used===100;
}
async function bounded(route,key,fetcher,opts={}){
 const r=await fetcher(ROOT+route,{...opts,headers:{Authorization:"Bearer "+key,Accept:"application/json",...(opts.headers||{})},redirect:"error",signal:AbortSignal.timeout(18000)});
 const q=quota(r.headers);
 if(!r.ok){await r.body?.cancel();return {status:r.status,quota:q,body:null};}
 if(!r.body)return {status:r.status,quota:q,body:null};
 const reader=r.body.getReader(),chunks=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>1_000_000){await reader.cancel();throw Error("body limit");}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{body=null;}
 return {status:r.status,quota:q,body};
}
function summarize(source,doc,now=Date.now()){
 const rows=Array.isArray(doc?.data)?doc.data:Array.isArray(doc?.data?.rows)?doc.data.rows:Array.isArray(doc?.rows)?doc.rows:null;
 if(!rows||rows.length>5)return {status:"unrecognized_or_overbound_schema",rows:null,originalOperatorVerified:false};
 const stats={rows:rows.length,providerIds:0,explicitSourceProjectionIds:0,eventIds:0,playerIds:0,numericLines:0,observedTimestamps:0,sourceUpdateTimestamps:0,sourceUpdatesWithin15Minutes:0,explicitSourceMatches:0,sourceConflicts:0,originalOperatorVerified:false,boardComplete:doc?.meta?.complete===true,bySport:{}};
 for(const x of rows){
  if(!x||typeof x!=="object")continue;
  const s=String(x.source??doc.meta?.source??"").toLowerCase();
  if(s===source)stats.explicitSourceMatches++;else if(s)stats.sourceConflicts++;
  if(scalar(x.id??x.market_id))stats.providerIds++;
  if(scalar(x.source_projection_id??x.original_projection_id??x.source_market_id))stats.explicitSourceProjectionIds++;
  if(scalar(x.event_id??x.event?.id))stats.eventIds++;
  if(scalar(x.player_id??x.player?.id))stats.playerIds++;
  if(typeof x.line==="number"&&Number.isFinite(x.line))stats.numericLines++;
  if(validTime(x.observed_at))stats.observedTimestamps++;
  if(validTime(x.source_updated_at)){stats.sourceUpdateTimestamps++;const age=now-Date.parse(x.source_updated_at);if(age>=0&&age<=900000)stats.sourceUpdatesWithin15Minutes++;}
  const sport=String(x.sport??x.league??"").toUpperCase();
  const label=["NBA","NFL","NHL","CS2","DOTA2","LOL","VALORANT","COD","MLB"].includes(sport)?sport:"other_or_missing";
  stats.bySport[label]=(stats.bySport[label]||0)+1;
 }
 return {status:"bounded_sample",...stats};
}
async function run(env=process.env,fetcher=fetch){
 const key=env.GETODDS_API_KEY||env.GETODDS_API;
 const report={kind:"getodds_secure_account_preflight_v1",observedAt:new Date().toISOString(),credentialConfigured:!!key,metadataRequests:0,dataRequests:0,paidRequestsAuthorized:false,originalOperatorVerified:false,rawRowsPublished:0,sources:{}};
 if(!key){report.status="missing_secret";return report;}
 let meta;
 try{report.metadataRequests++;meta=await bounded("/v4/sports",key,fetcher);report.metadata={httpStatus:meta.status,quota:meta.quota};}catch{report.status="metadata_request_failed";return report;}
 if(meta.status!==200){report.status=meta.status===401?"invalid_or_revoked_key":"metadata_unavailable";return report;}
 report.status="metadata_response_received";
 const sports=Array.isArray(meta.body)?meta.body:Array.isArray(meta.body?.data)?meta.body.data:[];
 const known=["basketball_nba","americanfootball_nfl","icehockey_nhl","esports_cs2","esports_dota2","esports_lol","esports_valorant","esports_cod"];
 report.generalSports=sports.map(x=>x?.key).filter(x=>known.includes(x));
 if(!freeBudget(meta.quota,env.GETODDS_FREE_PLAN_CONFIRMED==="1")){
  report.status="data_probe_blocked_free_allowance_not_proven";
  return report;
 }
 let q=meta.quota;
 for(const source of SOURCES){
  if(q.remaining===null||q.remaining<1){report.sources[source]={status:"quota_guard"};continue;}
  try{report.dataRequests++;const r=await bounded("/api/v1/markets?source="+source+"&limit=5",key,fetcher);q=r.quota;
   report.sources[source]={httpStatus:r.status,quota:q,status:r.status===403?"source_grant_denied":r.status===401?"invalid_or_revoked_key":r.status===429?"quota_exhausted":r.status===200?"source_response_received":"source_unavailable",sample:r.status===200?summarize(source,r.body):null};
   if(r.status===401||r.status===429||q.remaining===null)break;
  }catch{report.sources[source]={status:"request_failed"};break;}
 }
 report.status="bounded_probe_completed";return report;
}
if(require.main===module)run().then(x=>console.log(JSON.stringify(x))).catch(()=>{console.log(JSON.stringify({kind:"getodds_secure_account_preflight_v1",status:"unexpected_failure"}));process.exitCode=1;});
module.exports={quota,freeBudget,summarize,run};
