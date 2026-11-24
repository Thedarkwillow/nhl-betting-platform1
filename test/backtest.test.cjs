"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {evaluate}=require("../src/backtest.cjs");
const history={players:{"1":{playerId:1,name:"A. Example",team:"BOS",type:"skater",
 games:Array.from({length:8},(_,i)=>({gameId:i+1,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
 shotsOnGoal:i===7?10:2,goals:0,assists:0,points:0,blockedShots:1}))}}};
test("backtest predicts only games after minimum history",()=>{
 const r=evaluate(history,{thresholds:[1.5]});
 assert.equal(r.predictions,3*5);
 assert.equal(r.distinctGameDates,3);
 assert.equal(r.overall.samples,15);
 assert.ok(r.overall.brier.weighted>=0&&r.overall.brier.weighted<=1);
 assert.ok(r.overall.brier.season>=0&&r.overall.brier.last5>=0);
});
test("backtest reports insufficient calibration bucket sample sizes",()=>{
 const r=evaluate(history,{thresholds:[1.5],minSamples:30});
 assert.ok(r.calibrationBuckets.every(x=>!x.sufficientSamples));
});

test("does not select a market model from only three evaluation dates",()=>{
 const r=evaluate(history,{thresholds:[1.5]});
 assert.equal(r.marketDecisions.shotsOnGoal.eligibleForModelSelection,false);
 assert.equal(r.marketDecisions.shotsOnGoal.recommendation,null);
 assert.equal(r.calibrationByMarket.shotsOnGoal.length,10);
});
