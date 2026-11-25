"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {quota,freeBudget,summarize,run,observations,compareCandidates,quotaTransition}=require("../scripts/getodds-secure-preflight.cjs");
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
 assert.equal(r.dataRequests,0);assert.equal(r.status,"data_probe_blocked_free_allowance_not_proven");assert.equal(urls.length,1);
});
test("bounded source requests with explicit confirmed free allowance",async()=>{
 let dataCalls=0;
 const mock=async(u,o)=>{if(u.endsWith("/v4/sports"))return new Response("[]",{headers:{"x-requests-used":String(dataCalls),"x-requests-remaining":String(100-dataCalls),"x-requests-last":"0"}});dataCalls++;return new Response(JSON.stringify({data:[],meta:{complete:false}}),{headers:{"x-requests-used":String(dataCalls),"x-requests-remaining":String(100-dataCalls),"x-requests-last":"1"}});};
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
  const mock=async(u)=>{if(u.endsWith("/v4/sports"))return new Response("[]",{headers:{"x-requests-used":String(calls?2:0),"x-requests-remaining":String(calls?(q["x-requests-remaining"]==="999"?999:98):100),"x-requests-last":"0"}});calls++;return new Response(JSON.stringify({data:[]}),{headers:q});};
  const result=await run({GETODDSAPI:"synthetic",GETODDS_FREE_PLAN_CONFIRMED:"1"},mock);
  assert.equal(calls,1);assert.equal(result.stoppedAfterSource,"prizepicks");
 }
});

test("missing market headers trigger a refreshed quota check, not a second unguarded request",async()=>{
 let calls=0,metadata=0;const archive=[];
 const mock=async u=>{
  if(u.endsWith("/v4/sports")){metadata++;return new Response("[]",{headers:{"x-requests-used":String(calls),"x-requests-remaining":String(100-calls),"x-requests-last":"0"}});}
  const source=calls++===0?"prizepicks":"underdog";
  return new Response(JSON.stringify({data:[{source,id:source==="prizepicks"?"pp_123":"ud_456",line:15.5,league:"NBA",player:{id:"7",name:"Example Player"},market:{stat:"Points",period:"Full game"},observed_at:"2026-11-25T00:00:00Z"}],meta:{complete:false}}));
 };
 const r=await run({GETODDSAPI:"synthetic",GETODDS_FREE_PLAN_CONFIRMED:"1"},mock,archive,{kind:"restricted_kashrock_hltv_identity_and_projection_candidate_review_v1",projectionCandidates:[{projectionIdCandidate:"123",line:15.5}]});
 assert.equal(calls,2);assert.equal(metadata,3);assert.equal(archive.length,2);assert.equal(r.sources.underdog.quotaRefreshVerified,true);
 assert.equal(r.crossSourceCandidateAudit.exactCandidateIdMatches,1);assert.equal(r.crossSourceCandidateAudit.fullyVerifiedOriginalOffers,0);
 assert.equal(JSON.stringify(r).includes("Example Player"),false);
});
test("quota refresh rejects reset, missing values, or unexplained charges",()=>{
 const before={used:10,remaining:90,last:0};
 assert.equal(quotaTransition(before,{used:11,remaining:89,last:0}),true);
 for(const after of [{used:0,remaining:100,last:0},{used:12,remaining:88,last:0},{used:null,remaining:null,last:0}])assert.equal(quotaTransition(before,after),false);
});

test("targeted Underdog NHL request uses one data call and preserves strict quota stop",async()=>{
 let calls=0;const urls=[];
 const mock=async u=>{urls.push(u);if(u.endsWith("/v4/sports"))return new Response("[]",{headers:{"x-requests-used":String(calls?12:10),"x-requests-remaining":String(calls?88:90),"x-requests-last":"0"}});calls++;return new Response(JSON.stringify({data:[]}));};
 const result=await run({GETODDSAPI:"synthetic",GETODDS_FREE_PLAN_CONFIRMED:"1",GETODDS_TARGET_SOURCE:"underdog",GETODDS_TARGET_LEAGUE:"NHL"},mock);
 assert.equal(calls,1);assert.equal(urls[1],"https://getoddsapi.com/api/v1/markets?source=underdog&limit=5&league=NHL");
 assert.equal(result.stoppedAfterSource,"underdog");assert.equal(result.sources.underdog.quotaRefreshVerified,false);
 assert.equal(result.sources.prizepicks,undefined);
});
test("invalid target makes no market requests",async()=>{
 const urls=[];const mock=async u=>{urls.push(u);return new Response("[]",{headers:{"x-requests-used":"0","x-requests-remaining":"100","x-requests-last":"0"}});};
 const result=await run({GETODDSAPI:"synthetic",GETODDS_FREE_PLAN_CONFIRMED:"1",GETODDS_TARGET_SOURCE:"underdog",GETODDS_TARGET_LEAGUE:"unexpected"},mock);
 assert.equal(urls.length,1);assert.equal(result.status,"invalid_target_no_data_requests");
});
