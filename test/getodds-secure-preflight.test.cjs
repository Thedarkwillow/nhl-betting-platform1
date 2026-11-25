"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {quota,freeBudget,summarize,run}=require("../scripts/getodds-secure-preflight.cjs");
test("quota missing values never imply zero or free allowance",()=>{
 const q=quota(new Headers());assert.equal(q.remaining,null);assert.equal(freeBudget(q,true),false);
 assert.equal(freeBudget({last:0,used:3,remaining:97},false),false);
 assert.equal(freeBudget({last:0,used:3,remaining:97},true),true);
 assert.equal(freeBudget({last:0,used:3,remaining:1},true),false);
});
test("receipt time is distinct from source timestamp and ID provenance",()=>{
 const s=summarize("prizepicks",{data:[{id:"id",source:"prizepicks",line:1.5,observed_at:"2026-11-25T00:00:00Z",league:"NBA"}],meta:{complete:false}},Date.parse("2026-11-25T00:01:00Z"));
 assert.equal(s.providerIds,1);assert.equal(s.explicitSourceProjectionIds,0);assert.equal(s.observedTimestamps,1);assert.equal(s.sourceUpdateTimestamps,0);assert.equal(s.originalOperatorVerified,false);
});
test("missing key makes zero requests",async()=>{const r=await run({},()=>{throw Error("unexpected request")});assert.equal(r.status,"missing_secret");assert.equal(r.metadataRequests,0);});
test("without confirmed free allowance metadata only",async()=>{
 const urls=[];
 const mock=async(u,o)=>{urls.push(u);assert.equal(o.redirect,"error");if(u.endsWith("/v4/sports"))return new Response("[]",{headers:{"x-requests-used":"0","x-requests-remaining":"100","x-requests-last":"0"}});return new Response("",{status:403});};
 const r=await run({GETODDS_API_KEY:"synthetic"},mock);
 assert.equal(r.dataRequests,0);assert.equal(r.status,"data_probe_blocked_free_allowance_not_proven");assert.equal(urls.length,2);
});
test("bounded source requests with explicit confirmed free allowance",async()=>{
 let dataCalls=0;
 const mock=async(u,o)=>{if(u.endsWith("/v4/sports"))return new Response("[]",{headers:{"x-requests-used":"0","x-requests-remaining":"100","x-requests-last":"0"}});if(u.endsWith("/api/mcp"))return new Response("",{status:403});dataCalls++;return new Response(JSON.stringify({data:[],meta:{complete:false}}),{headers:{"x-requests-used":String(dataCalls),"x-requests-remaining":String(100-dataCalls),"x-requests-last":"1"}});};
 const r=await run({GETODDS_API_KEY:"synthetic",GETODDS_FREE_PLAN_CONFIRMED:"1"},mock);
 assert.equal(r.dataRequests,2);assert.equal(r.sources.prizepicks.httpStatus,200);assert.equal(r.sources.underdog.sample.rows,0);
});

test("existing GETODDSAPI alias authenticates without printing the key",async()=>{
 const calls=[];
 const r=await run({GETODDSAPI:"synthetic"},async(u,o)=>{calls.push(u);assert.equal(o.headers.Authorization,"Bearer synthetic");return new Response("",{status:401});});
 assert.equal(r.credentialConfigured,true);assert.equal(r.status,"invalid_or_revoked_key");assert.equal(r.dataRequests,0);assert.equal(calls.length,1);assert.equal(JSON.stringify(r).includes("synthetic"),false);
});

test("stop after first sample if the returned charge or daily allowance changes",async()=>{
 for(const q of [{"x-requests-used":"2","x-requests-remaining":"98","x-requests-last":"2"},{"x-requests-used":"1","x-requests-remaining":"999","x-requests-last":"1"}]){
  let calls=0;
  const mock=async(u)=>{if(u.endsWith("/v4/sports"))return new Response("[]",{headers:{"x-requests-used":"0","x-requests-remaining":"100","x-requests-last":"0"}});if(u.endsWith("/api/mcp"))return new Response("",{status:403});calls++;return new Response(JSON.stringify({data:[]}),{headers:q});};
  const result=await run({GETODDSAPI:"synthetic",GETODDS_FREE_PLAN_CONFIRMED:"1"},mock);
  assert.equal(calls,1);assert.equal(result.stoppedAfterSource,"prizepicks");
 }
});
