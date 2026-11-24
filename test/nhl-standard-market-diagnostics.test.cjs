"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {MIN,one,wilson95,audit}=require("../src/nhl-standard-market-diagnostics.cjs");
const metric=(n,goals,{g=4,lo=6,push=1,pending=2}={})=>({
 decided:n,distinctGames:g,lowerModelChoices:lo,observedSelected:n+push+pending,
 pushes:push,ungraded:pending,modelWins:goals,alwaysHigherWins:Math.floor(n/2),
 alwaysLowerWins:n-Math.floor(n/2)
});
test("same exact selected lines score independent direction baselines with caveats",()=>{
 const m=one("shotsOnGoal",metric(20,12));
 assert.equal(m.decided,20);assert.equal(m.pending,2);assert.equal(m.pushes,1);
 assert.equal(m.modelObservedRate,0.6);
 assert.equal(m.hypotheticalHigherRate,0.5);
 assert.equal(m.pairedModelMinusHigher,0.1);
 assert.equal(m.descriptiveWilson95.lower<0.6,true);
 assert.equal(m.modelReleasePermitted,false);
 assert.equal(m.status,"insufficient_forward_market_games_or_lower_choices");
});
test("more selections alone cannot prove probability calibration or automatic picks",()=>{
 const m=one("assists",metric(250,200,{g:35,lo:50,push:0,pending:0}));
 assert.equal(m.status,"sample_minimum_reached_not_validated");
 assert.equal(m.independentlyValidatedProbabilityCalibration,false);
 assert.equal(m.authenticatedAvailableSides,false);
 assert.equal(m.modelReleasePermitted,false);
 assert.equal(m.predeclaredEvaluationEndUTC,MIN.evaluationEndUTC);
});
test("bad denominators and non-predeclared cohorts are quarantined",()=>{
 assert.equal(one("goals",{...metric(20,5),alwaysLowerWins:4}).status,
  "source_stats_inconsistent");
 assert.equal(audit({kind:"other"}).valid,false);
 const a=audit({kind:"nhl_frozen_same_threshold_baselines_v1",evidenceValid:true,
  postPolicySameSelectedLines:{byStandardMarket:{shotsOnGoal:metric(20,12),
   assists:metric(12,6,{g:2,lo:5,push:0,pending:0})}}});
 assert.equal(a.valid,true);assert.equal(a.markets.length,2);
 assert.equal(a.postPolicyOnly,true);
 assert.equal(a.promotionPermitted,false);
});
test("Wilson refuses impossible or zero-push-only denominators",()=>{
 assert.equal(wilson95(0,0),null);
 assert.equal(wilson95(2,1),null);
 const z=wilson95(6,10);
 assert.ok(z.lower<=0.6&&z.upper>=0.6);
});
