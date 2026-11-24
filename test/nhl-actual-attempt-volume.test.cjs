"use strict";const test=require("node:test"),a=require("node:assert/strict"),{forecast}=require("../scripts/report-nhl-actual-attempt-volume.cjs"),{shotAttemptEvidence}=require("../src/nhl-official-period-events.cjs");test("missing shot attempt event identity fails closed",()=>{const p={playerId:1,type:"skater",shotsOnGoal:1,timeOnIceSeconds:900},e={typeDescKey:"shot-on-goal",periodDescriptor:{periodType:"REG"},details:{shootingPlayerId:1}};a.equal(shotAttemptEvidence({plays:[e]},[p])[0].shotAttempts,1);a.deepEqual(shotAttemptEvidence({plays:[e,{...e,details:{}}]},[p]),[]);a.equal(forecast([],[],[]),null);});
test("fixed pregame shot attempt recency requires at least 16 OFFICIAL previous games",()=>{
 const {forecast}=require("../scripts/report-nhl-actual-attempt-volume.cjs");
 const h=Array.from({length:17},(_,i)=>{
  const shots=i>11?3:2,missed=1,blocked=2;
  return {source:"official_final_pbp_sog_reconciled",
   shotAttempts:shots+missed+blocked,shotsOnGoal:shots,
   missedAttempts:missed,blockedAttempts:blocked,
   timeOnIceSeconds:1050+i*8,powerPlayTimeOnIceSeconds:100,
   gameState:"OFF"};
 });
 const defense=Array(15).fill(50),league=Array(40).fill(50);
 const old=forecast(h.slice(0,15),defense,league),v=forecast(h,defense,league);
 a.equal(old.attemptRecency,null);
 a.equal(old.defenseRecency,null);
 a.ok(v.attemptRecency>0&&Number.isFinite(v.attemptRecency));
 a.ok(v.defenseRecency>0&&Number.isFinite(v.defenseRecency));
 a.ok(Number.isFinite(v.attempt));
 a.ok(Number.isFinite(v.defense));
 a.equal(v.defenseRecency,v.attemptRecency); // neutral opponent factor 1
});
test("matched game and day bootstrap does not count three synthetic thresholds as independent slates",()=>{
 const {pairedInterval,seasonForDay}=require("../scripts/report-nhl-actual-attempt-volume.cjs");
 const groups=Array.from({length:35},()=>({n:18,sum:-.018*18}));
 const ci=pairedInterval(groups,{minimum:30,replicates:400});
 a.ok(Math.abs(ci.lower+.018)<1e-10);
 a.ok(Math.abs(ci.upper+.018)<1e-10);
 a.equal(ci.syntheticThresholdsOnly,true);
 a.equal(ci.originalPlatformLineVerified,false);
 a.equal(pairedInterval(groups.slice(0,19),{minimum:20}),null);
 a.equal(seasonForDay("2026-11-18"),"2026-27");
 a.equal(seasonForDay("2026-05-18"),"2025-26");
});
