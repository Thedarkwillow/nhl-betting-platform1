"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit,clusterCI}=require("../src/nfl-directional-bias-cluster-audit.cjs");
const group=(n,correct,games)=>({decided:n,correct,incorrect:n-correct,
 alwaysHigherSameLines:correct,alwaysLowerSameLines:n-correct,distinctFinalGames:games});
function original(games=14){
 const g=group(games*10,games*4,games);
 return {kind:"nfl_private_pregame_evidence_separated_outcome_audit_v1",
 nflverseFinalStatsNotPlatformSettlement:true,
 explicitFrozenDirections:{firstDistinctThresholdGrade:{
  kind:"nfl_original_first_distinct_threshold_official_stat_audit_v1",
  originalFirstGitBeforeKickoffProven:true,
  statisticsDerivedFromNflverseNotPlatformSettlement:true,
  earliestPerPlayerGameMarketAndLine:{...g,
   byGame:Object.fromEntries(Array.from({length:games},(_,i)=>["g"+i,group(10,4,1)])),
   byMarket:{passing_yards:g},bySelectedSide:{Higher:g}}
 }}};
}
test("original first-Git game clustered NFL comparison refuses directional flip",()=>{
 const x=audit(original());
 assert.equal(x.decided,140);assert.equal(x.distinctFinalGames,14);
 assert.equal(x.originalHitRate,.4);
 assert.equal(x.alwaysLowerRate,.6);
 assert.ok(x.originalMinusAlwaysLower95.upper<0);
 assert.deepEqual(x.marketsNeedingResearchReview,["passing_yards"]);
 assert.equal(x.automaticDirectionFlipAllowed,false);
 assert.equal(x.betterThanAlwaysLowerProven,false);
});
test("fake or altered market/game totals fail without confidence claim",()=>{
 const fake=original();fake.explicitFrozenDirections.firstDistinctThresholdGrade.earliestPerPlayerGameMarketAndLine.byMarket.passing_yards.correct++;
 assert.equal(audit(fake).status,"unreconciled_game_or_market_totals");
 assert.equal(audit({}).status,"unverified_frozen_grade");
 const thin=audit(original(5));
 assert.equal(thin.originalMinusAlwaysLower95,null);
 assert.deepEqual(thin.marketsNeedingResearchReview,[]);
});
test("resampling of whole games is deterministic and no single-row CI",()=>{
 const gs=[group(10,4,1),group(20,8,1),...Array(10).fill(0).map(()=>group(5,2,1))];
 assert.deepEqual(clusterCI(gs,"alwaysLowerSameLines",200),clusterCI(gs,"alwaysLowerSameLines",200));
 assert.equal(clusterCI([gs[0]],"alwaysLowerSameLines"),null);
});

test("NFL selected-side subtotals must reconcile to original first-threshold outcomes",()=>{
 const q=original();
 q.explicitFrozenDirections.firstDistinctThresholdGrade.earliestPerPlayerGameMarketAndLine.bySelectedSide.Higher.correct=60;
 assert.equal(audit(q).status,"unreconciled_game_or_market_totals");
 const x=audit(original());
 assert.equal(x.bySelectedSideResearch.Higher.decided,140);
 assert.equal(x.bySelectedSideResearch.Higher.automaticOppositeSideAuthorized,false);
});
