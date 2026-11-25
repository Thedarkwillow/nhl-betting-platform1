"use strict";
const fs=require("node:fs"),path=require("node:path");
const adapters=require("../src/independent-provider-export-v1.cjs");
const {check}=require("./esports-zero-credit-coverage.cjs");
const providers=[{name:"PrizePicks",host:"https://prizepicksapi.com",key:"PRIZEPICKSAPI_KEY",adapter:adapters.prizepicks,leagues:[["CS2",300]]},{name:"Underdog",host:"https://underdogapi.com",key:"UNDERDOG_API_KEY",adapter:adapters.underdog,leagues:[["CS",200],["VAL",100],["DOTA",100]]}];
async function main(){
 const output=process.argv[2];if(!output||!path.isAbsolute(output)||!process.env.RUNNER_TEMP||!output.startsWith(process.env.RUNNER_TEMP+path.sep))throw Error("restricted runner output required");
 const report=[],captured=[];let calls=0;
 for(const p of providers){
  const key=process.env[p.key];if(!key){report.push({provider:p.name,status:"missing_key"});continue;}
  const coverage=await check(p.name,key);
  if(coverage.status!=="authenticated_independent_metadata"||(p.name==="Underdog"&&!(coverage.quota?.remainingCredits>=4))){report.push({provider:p.name,status:"quota_or_coverage_gate"});continue;}
  for(const [league,limit] of p.leagues){
   if(!coverage.rows.some(r=>r.code===league&&r.offers>0&&r.freshnessVerified)){report.push({provider:p.name,league,status:"no_fresh_nonzero_coverage"});continue;}
   let r;
   try{
    calls++;
    r=await fetch(p.host+"/api/v1/projections?"+new URLSearchParams({league,view:"compact",limit:String(limit)}),{headers:{Authorization:"Bearer "+key,"X-User-Request":"Owner-requested one-time esports data integration test",Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(25000)});
    const charge=r.headers.get("X-Credits-Cost")??r.headers.get("X-Credits-Charged"),remaining=r.headers.get("X-Credits-Remaining");
    const meta={provider:p.name,league,http:r.status,chargedCredits:charge!==null&&/^\d+$/.test(charge)?Number(charge):null,remainingCredits:remaining!==null&&/^\d+$/.test(remaining)?Number(remaining):null};
    if(!r.ok){report.push({...meta,status:"request_failed"});break;}
    if(p.name==="Underdog"&&(meta.chargedCredits===null||meta.chargedCredits>Math.ceil(limit/100))){report.push({...meta,status:"unexpected_or_unknown_cost"});break;}
    const reader=r.body.getReader(),chunks=[];let size=0;
    try{for(;;){const q=await reader.read();if(q.done)break;size+=q.value.length;if(size>4_000_000){await reader.cancel();throw Error("response bound");}chunks.push(Buffer.from(q.value));}}finally{reader.releaseLock();}
    const doc=JSON.parse(Buffer.concat(chunks).toString("utf8")),receivedAt=new Date().toISOString();
    if(!Array.isArray(doc.data)||doc.data.length>limit||doc.meta?.mode!=="live"||doc.meta?.is_demo===true){report.push({...meta,status:"invalid_live_envelope"});break;}
    let normalized;try{normalized=p.adapter(doc,receivedAt);}catch{normalized=null;}
    if(normalized){const rows=normalized.rows.filter(x=>x.sport===({CS:"CS2",VAL:"VALORANT",DOTA:"DOTA2"}[league]||league));captured.push(...rows);report.push({...meta,status:"live_response",received:doc.data.length,accepted:rows.length,excluded:normalized.excluded,completePage:normalized.completePage,observedAt:doc.meta.observed_at??null});}
    else{report.push({...meta,status:"live_response_adapter_rejected",received:doc.data.length,accepted:0,sourceStatus:["fresh","stale","aging","partial","unavailable","live"].includes(doc.meta?.source_status)?doc.meta.source_status:null});}
   }catch{report.push({provider:p.name,league,status:"transport_or_contract_failure"});break;}
  }
 }
 // Ephemeral normalized observations only; no persistent history without retention review.
 fs.writeFileSync(output,JSON.stringify({kind:"independent_provider_ephemeral_research",rows:captured}),{mode:0o600,flag:"wx"});
 console.log(JSON.stringify({kind:"one_time_esports_pull_v1",report,projectionCalls:calls,accepted:captureCount(captured),originalOffersVerified:0,rawRowsPublished:0,persistentRows:0,modelPromoted:false}));
}
function captureCount(rows){return rows.length;}
if(require.main===module)main().catch(()=>{console.error("One-time pull failed closed");process.exitCode=1;});
