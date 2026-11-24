"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {wilson,evaluateProspectiveEvidence}=require("../src/nhl-prospective-evidence.cjs");
test("Wilson 95% interval is defined and never claims certainty from small n",()=>{
 assert.equal(wilson(0,0).rate,null);
 assert.equal(wilson(3,3).rate,1);
 assert.ok(wilson(3,3).lower<.5);
 assert.ok(wilson(3,3).upper<=1);
 assert.throws(()=>wilson(3,2),/Invalid/);
});
const row=(gameId,correct,tier="Standard")=>({
 gameId,gameDate:"2026-11-02",market:"shotsOnGoal",tier,
 lean:correct?"Higher":"Lower",result:"Higher",correct,
 probability:.72
});
test("Only decided precommitted individual direction evidence counts, never payout ROI",()=>{
 const r=evaluateProspectiveEvidence([
  row(1,true),row(2,false,"Goblin"),
  {...row(2,true),result:"Push",correct:null}],{precommitted:true});
 assert.equal(r.gradedDecisions,2);
 assert.equal(r.correct,1);
 assert.equal(r.observedHitRate,.5);
 assert.equal(r.meanModelProbability,.72);
 assert.equal(r.alwaysHigherBaseline,1);
 assert.equal(r.alwaysLowerBaseline,0);
 assert.equal(r.byTier.Standard.gradedDecisions,1);
 assert.equal(r.byTier.Goblin.gradedDecisions,1);
 assert.equal(r.gameClusterBootstrap95,null);
 assert.equal(r.bettingEdgeVerified,false);
 assert.equal(r.realizedPlatformROI,null);
 assert.equal(r.provisionalSampleGateSatisfied,false);
});
test("Reconstruction cannot be relabeled prospective even when perfect",()=>{
 const r=evaluateProspectiveEvidence([row(1,true),row(2,true)]);
 assert.equal(r.prospectivelyPrecommitted,false);
 assert.equal(r.bettingEdgeVerified,false);
 assert.match(r.reason,/after evaluated/);
});
test("Cluster uncertainty respects games and avoids same-game false sample independence",()=>{
 const rs=[];
 for(let i=0;i<30;i++)for(let j=0;j<8;j++)
  rs.push(row(300+i,i%3!==0));
 const r=evaluateProspectiveEvidence(rs,{precommitted:true});
 assert.equal(r.provisionalSampleGateSatisfied,true);
 assert.equal(r.distinctGames,30);
 assert.equal(r.gradedDecisions,240);
 assert.equal(r.gameClusterBootstrap95.method,"deterministic_game_cluster_bootstrap");
 assert.ok(r.gameClusterBootstrap95.hitRate95.lower<r.observedHitRate);
 assert.ok(r.gameClusterBootstrap95.hitRate95.upper>r.observedHitRate);
 assert.equal(r.calibrationApproved,false);
 assert.equal(r.bettingEdgeVerified,false);
});
