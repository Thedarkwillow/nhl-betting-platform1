"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {underdog}=require("../src/independent-provider-export-v1.cjs");
const {check}=require("./esports-zero-credit-coverage.cjs");
const {reconcile}=require("../src/underdog-bounded-capture-reconcile.cjs");
const host="https://underdogapi.com",limit=5;
const txt=v=>typeof v==="string"&&v.length>0;
async function read(r){
 if(!r.ok||!r.body)throw Error("http");
 const rd=r.body.getReader(),chunks=[];let n=0;
 try{for(;;){const q=await rd.read();if(q.done)break;n+=q.value.length;if(n>1000000){await rd.cancel();throw Error("size");}chunks.push(Buffer.from(q.value));}}finally{rd.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function structure(r){
 return !!r&&txt(r.id)&&txt(r.line_id)&&txt(r.source_projection_id)&&txt(r.player?.id)&&txt(r.player?.name)&&txt(r.event?.id)&&txt(r.market?.id)&&txt(r.market?.stat)&&txt(r.market?.period)&&Number.isFinite(r.line)&&Number.isFinite(Date.parse(r.observed_at))&&Number.isFinite(Date.parse(r.event?.starts_at))&&Array.isArray(r.selections)&&r.selections.some(s=>["higher","lower"].includes(s?.side)&&s.available===true)&&r.selections.every(s=>["higher","lower"].includes(s?.side)&&typeof s.available==="boolean"&&(s.payout_multiplier==null||(s.available&&Number.isFinite(s.payout_multiplier)&&s.payout_multiplier>0)));
}
async function preflight(){
 const r=await fetch(host+"/api/v1/demo/projections?league=NBA&view=full&limit=5",{redirect:"error",signal:AbortSignal.timeout(20000)});
 const d=await read(r);
 if(d.meta?.mode!=="demo"||!Array.isArray(d.data)||d.data.length!==limit||!d.data.every(r=>r.is_demo===true&&r.source==="demo"))throw Error("demo envelope");
 assert.throws(()=>underdog(d,new Date().toISOString()));
 const compatible=d.data.filter(structure).length;
 console.log(JSON.stringify({kind:"underdog_full_free_schema_gate",demoRows:d.data.length,structurallyCompatible:compatible,liveDemoRejected:true,paidRequests:0}));
 if(compatible!==limit)throw Error("schema mismatch");
}
async function capture(out){
 if(process.env.RESTRICTED_STORAGE_PREFLIGHT!=="verified"||!out||!path.isAbsolute(out)||!out.startsWith(process.env.RUNNER_TEMP+path.sep))throw Error("storage gate");
 const key=process.env.UNDERDOG_API_KEY;
 if(!key)throw Error("missing key");
 const c=await check("Underdog",key);
 if(c.status!=="authenticated_independent_metadata"||c.chargedCredits!==0||!(c.quota?.remainingCredits>=33)||!c.rows.some(r=>r.code==="CS"&&r.offers>0&&r.freshnessVerified)){
  console.log(JSON.stringify({kind:"restricted_esports_capture_v1",status:"coverage_or_quota_gate",projectionRequests:0}));return;
 }
 const r=await fetch(host+"/api/v1/projections?league=CS&view=full&limit=5",{headers:{Authorization:"Bearer "+key,"X-User-Request":"Owner-approved one-time private esports schema and data research","Accept":"application/json"},redirect:"error",signal:AbortSignal.timeout(25000)});
 const int=x=>x!==null&&/^\d+$/.test(x)?Number(x):null;
 const charges=[r.headers.get("X-Credits-Cost"),r.headers.get("X-Credits-Charged")].filter(x=>x!==null).map(int);
 const charged=charges.length&&charges.every(x=>x===charges[0])?charges[0]:null,remaining=int(r.headers.get("X-Credits-Remaining"));
 const report={kind:"restricted_esports_capture_v1",provider:"UnderdogAPI",league:"CS",projectionRequests:1,http:r.status,chargedCredits:charged,remainingCredits:remaining,accepted:0,originalOffersVerified:0,rawRowsPublished:0,modelPromoted:false};
 let rows=[],observations=[],digest=null;
 if(r.ok){
  try{
   const d=await read(r);digest=crypto.createHash("sha256").update(JSON.stringify(d)).digest("hex");
   if(d.meta?.mode!=="live"||d.meta?.is_demo===true||!Array.isArray(d.data)||d.data.length>limit||d.meta.count!==d.data.length)throw Error("live envelope");
   report.received=d.data.length;report.structurallyCompatible=d.data.filter(structure).length;
   report.explicitNonDemo=d.data.filter(x=>x.is_demo===false).length;
   report.expectedSource=d.data.filter(x=>x.source==="underdog").length;
   report.active=d.data.filter(x=>x.status==="active").length;
   if(charged!==3||remaining===null||remaining<30)throw Error("cost gate");
   const normalized=reconcile(d,new Date().toISOString());
   rows=normalized.rows;observations=normalized.observations;Object.assign(report,normalized.report);report.status=rows.length?"processed":"quarantined_no_eligible_rows";
  }catch{report.status="contract_or_cost_rejected";}
 }else report.status="http_failure_no_retry";
 fs.writeFileSync(out,JSON.stringify({kind:"restricted_independent_esports_research_v1",report,sourceDocumentSha256:digest,rows,quarantinedSourceObservations:observations,officialExportVerified:false,publicRedistributionAllowed:false},null,2),{flag:"wx",mode:0o600});
 console.log(JSON.stringify(report));
}
if(require.main===module)(process.argv[2]==="preflight"?preflight():process.argv[2]==="capture"?capture(process.argv[3]):Promise.reject(Error("mode"))).catch(()=>{console.error("Capture/preflight failed closed");process.exitCode=1;});
module.exports={structure};
