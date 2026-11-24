"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {marketReadiness,gradeEvidence,REQUIRED}=require("../src/sport-market-release-readiness.cjs");
const {MARKET_REGISTRY}=require("../src/nfl-market-registry.cjs");
test("all currently unverified NHL and NFL specialty rules abstain, including kicker and goalie",()=>{
 const x=marketReadiness();
 assert.equal(x.nflMarketCount,MARKET_REGISTRY.length);
 assert.ok(x.nhlResearchMarketCount>=5);
 assert.ok(x.nflKickingPuntingMarkets>0);
 assert.ok(x.nhl.find(v=>v.market==="hits").evidenceMissing.length>0);
 assert.ok(x.nhl.find(v=>v.market==="faceoffsWon").evidenceMissing.length>0);
 assert.ok(x.nhl.find(v=>v.market==="prizePicksGoalieFantasyScore")
  .evidenceMissing.includes("independent_prizepicks_goalie_scoring_chart"));
 assert.equal(x.eligibleAutomaticMarketCount,0);
 assert.equal(x.nfl.every(v=>v.automaticallySelectable===false),true);
});
test("even complete claimed requirements do not bypass independent model-release approval",()=>{
 const ready=Object.fromEntries(REQUIRED.map(x=>[x,true]));
 const report=marketReadiness({nhlEvidence:{hits:ready},nflEvidence:{passing_yards:ready}});
 assert.equal(gradeEvidence(ready).complete,true);
 assert.equal(report.nhl.find(x=>x.market==="hits").evidenceMissing.length,0);
 assert.equal(report.nhl.find(x=>x.market==="hits").automaticallySelectable,false);
 assert.equal(report.eligibleAutomaticMarketCount,0);
 assert.equal(report.noAutomaticModelPromotion,true);
});
