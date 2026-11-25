"use strict";
// Read-only bounded account audit. Never print a key, raw payload, raw market or player ID.
// Reference: https://getoddsapi.com/docs (free 100/day, v4/sports zero credit).
const ROOT="https://getoddsapi.com", SOURCES=["prizepicks","underdog"];
const fs=require("node:fs");
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
// Metadata-only MCP negotiation, no tools/call. Do not expose session IDs,
// tool descriptions, or server responses in the public workflow log.
async function mcpMetadata(key,fetcher){
 let session=null,version="2025-03-26",requests=0;
 async function rpc(message){
  requests++;
  const headers={Authorization:"Bearer "+key,Accept:"application/json, text/event-stream","Content-Type":"application/json","MCP-Protocol-Version":version};
  if(session)headers["Mcp-Session-Id"]=session;
  const r=await fetcher(ROOT+"/api/mcp",{method:"POST",headers,body:JSON.stringify({jsonrpc:"2.0",...message}),redirect:"error",signal:AbortSignal.timeout(18000)});
  if(!r.ok){await r.body?.cancel();return {status:r.status};}
  const sid=r.headers.get("mcp-session-id");if(sid&&sid.length<=512)session=sid;
  if(!r.body)return {status:r.status};
  const reader=r.body.getReader();let bytes=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>250000){await reader.cancel();throw Error("metadata bound");}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
  const raw=Buffer.concat(chunks).toString("utf8");
  let body;try{body=JSON.parse(raw);}catch{
   for(const l of raw.split(/\r?\n/)){if(!l.startsWith("data:"))continue;try{const j=JSON.parse(l.slice(5));if(j.id===message.id){body=j;break;}}catch{}}
  }
  return {status:r.status,result:body?.result,error:!!body?.error};
 }
 try{
  const init=await rpc({id:1,method:"initialize",params:{protocolVersion:version,capabilities:{},clientInfo:{name:"bounded-account-audit",version:"1.0"}}});
  if(!init.result)return {requests,httpStatus:init.status,status:"initialize_unavailable"};
  if(["2024-11-05","2025-03-26","2025-06-18","2025-11-25"].includes(init.result.protocolVersion))version=init.result.protocolVersion;
  const notice=await rpc({method:"notifications/initialized"});
  if(notice.status>=400)return {requests,httpStatus:notice.status,status:"initialization_notice_failed"};
  const list=await rpc({id:2,method:"tools/list",params:{}});
  const tools=list.result?.tools;
  if(!Array.isArray(tools)||tools.length>200)return {requests,httpStatus:list.status,status:"tool_list_unavailable"};
  const hints={};for(const s of SOURCES)hints[s]=tools.filter(t=>typeof t?.name==="string"&&t.name.toLowerCase().includes(s)).length;
  return {requests,httpStatus:list.status,status:"metadata_received",toolCount:tools.length,sourceNamedToolCounts:hints,sourceGrantsIndependentlyProven:false,hasMore:!!list.result.nextCursor};
 }catch{return {requests,status:"metadata_request_failed"};}
}
function rowsOf(doc){return Array.isArray(doc?.data)?doc.data:Array.isArray(doc?.data?.rows)?doc.data.rows:Array.isArray(doc?.rows)?doc.rows:null;}
const cleanText=v=>typeof v==="string"&&v.length>0&&v.length<=160?v:null;
const cleanId=v=>scalar(v)&&/^[A-Za-z0-9:_-]{1,160}$/.test(String(v))?String(v):null;
function observations(source,doc){
 const rows=rowsOf(doc);if(!rows||rows.length>5)return [];
 return rows.filter(x=>x&&typeof x==="object"&&(x.source??doc.meta?.source)===source&&typeof x.line==="number"&&Number.isFinite(x.line)).map(x=>({
  source,providerRecordId:cleanId(x.id??x.market_id),claimedOriginalId:cleanId(x.source_projection_id??x.original_projection_id??x.source_market_id),
  candidatePrefixedId:source==="prizepicks"&&/^pp_\d+$/.test(x.id??"")?x.id.slice(3):null,
  league:cleanText(x.league??x.sport),playerId:cleanId(x.player_id??x.player?.id),eventId:cleanId(x.event_id??x.event?.id),
  playerName:cleanText(typeof x.player==="string"?x.player:x.player?.name??x.player_name),team:cleanText(x.team??x.player?.team),opponent:cleanText(x.opponent??x.player?.opponent),
  stat:cleanText(x.stat??x.market?.stat??(typeof x.market==="string"?x.market:null)),period:cleanText(x.period??x.market?.period),tier:cleanText(x.tier??x.market?.tier),
  line:x.line,observedAt:validTime(x.observed_at)?x.observed_at:null,sourceUpdatedAt:validTime(x.source_updated_at)?x.source_updated_at:null,
  startsAt:validTime(x.starts_at??x.event?.starts_at)?(x.starts_at??x.event?.starts_at):null,originalOperatorVerified:false
 }));
}
function compareCandidates(rows,review){
 const cs=review?.kind==="restricted_kashrock_hltv_identity_and_projection_candidate_review_v1"&&Array.isArray(review.projectionCandidates)?review.projectionCandidates:[];
 const matches=rows.filter(x=>x.source==="prizepicks").map(x=>({x,m:cs.filter(y=>String(y.projectionIdCandidate)===(x.claimedOriginalId??x.candidatePrefixedId))})).filter(x=>x.m.length);
 return {candidateIdsCompared:rows.filter(x=>x.source==="prizepicks"&&(x.claimedOriginalId||x.candidatePrefixedId)).length,exactCandidateIdMatches:matches.length,numericLineAgreements:matches.filter(z=>z.m.some(y=>y.line===z.x.line)).length,fullyVerifiedOriginalOffers:0,independentOperatorProvenance:false};
}
function quotaTransition(before,after){
 return freeBudget(after,true)&&before.used!==null&&before.remaining!==null&&after.used>=before.used&&after.used-before.used<=1&&before.remaining-after.remaining===after.used-before.used;
}
function inspectContract(doc){
 const paths=doc?.paths;
 if(!paths||typeof paths!=="object")return {status:"unrecognized_contract"};
 const route=paths["/api/v1/markets"]||paths["/markets"];
 const parameters=[...(Array.isArray(route?.parameters)?route.parameters:[]),...(Array.isArray(route?.get?.parameters)?route.get.parameters:[])];
 const names=new Set(parameters.filter(x=>x?.in==="query").map(x=>x.name));
 const possible=Object.keys(paths).filter(x=>/history|result|score|coverage|training/i.test(x));
 return {status:"contract_received",gatewayDocumented:!!route?.get,leagueFilterDocumented:names.has("league"),sportFilterDocumented:names.has("sport"),historyRoutes:possible.filter(x=>/history/i.test(x)).length,resultRoutes:possible.filter(x=>/result|score/i.test(x)).length,sourceSpecificPickemHistoryRoutes:possible.filter(x=>/prizepicks|underdog/i.test(x)).length,historyEntitlementVerified:false};
}
async function publicContract(fetcher=fetch){
 try{const r=await fetcher(ROOT+"/openapi.json",{headers:{Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(15000)});
 if(!r.ok)return {status:"unavailable",httpStatus:r.status};
 const reader=r.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();return {status:"contract_bound_exceeded"};}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 return inspectContract(JSON.parse(Buffer.concat(chunks).toString("utf8")));
 }catch{return {status:"unavailable"};}
}
async function run(env=process.env,fetcher=fetch,archive=null,review=null){
 const key=env.GETODDSAPI||env.GETODDS_API_KEY||env.GETODDS_API;
 const report={kind:"getodds_secure_account_preflight_v1",observedAt:new Date().toISOString(),credentialConfigured:!!key,metadataRequests:0,dataRequests:0,paidRequestsAuthorized:false,originalOperatorVerified:false,rawRowsPublished:0,sources:{}};
 if(!key){report.status="missing_secret";return report;}
 let meta;
 try{report.metadataRequests++;meta=await bounded("/v4/sports",key,fetcher);report.metadata={httpStatus:meta.status,quota:meta.quota};}catch{report.status="metadata_request_failed";return report;}
 if(meta.status!==200){report.status=meta.status===401?"invalid_or_revoked_key":"metadata_unavailable";return report;}
 report.status="metadata_response_received";
 // Discovery already succeeded in run 45560033114. Avoid repeating shared-allowance requests.
 report.mcp={status:"previously_verified_not_repeated"};
 const sports=Array.isArray(meta.body)?meta.body:Array.isArray(meta.body?.data)?meta.body.data:[];
 const known=["basketball_nba","americanfootball_nfl","icehockey_nhl","esports_cs2","esports_dota2","esports_lol","esports_valorant","esports_cod"];
 report.generalSports=sports.map(x=>x?.key).filter(x=>known.includes(x));
 if(!freeBudget(meta.quota,env.GETODDS_FREE_PLAN_CONFIRMED==="1")){
  report.status="data_probe_blocked_free_allowance_not_proven";
  return report;
 }
 let q=meta.quota;const rows=[];
 report.freePlanConfirmed=env.GETODDS_FREE_PLAN_CONFIRMED==="1";
 for(const source of SOURCES){
  if(q.remaining===null||q.remaining<1||q.used===null||q.remaining+q.used!==100){report.sources[source]={status:"quota_guard"};break;}
  try{const before=q;report.dataRequests++;const r=await bounded("/api/v1/markets?source="+source+"&limit=5",key,fetcher);
   report.sources[source]={httpStatus:r.status,quota:r.quota,status:r.status===403?"source_grant_denied":r.status===401?"invalid_or_revoked_key":r.status===429?"quota_exhausted":r.status===200?"source_response_received":"source_unavailable",sample:r.status===200?summarize(source,r.body):null};
   if(r.status===200)rows.push(...observations(source,r.body));
   if(r.status===401||r.status===429||r.quota.last!==null&&r.quota.last>1){report.stoppedAfterSource=source;break;}
   report.metadataRequests++;
   const check=await bounded("/v4/sports",key,fetcher);
   q=check.quota;report.sources[source].postReadQuota=q;
   report.sources[source].quotaRefreshVerified=check.status===200&&quotaTransition(before,q);
   if(!report.sources[source].quotaRefreshVerified){report.stoppedAfterSource=source;break;}
  }catch{report.sources[source]={status:"request_failed"};break;}
 }
 report.crossSourceCandidateAudit=compareCandidates(rows,review);report.privateRows=rows.length;report.status="bounded_probe_completed";
 if(archive)archive.push(...rows);return report;
}
if(require.main===module){
 const archive=[],dest=process.env.GETODDS_PRIVATE_REPORT_PATH,reviewPath=process.env.GETODDS_PRIVATE_CANDIDATE_PATH;
 let review=null;try{if(reviewPath)review=JSON.parse(fs.readFileSync(reviewPath,"utf8"));}catch{}
 run(process.env,fetch,archive,review).then(async x=>{
 x.publicContract=await publicContract();
 if(dest){const payload={kind:"restricted_getodds_observations_v1",report:x,observations:archive,modelEligible:false,originalOperatorVerified:false};fs.writeFileSync(dest,JSON.stringify(payload,null,2)+"\n",{flag:"wx",mode:0o600});}
 console.log(JSON.stringify(x));}).catch(()=>{console.log(JSON.stringify({kind:"getodds_secure_account_preflight_v1",status:"unexpected_failure"}));process.exitCode=1;});}
module.exports={quota,freeBudget,summarize,run,mcpMetadata,observations,compareCandidates,quotaTransition,inspectContract};
