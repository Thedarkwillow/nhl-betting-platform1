"use strict";
// Documented public sample, not an authenticated app board.
const {createHash}=require("node:crypto");
async function main(){
 const u="https://kashrock.up.railway.app/v6/demo/cs2-prop";let report={kind:"kashrock_keyless_prop_sample_v1",status:"unavailable",requests:1,originalOffersVerified:0,rawRowsPublished:0,paidRequests:0};
 try{
  const r=await fetch(u,{redirect:"error",signal:AbortSignal.timeout(20000),headers:{Accept:"application/json"}});
  report.http=r.status;if(!r.ok||!r.body)throw Error();
  const reader=r.body.getReader(),parts=[];let n=0;
  try{for(;;){const q=await reader.read();if(q.done)break;n+=q.value.length;if(n>200000){await reader.cancel();throw Error();}parts.push(Buffer.from(q.value));}}finally{reader.releaseLock();}
  const raw=Buffer.concat(parts),d=JSON.parse(raw.toString("utf8"));
  report.status="sample_schema_read";report.sha256=createHash("sha256").update(raw).digest("hex");
  report.topLevelFields=Array.isArray(d)?[]:Object.keys(d).slice(0,50);
  report.arrays=Object.fromEntries(Object.entries(d).filter(([k,v])=>Array.isArray(v)).map(([k,v])=>[k,{count:v.length,fields:v.length&&typeof v[0]==="object"?Object.keys(v[0]).slice(0,50):[]}]));
  report.sampleOnly=true;
 }catch{}
 console.log(JSON.stringify(report));
}
main();
