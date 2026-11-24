"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {audit}=require("../src/past-only-calibration-research.cjs");
const d=i=>new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10);
function row(i,j=0){
 const date=d(i),final=new Date(Date.parse(date+"T20:00:00Z")+21600000).toISOString();
 return {sport:"NHL",tier:"Standard",gameId:"game-"+i,slate:date,market:"shotsOnGoal",
  originalOfferKey:"offer-"+i+"-"+j,originalSourceAt:date+"T12:00:00Z",
  originalFirstGitAt:date+"T12:04:00Z",gameStartsAt:date+"T20:00:00Z",
  officialFinalAt:final,originalFirstGitVerified:true,
  officialStatVerified:true,sideUnchanged:true,
  originalHigher:.45+(j%3)*.1,higherOutcome:(i+j)%2};
}
const fitAt="2026-03-01T00:00:00Z";
test("calibration withheld on correlated 9-slate NHL dataset",()=>{
 const old=Array.from({length:180},(_,j)=>row(j%9,j));
 const v=audit(old,{fitAt});
 a.equal(v.fittedModels.length,0);
 a.equal(v.training.slates,9);
 a.equal(v.calibratedProbabilityApproved,false);
 a.equal(v.modelPromoted,false);
});
test("pretrained Platt and beta are diagnostic only, even with enough past data",()=>{
 const train=Array.from({length:180},(_,j)=>row(j%30,j));
 const future=Array.from({length:48},(_,j)=>row(65+(j%8),j));
 const v=audit([...train,...future],{fitAt});
 a.equal(v.training.games,30);
 a.equal(v.training.slates,30);
 a.equal(v.fittedModels.includes("platt"),true);
 a.equal(v.fittedModels.includes("beta"),true);
 a.equal(v.future.games,8);
 a.equal(v.futureIndependentEvaluationFloorMet,false);
 a.equal(v.calibratedProbabilityApproved,false);
 a.equal(v.platformSettlementVerified,false);
 a.ok(Number.isFinite(v.calibrated.platt.train.brier));
 a.ok(Number.isFinite(v.calibrated.beta.train.logLoss));
});
test("unverified and post-fit final outcomes cannot leak into calibrator fit",()=>{
 const train=Array.from({length:180},(_,j)=>row(j%30,j));
 train[0].originalFirstGitVerified=false;
 train[1].officialFinalAt="2026-03-10T00:00:00Z";
 train[2].originalFirstGitAt="2026-01-01T21:00:00Z";
 const v=audit(train,{fitAt});
 a.equal(v.training.decisions,177);
 a.equal(v.calibratedProbabilityApproved,false);
});
test("invalid cutoff has zero eligible models",()=>{
 const s=audit([row(0)],{fitAt:"not-a-date"});
 a.equal(s.training.decisions,0);
 a.equal(s.status,"missing_fit_freeze_timestamp");
});

test("calibrators must be trained separately by sport, market and tier",()=>{
 const mixed=[row(0),{...row(1),market:"blockedShots"}];
 const v=audit(mixed,{fitAt});
 a.equal(v.status,"mixed_sport_market_or_tier_must_fit_separately");
 a.equal(v.calibratedProbabilityApproved,false);
});
