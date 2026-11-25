"use strict";
// Zero-credit schema preflight. Keyless demo endpoints only. No live data accepted.
const assert=require("node:assert/strict");
const {prizepicksCompact,underdogCompact}=require("../src/independent-provider-export-v1.cjs");
async function main(){
 const result=[];
 for(const [provider,host,adapt] of [["PrizePicks","https://prizepicksapi.com",prizepicksCompact],["Underdog","https://underdogapi.com",underdogCompact]]){
  try{
   const r=await fetch(host+"/api/v1/demo/projections?league=NBA&view=compact&limit=5",{redirect:"error",signal:AbortSignal.timeout(20000)});
   if(!r.ok){result.push({provider,http:r.status,status:"demo_unavailable"});continue;}
   const rd=r.body.getReader(),chunks=[];let total=0;
   try{for(;;){const x=await rd.read();if(x.done)break;total+=x.value.length;if(total>200000){await rd.cancel();throw Error("size");}chunks.push(Buffer.from(x.value));}}finally{rd.releaseLock();}
   const doc=JSON.parse(Buffer.concat(chunks).toString("utf8"));
   if(doc.meta?.mode!=="demo"||!Array.isArray(doc.data)||doc.data.length>5)throw Error("demo envelope");
   assert.throws(()=>adapt(doc,new Date().toISOString()));
   const fields=["id","source","is_demo","sport","league","player","team","stat","period","line","status","observed_at","event_starts_at","starts_at","more_available","less_available","higher_available","lower_available","higher_mult","lower_mult"];
   const shape=Object.fromEntries(fields.map(k=>[k,[...new Set(doc.data.map(row=>row[k]===null?"null":typeof row[k]))]]));
   result.push({provider,status:"demo_rejected_as_live",rows:doc.data.length,shape});
  }catch{result.push({provider,status:"demo_contract_unavailable"});}
 }
 console.log(JSON.stringify({kind:"zero_credit_compact_preflight",result,liveRequests:0,liveRows:0,paidRequests:0,rawRowsPublished:0}));
}
main().catch(()=>{console.error("preflight failed closed");process.exitCode=1});
