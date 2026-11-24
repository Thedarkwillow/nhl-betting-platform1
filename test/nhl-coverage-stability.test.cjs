"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {inspectNhlCoverage,compareNhlCoverageSnapshots}=
 require("../src/prizepicksapi-nhl-coverage-stability.cjs");
const {preflightNhlBoardStability}=
 require("../scripts/collect-prizepicks-free-api.cjs");
const now="2026-11-05T17:25:00Z",observed="2026-11-05T17:20:00Z";
const coverage=(timestamp=observed,status="fresh",count=1200)=>({
 data:[{league:"NBA",status:"fresh",projection_count:5000,last_observed_at:timestamp},
 {league:"NHL",status,projection_count:count,last_observed_at:timestamp}],
 meta:{mode:"live",source_status:status}
});
test("stable NHL scope in two fresh free coverage responses allows paid-board attempt, not atomicity claim",()=>{
 const r=compareNhlCoverageSnapshots(coverage(),coverage(),now);
 assert.equal(r.ready,true);
 assert.equal(r.checks,2);
 assert.equal(r.providerCreditsSpentOnGate,0);
 assert.equal(r.atomicPaginationProven,false);
 assert.equal(r.lastReportedProjectionCount,1200);
});
test("NHL board changes between free checks: reject before any paid projections call",()=>{
 const r=compareNhlCoverageSnapshots(coverage(),coverage("2026-11-05T17:21:00Z"),now);
 assert.equal(r.ready,false);
 assert.ok(r.reasons.includes("board_refreshed_between_free_coverage_checks"));
});
test("stale, missing, partial or demo coverage cannot be labelled ready",()=>{
 const stale=inspectNhlCoverage(coverage("2026-11-05T16:45:00Z"),now);
 assert.equal(stale.eligible,false);
 assert.ok(stale.reasons.includes("coverage_observation_too_old_or_invalid"));
 assert.equal(inspectNhlCoverage(coverage(observed,"partial"),now).eligible,false);
 assert.equal(inspectNhlCoverage(coverage(observed,"fresh",0),now).eligible,false);
 const missing={...coverage(),data:[]};
 assert.equal(inspectNhlCoverage(missing,now).eligible,false);
 assert.equal(inspectNhlCoverage({...coverage(),meta:{mode:"demo",source_status:"fresh"}},now).eligible,false);
});
test("second free /coverage request must cost zero credits and never call /projections",async()=>{
 let requests=0,delay=0;
 const client=async(url,options)=>{
  requests++;assert.equal(url,"https://prizepicksapi.com/api/v1/coverage");
  assert.equal(options.headers.Authorization,"Bearer private-test-key");
  return {ok:true,headers:{get:n=>({
   "x-usage-unit":"credits","x-credits-cost":"0","x-credits-remaining":"150"
  })[n]||null},json:async()=>coverage()};
 };
 const r=await preflightNhlBoardStability("private-test-key",{initial:coverage(),
  client,wait:async(ms)=>{delay=ms;},now});
 assert.equal(r.ready,true);
 assert.equal(delay,12000);
 assert.equal(requests,1);
});
test("unexpected billed coverage or malformed first response never launches charged pagination",async()=>{
 let requests=0;
 const client=async()=>{requests++;return {
  ok:true,headers:{get:n=>({
   "x-usage-unit":"credits","x-credits-cost":"10","x-credits-remaining":"120"
  })[n]||null},json:async()=>coverage()
 };};
 await assert.rejects(preflightNhlBoardStability("key",{
  initial:coverage(),client,wait:async()=>{},now}),/unexpectedly billed/);
 assert.equal(requests,1);
 await assert.rejects(preflightNhlBoardStability("key",{
  initial:null,client,wait:async()=>{},now}),/first free coverage snapshot missing/);
 assert.equal(requests,1);
});
