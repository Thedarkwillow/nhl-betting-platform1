"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {benchmarkHistoricalSelections,pairedGameBootstrap}=require("../src/nhl-historical-baselines.cjs");
const sample=(n,game,outcome,side,prob=.67,season="2025-26")=>({
 status:"evaluated",correct:outcome===side,modelChosenSide:side,
 modelSelectedProbability:prob,officialOutcome:outcome,gameId:game,
 market:n%2?"shotsOnGoal":"assists",season
});
test("fixed Lower/Higher counterfactuals share denominator with model hits",()=>{
 const r=benchmarkHistoricalSelections([sample(1,1,"Lower","Higher"),
  sample(2,1,"Lower","Lower"),sample(3,2,"Higher","Higher"),
  sample(4,2,"Lower","Higher")]);
 assert.equal(r.all.samples,4);
 assert.equal(r.all.model.wins,2);
 assert.equal(r.all.alwaysLower.wins,3);
 assert.equal(r.all.alwaysHigher.wins,1);
 assert.equal(r.all.modelVsAlwaysLowerPoints,-25);
 assert.equal(r.gating.safeToUseForVerifiedLineupProbabilities,false);
 assert.equal(r.payoutAdjustedEV,null);
});
test("excludes pushes, pending rows, impossible probabilities, and unverified tiers",()=>{
 const r=benchmarkHistoricalSelections([
  sample(1,1,"Higher","Lower"),
  {...sample(2,1,"Push","Higher"),correct:null},
  {...sample(3,2,"Lower","Higher"),status:"missing"},
  {...sample(4,2,"Higher","Higher"),modelSelectedProbability:1}
 ]);
 assert.equal(r.all.samples,1);
 assert.equal(r.bySeason["2026-27"].samples,0);
 assert.equal(r.all.coinFlipBrierScore,.25);
});
test("paired confidence uses games as units and is deterministic, not independent props",()=>{
 const rows=Array.from({length:12},(_,i)=>sample(i,i+1,i%3?"Lower":"Higher",i%2?"Lower":"Higher"));
 const a=pairedGameBootstrap(rows),b=pairedGameBootstrap(rows);
 assert.deepEqual(a,b);
 assert.ok(a.lower95<=a.upper95);
 assert.equal(pairedGameBootstrap(rows.slice(0,3)),null);
});
