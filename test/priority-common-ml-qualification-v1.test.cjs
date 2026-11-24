"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{summarize,eligible}=require("../src/priority-common-ml-qualification-v1.cjs");
test("pending predictions never count as losses or qualified",()=>{
 const x=summarize([{sport:"NHL",market:"points",line:.5,gameId:1,slate:"2026-11-24",p:.6,base:.4,originalSide:"Lower",y:null}])["NHL|points|0.5"];
 assert.equal(x.registered,1);assert.equal(x.pending,1);assert.equal(x.decided,0);assert.equal(x.mlHitRate,null);assert.equal(x.eligibleForIndependentReview,false);
});
test("matched official outcomes measure direction and reliability but a small sample cannot qualify",()=>{
 const a=[{sport:"NHL",market:"points",line:.5,gameId:1,slate:"2026-11-24",p:.7,base:.4,originalSide:"Lower",y:1}];
 const x=summarize(a)["NHL|points|0.5"];assert.equal(x.mlWins,1);assert.equal(x.originalWins,0);assert.equal(x.alwaysHigher,1);assert.equal(x.alwaysLower,0);assert.equal(x.minimumEvidenceMet,false);assert.equal(x.eligibleForIndependentReview,false);assert.ok(x.mlBrier<x.originalBrier);
});
test("reject later or different training artifact",()=>{
 const at="2026-11-24T16:03:14Z",m={kind:"priority_common_features_logistic_shadow_v1",researchOnly:true,modelPromoted:false,calibrated:false,market:"nhl_points",line:.5,higher:.6,artifactFirstGitAt:at};
 assert.equal(eligible(m,"nhl_points",.5,at,"2026-11-24T16:03:37Z"),true);assert.equal(eligible(m,"nhl_points",.5,"2026-11-24T16:03:15Z","2026-11-24T16:03:37Z"),false);
});