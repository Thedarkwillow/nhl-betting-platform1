"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {getJSON,transientSourceError}=require("../scripts/collect-nhl-official-period-events.cjs");
const error=(name,code)=>Object.assign(new Error("The operation was aborted due to timeout"),{name,code});
test("official NHL temporary timeout retry uses paced bounded transport, no made-up source",async()=>{
 let calls=0;const waits=[];
 const doc=await getJSON("https://api-web.nhle.com/v1/test",{
  client:async()=>{calls++;if(calls<3)throw error("TimeoutError");return {ok:true,json:async()=>({realOfficial:true})};},
  sleepFn:async ms=>waits.push(ms)
 });
 a.deepEqual(doc,{realOfficial:true});a.equal(calls,3);
 a.deepEqual(waits,[1200,2400]);
});
test("three official NHL timeouts still fail, and never count as complete",async()=>{
 let calls=0;
 await a.rejects(()=>getJSON("official",{
  client:async()=>{calls++;throw error("AbortError");},
  sleepFn:async()=>{}
 }),/aborted due to timeout/);
 a.equal(calls,3);
});
test("do not retry rate-independent data/auth/schema errors",async()=>{
 let calls=0;
 await a.rejects(()=>getJSON("official",{
  client:async()=>{calls++;throw new SyntaxError("bad source record");},
  sleepFn:async()=>{}
 }),/bad source record/);
 a.equal(calls,1);
 await a.rejects(()=>getJSON("official",{
  client:async()=>{calls++;return {ok:false,status:401};},
  sleepFn:async()=>{}
 }),/HTTP 401/);
 a.equal(calls,2);
 a.equal(Boolean(transientSourceError(error("Error","ECONNRESET"))),true);
 a.equal(Boolean(transientSourceError(error("SyntaxError"))),false);
});

test("exhausted transport retries are explicitly categorized and remain missing",()=>{
 const {failureCategory}=require("../scripts/backfill-nhl-prior-season-periods.cjs");
 a.equal(failureCategory("NHL historical period archive incomplete: The operation was aborted due to timeout"),"transient_or_http_source_failure");
 a.equal(failureCategory("NHL official source HTTP 520"),"transient_or_http_source_failure");
 a.equal(failureCategory("shiftchart pagination reported=0, received=0"),"official_shiftchart_zero_rows");
 a.equal(failureCategory("bad mapping invariant"),"unclassified_historical_source_error");
});
