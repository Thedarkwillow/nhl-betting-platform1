"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {quantifyHistoricalUncertainty}=require("../src/nhl-historical-uncertainty.cjs");
const entries=Array.from({length:12},(_,i)=>({season:i<5?"2025-26":"2026-27",gameId:i+200,
 market:"shotsOnGoal",status:"evaluated",correct:i%3!==0,modelSelectedProbability:.62}));
test("clustered bootstrap is reproducible and respects games",()=>{
 const a=quantifyHistoricalUncertainty(entries),b=quantifyHistoricalUncertainty(entries);
 assert.deepEqual(a.all.exploratoryClusterBootstrap95,b.all.exploratoryClusterBootstrap95);
 assert.equal(a.all.distinctGames,12);
 assert.equal(a.bySeason["2025-26"].distinctGames,5);
 assert.equal(a.all.evaluated,12);
 assert.ok(a.all.exploratoryClusterBootstrap95[0]<=a.all.sampledHitRate);
 assert.ok(a.all.exploratoryClusterBootstrap95[1]>=a.all.sampledHitRate);
 assert.equal(a.calibrated,false);
});
test("returns null uncertainty when too few independent games",()=>{
 const a=quantifyHistoricalUncertainty(entries.slice(0,3));
 assert.equal(a.all.exploratoryClusterBootstrap95,null);
 assert.equal(a.bySeason["2026-27"].sampledHitRate,null);
});
test("game-clustered resampling keeps two props from one game together",()=>{
 const a=quantifyHistoricalUncertainty([...entries,
 {...entries[0],playerId:2,correct:false,modelSelectedProbability:.51}]);
 assert.equal(a.all.distinctGames,12);
 assert.equal(a.all.evaluated,13);
 assert.equal(a.probabilityBuckets["50-59%"].count,1);
 assert.equal(a.probabilityBuckets["60-69%"].count,12);
});
