"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {replay}=require("../src/nhl-strict-historical-walkforward-v1.cjs");
const time="2026-11-08T17:00:00Z",commit="2026-11-08T17:01:00Z",
 captured="2026-11-08T16:55:00Z",start="2026-11-09T02:00:00Z";
function fixture(){
 const p={gameId:2026020222,playerId:8480001,market:"shotsOnGoal",
  tier:"Standard",lean:"Lower",line:2.5,team:"TOR",opponent:"MTL",
  capturedAt:captured,gameStartAt:start};
 const pos={...p,side:"Lower",defenseFactor:1.04,defense:{last10:{games:10}}};
 const s={generatedAt:time,individualPropSelections:[p],
  rankedProps:[{...p,probabilities:{higher:.48,lower:.52,push:0}}],
  positionRateMatchupV2:{rows:[pos]}};
 const games=Array.from({length:12},(_,i)=>({
  gameId:2026020100+i,playerId:p.playerId,market:p.market,
  type:"skater",gameState:"FINAL",
  gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  timeOnIceSeconds:950,powerPlayTimeOnIceSeconds:90,
  shortHandedTimeOnIceSeconds:50,shotsOnGoal:i%3+1,
  points:1,assists:0,goals:1,blockedShots:2,team:"TOR"
 }));
 games.push({gameId:p.gameId,playerId:p.playerId,type:"skater",
  gameState:"FINAL",gameDate:"2026-11-08",
  timeOnIceSeconds:900,shotsOnGoal:1,team:"TOR"});
 return {p,history:{players:{[p.playerId]:{games}}},
  frame:{snapshot:s,firstCommittedAt:commit,gitHistoryCount:1}};
}
test("historical same-line grade explicitly distinguishes reconstruction from first-Git",()=>{
 const {frame,history}=fixture(),r=replay([frame],history);
 a.equal(r.uniqueOriginalOffers,1);
 a.equal(r.allOriginal.decided,1);
 a.equal(r.allOriginal.originalWins,1);
 a.equal(r.allOriginal.alwaysLowerWins,1);
 a.equal(r.allOriginal.alwaysHigherWins,0);
 a.equal(r.strictKept.registered,0);
 a.equal(r.strictSkipped.registered,1);
 a.equal(r.recomputedModel.registered,1);
 a.equal(r.recomputedModel.originalHitRate,1);
 a.equal(r.flags.codePolicyWrittenAfterTargetDates,true);
 a.equal(r.flags.noHistoricalMoneyPuckAuthorizationInferred,true);
 a.equal(r.flags.modelPromoted,false);
});
test("no prior-game feature can be sourced from the target game or later",()=>{
 const {frame,history,p}=fixture(),r=replay([frame],history);
 const other=structuredClone(history);
 other.players[p.playerId].games.push({gameId:2026020250,playerId:p.playerId,
  type:"skater",gameState:"FINAL",gameDate:"2026-11-09",
  timeOnIceSeconds:2000,shotsOnGoal:25,team:"TOR"});
 const v=replay([frame],other);
 a.deepEqual(v.recomputedModel,r.recomputedModel);
 a.deepEqual(v.strictAbstentionReasons,r.strictAbstentionReasons);
});
test("modified originals and after-puck first commits must be excluded",()=>{
 const {frame,history}=fixture();
 a.equal(replay([{...frame,gitHistoryCount:2}],history).allOriginal.registered,0);
 a.equal(replay([{...frame,firstCommittedAt:"2026-11-10T02:00:00Z"}],
  history).allOriginal.registered,0);
 a.equal(replay([frame,frame],history).allOriginal.registered,1);
});
test("unsupported full-number or absent original source sides cannot enter cohort",()=>{
 const {frame,history}=fixture();
 const bad=structuredClone(frame);bad.snapshot.individualPropSelections[0].line=3;
 a.equal(replay([bad],history).allOriginal.registered,0);
 const missing=structuredClone(frame);missing.snapshot.rankedProps=[];
 a.equal(replay([missing],history).allOriginal.registered,0);
});
