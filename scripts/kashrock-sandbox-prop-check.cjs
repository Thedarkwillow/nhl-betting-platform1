"use strict";
// Private in-memory evaluation only. One CS2 request after explicit Sandbox plan confirmation.
// https://www.kashrock.com/docs/quickstart and /docs/props.
const {createHash}=require("node:crypto");
const ROOT="https://kashrock.up.railway.app";
async function read(url,key,client=fetch){
 const r=await client(ROOT+url,{headers:{"x-api-key":key,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(25000)});
 if(!r.ok){const e=Error("http");e.status=r.status;throw e;}
 const rd=r.body.getReader(),chunks=[];let n=0;
 try{for(;;){const x=await rd.read();if(x.done)break;n+=x.value.length;if(n>4_000_000){await rd.cancel();throw Error("bound");}chunks.push(Buffer.from(x.value));}}finally{rd.releaseLock();}
 const raw=Buffer.concat(chunks);return {doc:JSON.parse(raw.toString("utf8")),digest:createHash("sha256").update(raw).digest("hex")};
}
const count=x=>Number.isSafeInteger(x)&&x>=0;
const string=x=>typeof x==="string"&&x.trim().length>0&&x.length<300;
function inspect(d,now=Date.now()){
 if(d?.sport!=="cs2")throw Error("sport");
 const grouped=Array.isArray(d.groups)?d.groups:null,flat=Array.isArray(d.props)?d.props:Array.isArray(d.rows)?d.rows:null;
 const rows=flat?.length?flat:grouped?grouped.flatMap(g=>{
  if(!g||!Array.isArray(g.dfs)||g.dfs.length>200)return [];
  return g.dfs.filter(r=>r&&typeof r==="object"&&(!r.stat_type||r.stat_type===g.stat_type)&&(!r.event_id||r.event_id===g.event_id)).map(r=>({...r,player_name:r.player_name??g.player_name,team:r.team??g.team,opponent:r.opponent??g.opponent,event_time:r.event_time??g.event_time,stat_type:r.stat_type??g.stat_type,canonical_player_id:r.canonical_player_id??g.canonical_player_id,eventId:r.eventId??g.event_id}));
 }):flat;
 const b=Array.isArray(d.books)?d.books:[],ages=new Map(b.filter(x=>string(x.book)&&count(x.age_s)).map(x=>[x.book.toLowerCase(),x.age_s]));
 const report={responseShape:flat?.length?"flat_rows":grouped?"grouped_dfs":flat?"flat_rows":"unknown",rows:rows?.length??0,groups:Array.isArray(d.groups)?d.groups.length:0,hasMore:typeof d.has_more==="boolean"?d.has_more:null,reportedTotal:count(d.total)?d.total:count(d.total_groups)?d.total_groups:null,byBook:{PrizePicks:{rows:0,validPregame:0,freshPregame:0,sourceIdRows:0,exactSelectionLink:0},Underdog:{rows:0,validPregame:0,freshPregame:0,sourceIdRows:0,exactSelectionLink:0}},duplicateSelectionIds:0};
 if(!rows)return report;
 const seen=new Set();
 for(const r of rows){
  const book=String(r.book_name||r.book||"").toLowerCase().replace(/[^a-z]/g,""),k=book==="prizepicks"?"PrizePicks":book==="underdog"?"Underdog":null;if(!k)continue;
  const g=report.byBook[k];g.rows++;
  const dir=["over","higher"].includes(r.direction)?"over":["under","lower"].includes(r.direction)?"under":null;
  const key=JSON.stringify([k,r.offerId||r.propId||[r.canonical_player_id,r.eventId,r.stat_type,r.player_name],dir,r.line]);if(seen.has(key)){report.duplicateSelectionIds++;continue;}seen.add(key);
  const start=Date.parse(r.event_time);
  if(!string(r.propId)||!string(r.player_name)||!string(r.stat_type)||!Number.isFinite(r.line)||r.line<0||!dir||!string(r.team)||!string(r.opponent)||r.team===r.opponent||!Number.isFinite(start)||start<=now+900000)continue;
  g.validPregame++;if(string(r.source_prop_id)&&string(r.source_event_id))g.sourceIdRows++;
  const age=count(r.age_s)?r.age_s:ages.get(book);if(count(age)&&age<=900)g.freshPregame++;
  if(k==="PrizePicks"&&r.deeplink_level==="selection"&&typeof r.deeplink==="string"){try{const u=new URL(r.deeplink);if(u.protocol==="https:"&&u.hostname==="app.prizepicks.com"&&u.searchParams.has("projections"))g.exactSelectionLink++;}catch{}}
 }
 return report;
}
async function check(env=process.env,client=fetch){
 const key=env.KASHROCK_API_KEY,report={kind:"kashrock_sandbox_prop_evaluation_v1",credentialConfigured:!!key,metaRequests:0,projectionRequests:0,documentedSandboxCredits:0,paidPlanRequests:0,originalOffersVerified:0,rawRowsPublished:0,persistentRawRows:0,status:"missing_key"};
 if(!key)return report;
 try{
  report.metaRequests++;const m=await read("/v7/meta",key,client);
  const plan=typeof m.doc.plan==="string"?m.doc.plan.toLowerCase():typeof m.doc.plan?.name==="string"?m.doc.plan.name.toLowerCase():null;
  report.plan=plan==="sandbox"?"sandbox":plan?"non_sandbox":"unrecognized";
  if(plan!=="sandbox"){report.status="no_sandbox_entitlement_verified";return report;}
  report.projectionRequests++;report.documentedSandboxCredits=5;
  const r=await read("/v7/cs2/props?board=dfs&view=rows&limit=100",key,client);
  report.responseSha256=r.digest;report.status="evaluation_response_received";report.evidence=inspect(r.doc);
 }catch(e){report.status=Number.isInteger(e.status)?"http_"+e.status:"transport_or_contract_failure";}
 return report;
}
if(require.main===module)check().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error("Evaluation failed closed");process.exitCode=1;});
module.exports={inspect,check,read};
