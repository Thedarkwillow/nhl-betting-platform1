"use strict";const {test}=require("node:test"),assert=require("node:assert/strict");
const {audit}=require("../src/nfl-directional-v2-forward-grade.cjs");const {KIND,POLICY}=require("../src/nfl-directional-v2-prospective.cjs");
const start="2026-11-22T18:00:00Z",time="2026-11-20T12:00:00Z",commit="2026-11-20T12:00:01Z";
const r={originalId:"f1",sourceGameId:"g1",historicalPlayerId:"player",market:"receiving_yards",originalSide:"Lower",originalLine:42.5,originalFrozenProjection:33,eventStartsAt:start,status:"directional_candidate_research_only",candidateOnly:true,originalDirectionUnchanged:true};
const s={kind:KIND,policy:POLICY,originalSidesUnchanged:true,approvedForProduction:false,noOutcomeStatsConsumed:true,createdAt:time,originalFirstGitCommittedAt:"2026-11-20T11:59:00Z",rows:[r]};
const grade={kind:"nfl_private_pregame_evidence_separated_outcome_audit_v1",nflverseFinalStatsNotPlatformSettlement:true,explicitFrozenDirections:{rows:[{id:"f1",modeledSide:"Lower",line:42.5,modelProjection:33,sourceGameId:"g1",market:"receiving_yards",officialScheduleGameId:"2026_11_TEST",status:"decided",actualSide:"Lower",selectedSideResult:"correct"}]}};
test("future V2 scores original side only on pre-kickoff first-Git proof, against same threshold",()=>{
 const a=audit([{snapshot:s,firstGitAt:commit,gitHistoryCount:1}],grade);
 assert.equal(a.uniqueThresholds.decided,1);assert.equal(a.onePerPlayerMarket.correct,1);
 assert.equal(a.onePerPlayerMarket.alwaysLower,1);assert.equal(a.evidenceMinimumMet,false);
 assert.equal(a.productionApproved,false);
});
test("late shadow, repeated quote or missing opponent final never counts as independent validated win",()=>{
 const a=audit([{snapshot:s,firstGitAt:commit,gitHistoryCount:1},{snapshot:s,firstGitAt:commit,gitHistoryCount:1}],grade);
 assert.equal(a.uniqueThresholds.decided,1);assert.equal(a.rejections.repeated_threshold_observation,1);
 const b=audit([{snapshot:s,firstGitAt:"2026-11-23T00:00:00Z",gitHistoryCount:1}],grade);
 assert.equal(b.uniqueThresholds.decided,0);
});

test("precommitted new NFL selective shadow only contributes after its genuine policy first commit",()=>{
 const {KIND:selectKIND}=require("../src/nfl-market-usage-selective-future-v1.cjs");
 const recent={...s,selectivePolicyFirstGitAt:"2026-11-20T11:58:00Z",
  selectiveMarketPolicy:selectKIND,
  rows:[{...r,selectiveFuture:{kind:selectKIND,status:"selective_future_research_candidate_only",
   originalSideUnchanged:true,bettingEligible:false}}]};
 const a=audit([{snapshot:recent,firstGitAt:commit,gitHistoryCount:1}],grade);
 assert.equal(a.selectiveFuture.onePerPlayerMarket.decided,1);
 assert.equal(a.selectiveFuture.onePerPlayerMarket.originalHitRate,1);
 assert.equal(a.selectiveFuture.onePerPlayerMarket.alwaysLowerSameThresholdRate,1);
 assert.equal(a.selectiveFuture.productionApproved,false);
 const forged={...recent,selectivePolicyFirstGitAt:"2026-11-21T00:00:00Z"};
 const b=audit([{snapshot:forged,firstGitAt:commit,gitHistoryCount:1}],grade);
 assert.equal(b.selectiveFuture.onePerPlayerMarket.decided,0);
 assert.equal(b.onePerPlayerMarket.decided,1);
});
