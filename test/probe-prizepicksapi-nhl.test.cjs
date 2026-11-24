"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {probe,summarizeProbeResponse}=require("../scripts/probe-prizepicksapi-nhl.cjs");
const {makeNhlRequest,requestNhlPage}=require("../src/prizepicksapi-nhl-request.cjs");
const {assertPrizePicksApiAllowed,RESET_AT_UTC}=
 require("../src/prizepicksapi-november-quota-lock.cjs");

test("single 25-row provider request and sanitized response are testable offline",()=>{
 const {url,options}=makeNhlRequest("test-secret",{limit:25});
 assert.equal(url.toString(),"https://prizepicksapi.com/api/v1/projections?league=NHL&limit=25");
 assert.equal(options.headers.Authorization,"Bearer test-secret");
 assert.equal(options.headers["X-User-Request"],"Explore live props in the workspace");
 const x=summarizeProbeResponse({
  data:[{id:"private-projection-1",player:{name:"Do not expose"}}],
  meta:{mode:"live",source_status:"fresh",
   observed_at:"2026-11-03T05:00:00Z",next_cursor:"pp_42"}});
 assert.equal(x.actualRows,1);
 assert.equal(x.nextCursorPresent,true);
 assert.equal(x.boardComplete,false);
 assert.ok(!JSON.stringify(x).includes("private-projection-1"));
 assert.ok(!JSON.stringify(x).includes("Do not expose"));
 assert.ok(!JSON.stringify(x).includes("test-secret"));
});
test("provider status 400 fails without automatic retries or secret echo",async()=>{
 let calls=0;
 await assert.rejects(requestNhlPage("private-key",{limit:25,client:async()=>{
  calls++;return {ok:false,status:400,
   json:async()=>({error:{code:"TASK_CONTEXT_REQUIRED",message:"Bearer private-key"}})};
 }}),e=>e.message.includes("TASK_CONTEXT_REQUIRED")&&
   !e.message.includes("private-key"));
 assert.equal(calls,1);
});
test("malformed provider response fails closed in offline parser",()=>{
 assert.throws(()=>summarizeProbeResponse({
  data:Array.from({length:26},(_,i)=>({id:i})),meta:{}}),/malformed/);
 assert.throws(()=>summarizeProbeResponse({
  data:[],meta:{next_cursor:"unsafe\nvalue"}}),/invalid cursor/);
});
test("November metered quota lock remains active without even calling mocked client",async()=>{
 assert.match(RESET_AT_UTC,/^2026-12-01T00:00:00/);
 assert.throws(()=>assertPrizePicksApiAllowed("2026-11-22T17:00:00Z"),
   e=>e.code==="PRIZEPICKSAPI_NOVEMBER_QUOTA_LOCK");
 assert.equal(assertPrizePicksApiAllowed("2026-12-01T00:00:00Z"),true);
 // A real probe is never exercised from the offline suite: it must consult
 // the real clock and could become billable after the lock expires.
 assert.equal(typeof probe,"function");
});
