"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {compareUsageForecasts}=require("../src/nhl-usage-backtest.cjs");
const g=(i,saves=22,seconds=3600,type="goalie")=>({gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
 gameId:2026020000+i+1,playerId:1,type,timeOnIceSeconds:seconds,
 saves:type==="goalie"?saves:null,shotsOnGoal:type==="skater"?saves:null,
 blockedShots:type==="skater"?2:null,started:type==="goalie"?null:null});
test("walk-forward workload projection observes only earlier official player games",()=>{
 const arr=Array.from({length:8},(_,i)=>g(i,i===7?99:20));
 const a=compareUsageForecasts({players:{"1":arr}});
 assert.equal(a.evaluatedRows,3);
 assert.equal(a.byMarket.saves.observations,3);
 assert.equal(a.byMarket.saves.championMAE!==null,true);
 assert.equal(a.prospectiveHitRate,null);
 assert.equal(a.modelReleaseEligible,false);
 const changed=arr.map((x,i)=>i===7?{...x,saves:999}:x);
 const b=compareUsageForecasts({players:{"1":changed}});
 assert.equal(a.byMarket.saves.observations,b.byMarket.saves.observations);
 assert.ok(b.byMarket.saves.usageRateShadowMAE>a.byMarket.saves.usageRateShadowMAE);
});
test("skater role backtest handles shots and blocked shots independently",()=>{
 const arr=Array.from({length:8},(_,i)=>g(i,3,1100,"skater"));
 const x=compareUsageForecasts({players:{"1":arr}});
 assert.equal(x.byMarket.shotsOnGoal.observations,3);
 assert.equal(x.byMarket.blockedShots.observations,3);
 assert.equal(x.byMarket.saves.observations,0);
 assert.equal(x.actualPrizePicksLinesUsed,false);
});
test("no source observations cannot generate a fabricated performance edge",()=>{
 const x=compareUsageForecasts({players:{"1":[g(0)]}});
 assert.equal(x.byMarket.saves.observations,0);
 assert.equal(x.byMarket.saves.championMAE,null);
 assert.equal(x.byMarket.saves.usageRateShadowMAE,null);
});
