"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {rateLimits,querySportsGameOdds,queryPrizePicksApi}=require("../scripts/check-provider-api-quotas.cjs");
test("SGO output is intentionally strict allowlist: never disclose keyID, customerID, email",async()=>{
 let received=null,url=null;
 const r=await querySportsGameOdds("private-api-key",async(u,o)=>{
  url=u;received=o.headers["x-api-key"];
  return {ok:true,json:async()=>({success:true,data:{tier:"pro",isActive:true,
   keyID:"PRIVATE",customerID:"PRIVATE",email:"PRIVATE@example.com",
   rateLimits:{"per-minute":{"max-requests":300,"current-requests":4},
    "per-day":{"max-requests":500000,"current-requests":125}}}})};
 });
 assert.equal(received,"private-api-key");
 assert.equal(url,"https://api.sportsgameodds.com/v2/account/usage");
 assert.equal(r.status,"ok");assert.equal(r.tier,"pro");
 assert.equal(r.limits["per-minute"].maxRequests,300);
 assert.ok(!JSON.stringify(r).includes("PRIVATE"));
});
test("supports official older and current API usage shape",()=>{
 const r=rateLimits({"per-month":{maxEntitiesPerInterval:2500,currentIntervalEntities:12,
   currentIntervalEndTime:"2026-12-01T00:00:00Z"},
  "per-minute":{maxRequestsPerInterval:"unlimited",currentIntervalRequests:"n/a"}});
 assert.equal(r["per-month"].maxObjects,2500);
 assert.equal(r["per-month"].currentObjects,12);
 assert.equal(r["per-minute"].maxRequests,"unlimited");
 assert.equal(r["per-minute"].currentRequests,null);
});
test("PrizePicks docs request count from header only without reading body",async()=>{
 let url,headers;
 const r=await queryPrizePicksApi("private-secret",async(u,o)=>{
  url=u;headers=o.headers;
  return {ok:true,status:200,headers:{get:n=>({
   "x-ratelimit-remaining":"987","x-ratelimit-limit":"1000"
  }[n]||null)},json:async()=>{throw Error("Never read account body");}};
 });
 assert.equal(url,"https://prizepicksapi.com/api/v1/coverage");
 assert.equal(headers.Authorization,"Bearer private-secret");
 assert.equal(r.monthlyRequestsRemaining,987);
 assert.equal(r.monthlyRequestLimit,1000);
 assert.ok(!JSON.stringify(r).includes("private-secret"));
});
test("missing keys do not trigger requests",async()=>{
 assert.equal((await querySportsGameOdds(null)).status,"missing_key");
 assert.equal((await queryPrizePicksApi(null)).status,"missing_key");
});
