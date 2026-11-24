"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit,KIND}=require("../src/nhl-standard-market-loss-priority-v1.cjs");
function source(){
 return {kind:"nhl_future_first_git_standard_vs_baseline_clusters_v1",
  status:"original_pregame_research_only",decided:1128,distinctPacificSlates:13,
  byOriginalMarket:{
   shotsOnGoal:{decided:506,modelHitRate:244/506,
    alwaysHigherSameLineHitRate:225/506,alwaysLowerSameLineHitRate:281/506},
   blockedShots:{decided:151,modelHitRate:73/151,
    alwaysHigherSameLineHitRate:72/151,alwaysLowerSameLineHitRate:79/151},
   points:{decided:302,modelHitRate:164/302,
    alwaysHigherSameLineHitRate:138/302,alwaysLowerSameLineHitRate:164/302},
   assists:{decided:163,modelHitRate:84/163,
    alwaysHigherSameLineHitRate:80/163,alwaysLowerSameLineHitRate:83/163}
  }};
}
test("ranks exact original Standard market loss without changing source or model",()=>{
 const src=source(),r=audit(src);
 assert.equal(r.kind,KIND);assert.equal(r.totalDecided,1128);
 assert.equal(r.totalMarketDecisionsIncluded,1122); // goals excluded explicitly
 assert.equal(r.mostModelWinsLostVsAlwaysLower,"shotsOnGoal");
 assert.equal(r.markets[0].expectedAdditionalWinsToMatchLower,37);
 assert.equal(r.markets[1].market,"blockedShots");
 assert.equal(r.markets[1].expectedAdditionalWinsToMatchLower,6);
 assert.equal(r.needsMinimumTwentySlates,true);
 assert.equal(r.newModelImprovementProven,false);
 assert.equal(r.automaticPolicySelection,false);
 assert.equal(r.actionableConfidenceApproved,false);
 assert.equal(r.bettingEligible,false);
 assert.deepEqual(src,source());
});
test("refuses invented retrospective benchmark and invalid side totals",()=>{
 const src=source();
 assert.equal(audit({...src,status:"unknown"}).status,"unverified_source");
 src.byOriginalMarket.points.alwaysHigherSameLineHitRate=.9;
 assert.equal(audit(src).status,"invalid_market_comparison");
 src.byOriginalMarket.points.alwaysHigherSameLineHitRate=138/302;
 src.byOriginalMarket.shotsOnGoal.decided=-10;
 assert.equal(audit(src).status,"invalid_market_comparison");
 assert.equal(audit({}).bettingEligible,false);
});
