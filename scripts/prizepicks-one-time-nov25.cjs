"use strict";
// Owner-authorized November 25 one-shot independent-provider exception.
// No raw rows, provider messages, secrets, or individual offers in public output.
const {check,quota}=require("./esports-zero-credit-coverage.cjs");
const {prizepicksCompact}=require("../src/independent-provider-export-v1.cjs");
const leagues=["NBA","NHL","NFL"], reserve=100;
const {evaluate,summarize,fromCommitted}=require("./prizepicks-direct-model-bridge.cjs");
async function capture(key,client=fetch,clock=()=>new Date().toISOString(),{modelContext=null}={}){
 if(!key)throw Error("missing_key");
 const pre=await check("PrizePicks",key,client), q=pre.quota;
 if(pre.status!=="authenticated_independent_metadata"||q?.usageUnit!=="requests"||!Number.isSafeInteger(q.remainingRequests)||q.remainingRequests<reserve+leagues.length||q.resetAt!=="2026-12-01T00:00:00.000Z")throw Error("quota_preflight_failed");
 let remaining=q.remainingRequests,attempts=0;const results=[];
 for(const league of leagues){
  if(!pre.traditionalSportRows.some(r=>r.code===league&&r.offers>0&&r.freshnessVerified)||remaining<=reserve){results.push({league,status:"no_fresh_coverage_or_reserve"});continue;}
  attempts++;
  try{
   const url=new URL("https://prizepicksapi.com/api/v1/projections");
   url.search=new URLSearchParams({league,view:"compact",limit:"1000",start_after:new Date(Date.parse(clock())+900001).toISOString()});
   const response=await client(url.toString(),{headers:{Authorization:"Bearer "+key,Accept:"application/json","X-User-Request":"Owner-authorized one-time November 25 sports research capture"},redirect:"error",signal:AbortSignal.timeout(25000)});
   if(!response.ok){results.push({league,status:"http_failure",http:response.status});break;}
   const usage=quota(response.headers);
   const costs=[response.headers.get("X-Credits-Cost"),response.headers.get("X-Credits-Charged")].filter(x=>x!==null);
   if(usage.usageUnit!=="requests"||!Number.isSafeInteger(usage.remainingRequests)||usage.remainingRequests>remaining||usage.remainingRequests<remaining-1||usage.remainingRequests<reserve||costs.some(x=>x!=="0")){results.push({league,status:"quota_contract_failed"});break;}
   remaining=usage.remainingRequests;
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>8_000_000){await reader.cancel();throw Error("response_limit");}chunks.push(Buffer.from(x.value));}}finally{reader.releaseLock();}
   const doc=JSON.parse(Buffer.concat(chunks).toString("utf8"));
   if(!Array.isArray(doc.data)||doc.data.length>1000)throw Error("row_limit");
   const normalized=prizepicksCompact(doc,clock());
   const scoped=normalized.rows.filter(x=>x.sport===league),accepted=scoped.length;
   const modelBridge=summarize(evaluate(scoped,modelContext,clock()));
   results.push({league,status:accepted>0?"normalized_observations":doc.data.length?"all_rows_rejected":"empty_page",received:doc.data.length,accepted,modelBridge,excluded:normalized.excluded,completeBoard:normalized.completePage,observedAt:typeof doc.meta.observed_at==="string"&&Number.isFinite(Date.parse(doc.meta.observed_at))?new Date(doc.meta.observed_at).toISOString():null,remainingRequests:remaining});
  }catch{results.push({league,status:"transport_or_schema_failure"});break;}
 }
 return {kind:"prizepicks_one_time_20261125",coverageCalls:1,projectionAttempts:attempts,remainingAfterLastVerifiedResponse:remaining,results,rawRowsPublished:0,rawRowsPersisted:0,originalOffersVerified:0,modelPromoted:false};
}
module.exports={capture};
if(require.main===module){if(process.env.PRIZEPICKS_ONE_TIME_APPROVED!=="2026-11-25"||new Date().toISOString().slice(0,10)!=="2026-11-25"||process.env.GITHUB_RUN_ATTEMPT!=="1"){console.error("One-time authorization absent or expired");process.exitCode=1;}else (async()=>{let context=null;if(process.env.PRIZEPICKS_MODEL_CONTEXT_FILE){const fs=require("node:fs"),{execFileSync}=require("node:child_process");const p=process.env.PRIZEPICKS_MODEL_CONTEXT_FILE;const st=fs.statSync(p);if(!st.isFile()||st.size>100e6)throw Error("context_bound");const payload=JSON.parse(fs.readFileSync(p,"utf8"));if(payload.kind!=="nba_mirror_prospective_input_v1")throw Error("context_kind");context=fromCommitted(process.cwd(),payload,new Date().toISOString(),execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim());}return capture(process.env.PRIZEPICKSAPI_KEY,fetch,()=>new Date().toISOString(),{modelContext:context});})().then(x=>{console.log(JSON.stringify(x));if(x.results.some(r=>r.status!=="normalized_observations"))process.exitCode=1;}).catch(()=>{console.error("One-time pull stopped at quota preflight");process.exitCode=1;});}
