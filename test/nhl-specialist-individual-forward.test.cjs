"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit,KIND}=require("../src/nhl-specialist-individual-forward.cjs");
test("specialist audit needs first Git proof and final role-correct boxscore",()=>{
 const generatedAt="2026-11-14T19:00:00Z",start="2026-11-15T00:00:00Z";
 const row={gameId:100,playerId:200,team:"NYR",opponent:"BOS",matchup:"NYR vs BOS",
 eventStartsAt:start,gameStartAt:start,market:"hits",line:2.5,tier:"Standard",lean:"Higher",probability:.7,
 probabilities:{higher:.7,lower:.3,push:0},capturedAt:generatedAt,experimentalMarketResearchOnly:true,
 experimentalMarketEvidence:{modelBuiltAt:"2026-11-14T17:00:00Z"},autoPickEligible:false};
 const f={firstCommittedAt:"2026-11-14T19:01:00Z",gitHistoryCount:1,snapshot:{generatedAt,specialistIndividualResearch:{kind:KIND,generatedAt,rows:[row],researchOnly:true,separateFromChampion:true,autoPickEligible:false}}};
 const schedule={complete:true,games:[{id:100,home:"NYR",away:"BOS",startTimeUTC:start}]};
 const game={gameId:100,playerId:200,type:"skater",timeOnIceSeconds:900,gameState:"OFF",hits:4,gameDate:"2026-11-14"};
 const h={players:{200:{games:[game]}}},policy="2026-11-14T18:00:00Z";
 const a=audit([f,f],h,schedule,policy);
 assert.equal(a.byMarket.hits.correct,1);
 assert.equal(a.byMarket.hits.registered,1);assert.equal(a.summary.graded,1);
 assert.equal(a.modelPromoted,false);assert.equal(a.separateFromChampion,true);
 game.gameState="LIVE";assert.equal(audit([f],h,schedule,policy).summary.graded,0);
 game.gameState="OFF";game.timeOnIceSeconds=0;assert.equal(audit([f],h,schedule,policy).summary.graded,0);
 f.firstCommittedAt=start;assert.equal(audit([f],h,schedule,policy).summary.selected,0);
});
