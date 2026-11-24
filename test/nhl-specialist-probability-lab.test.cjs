"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {study}=require("../src/nhl-specialist-probability-lab.cjs");
const {eligibilityReason}=require("../src/nhl-specialist-individual-forward.cjs");
test("specialist lab holds out same date, excludes unfinished and nonparticipants, no deploy claim",()=>{
 const games=Array.from({length:10},(_,i)=>({gameDate:"2026-10-"+String(i+1).padStart(2,"0"),gameId:i+1,gameState:"OFF",type:"skater",timeOnIceSeconds:1000,hits:i%4}));
 games.push({...games[9],gameId:11,gameState:"LIVE",hits:100},{...games[9],gameId:12,timeOnIceSeconds:0,hits:100});
 const r=study({players:{1:{type:"skater",games}}});
 assert.equal(r.byMarket.hits.thresholdEvaluations,6);
 assert.equal(r.byMarket.hits.distinctGames,2);
 assert.equal(r.byMarket.hits.calibrationApproved,false);
 assert.equal(r.realPlatformLinesUsed,false);
});
test("specialist rejection records distinct mathematical and identity prerequisites",()=>{
 const p={market:"hits",probabilities:{higher:.4,lower:.6,push:0},lean:"Higher",probability:.4};
 assert.equal(eligibilityReason(p,"2026-11-14T20:00:00Z"),"offered_side_not_above_half");
 assert.equal(eligibilityReason({...p,probability:.7},"2026-11-14T20:00:00Z"),"selected_probability_vector_mismatch");
});
