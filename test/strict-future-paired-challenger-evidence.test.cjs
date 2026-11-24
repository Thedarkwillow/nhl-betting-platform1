"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {evaluate}=require("../src/strict-future-paired-challenger-evidence.cjs");
const policy="2026-11-17T18:00:00Z";
const base={sport:"NHL",market:"shotsOnGoal",originalOfferKey:"offer-1",
 gameId:"game-1",slate:"2026-11-18",originalSide:"Higher",
 originalLine:2.5,actual:4,championHigher:.55,challengerHigher:.64,
 sourceCapturedAt:"2026-11-18T12:00:00Z",
 originalFirstGitAt:"2026-11-18T12:03:00Z",
 shadowFrozenAt:"2026-11-18T12:05:00Z",
 shadowFirstGitAt:"2026-11-18T12:06:00Z",
 gameStartsAt:"2026-11-18T20:00:00Z",
 officialFinalAt:"2026-11-19T01:00:00Z",
 trainingLatestKnownAt:"2026-11-18T11:00:00Z",
 sideUnchanged:true,originalFirstGitVerified:true,
 shadowFirstGitVerified:true,officialStatVerified:true};
test("same frozen original line and higher/lower baseline always share denominator",()=>{
 const res=evaluate([base,{...base,originalOfferKey:"offer-2",gameId:"game-2",
  originalSide:"Lower",challengerHigher:.4,actual:1}],{policyFirstGitAt:policy});
 a.equal(res.evaluated,2);
 a.equal(res.distinctFinalGames,2);
 a.equal(res.championHitRate,1);
 a.equal(res.challengerHitRate,1);
 a.equal(res.alwaysHigherSameLinesRate,.5);
 a.equal(res.alwaysLowerSameLinesRate,.5);
 a.equal(res.calibratedProbability,null);
 a.equal(res.modelPromoted,false);
 a.equal(res.placedWagers,0);
});
test("old offers, uncommitted shadows, future features and changed sides are rejected",()=>{
 for(const change of [
  {sourceCapturedAt:"2026-11-17T17:00:00Z"},
  {shadowFirstGitVerified:false},
  {shadowFirstGitAt:"2026-11-18T19:55:00Z"},
  {trainingLatestKnownAt:"2026-11-18T12:07:00Z"},
  {sideUnchanged:false},
  {originalFirstGitVerified:false}]){
  const x=evaluate([{...base,...change}],{policyFirstGitAt:policy});
  a.equal(x.evaluated,0,JSON.stringify(change));
  a.equal(x.rejections.invalid_original_identity_or_clock,1);
 }
});
test("deduplicates original exact lines; a push isn't secretly graded as loss",()=>{
 const x=evaluate([base,base,{...base,originalOfferKey:"offer-3",
  gameId:"game-3",actual:2.5}],{policyFirstGitAt:policy});
 a.equal(x.evaluated,1);
 a.equal(x.pushes,1);
 a.equal(x.rejections.duplicate_original_threshold,1);
});
test("tiny or correlated future samples cannot release calibrated picks or lineups",()=>{
 const rows=Array.from({length:60},(_,i)=>({...base,
  originalOfferKey:"pick-"+i,gameId:"same-game",
  slate:"2026-11-18",actual:i%2?4:1}));
 const r=evaluate(rows,{policyFirstGitAt:policy});
 a.equal(r.evaluated,60);
 a.equal(r.distinctFinalGames,1);
 a.equal(r.distinctSlates,1);
 a.equal(r.initialEvidenceFloorMet,false);
 a.equal(r.pairedGameCluster95,null);
 a.equal(r.optimizedLineupsApproved,false);
});
test("abstentions must themselves be precommitted, not inserted after finals",()=>{
 const a1=evaluate([{...base,status:"abstain"}],{policyFirstGitAt:policy});
 const a2=evaluate([{...base,status:"abstain",
  shadowFirstGitAt:"2026-11-19T01:00:00Z"}],{policyFirstGitAt:policy});
 a.equal(a1.abstained,1);
 a.equal(a2.abstained,0);
 a.equal(a2.rejections.unverified_abstain_origin,1);
});
