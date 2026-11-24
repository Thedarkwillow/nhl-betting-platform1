"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {inventory}=require("../src/dedicated-prop-model-roadmap.cjs");
const {MARKETS}=require("../src/nhl-market-registry.cjs");
const {MARKET_REGISTRY}=require("../src/nfl-market-registry.cjs");
test("each canonical market has a distinct policy and none is implicitly approved",()=>{
 const d=inventory(),nhl=d.models.filter(x=>x.sport==="NHL"),nfl=d.models.filter(x=>x.sport==="NFL");
 assert.deepEqual(nhl.map(x=>x.marketId).sort(),Object.keys(MARKETS).sort());
 assert.deepEqual(nfl.map(x=>x.marketId).sort(),MARKET_REGISTRY.map(x=>x.id).sort());
 assert.equal(new Set(d.models.map(x=>x.policyId)).size,d.models.length);
 assert.ok(d.models.every(x=>x.releaseApproved===false&&x.architecture&&x.featurePlan));
 assert.equal(nhl.find(x=>x.marketId==="faceoffsWon").status,"historical_candidate_implemented_pending_validation");
});
