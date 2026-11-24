"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {observedPeriodHistory,periodCountModel,buildPeriodMarketResearch,
 walkForwardPeriodDiagnostics}=require("../src/nhl-period-count-model.cjs");
const {validatePeriodStatOffer}=require("../src/nhl-combo-period-research.cjs");
const playerId=8479001,start=2026020100;
const day=i=>"2026-10-"+String(i+1).padStart(2,"0");
function history(n=12){
 const p={"1":[],"2":[],"3":[]};
 for(let i=0;i<n;i++)for(const per of [1,2,3])
  p[String(per)].push({playerId,gameId:start+i,gameDate:day(i),
   period:per,playedInPeriod:true,shotsOnGoal:per+(i%3),
   goals:i%5===0?1:0,assists:i%4===0?1:0,
   points:Number(i%5===0)+Number(i%4===0),blockedShots:i%2,
   saves:null,hits:2,faceoffsWon:null,timeOnIceSeconds:420});
 return {kind:"nhl_official_period_history_v1",sourceDates:[day(0),day(n-1)],
  completedGames:n,playerPeriodObservations:n*3,players:{[playerId]:p}};
}
test("period forecasts use strictly prior exact period rows, not full-game/next-game data",()=>{
 const h=history();
 const cutoff=day(8)+"T19:00:00Z";
 const rows=observedPeriodHistory(h,playerId,1,"shotsOnGoal",cutoff);
 assert.equal(rows.length,8);
 assert.equal(rows.at(-1).gameDate,day(7));
 const m=periodCountModel(rows,"shotsOnGoal");
 assert.equal(m.count,8);
 assert.equal(m.readyForResearch,true);
 assert.equal(m.readyForLineups,false);
 assert.equal(m.probabilityHigher,null);
 assert.ok(m.estimate>0&&m.estimate<5);
 const shadow=buildPeriodMarketResearch(h,{asOf:cutoff});
 assert.equal(shadow.playerCount,1);
 assert.equal(shadow.players[String(playerId)]["1"].shotsOnGoal.count,8);
 assert.equal(shadow.players[String(playerId)]["2"].shotsOnGoal.count,8);
 assert.equal(shadow.players[String(playerId)]["3"].shotsOnGoal.count,8);
 assert.equal(shadow.players[String(playerId)]["1"].hits.count,8);
 assert.equal(shadow.players[String(playerId)]["1"].faceoffsWon,undefined);
 assert.equal(shadow.productionEligible,false);
 assert.equal(shadow.automaticLineupEligible,false);
 assert.equal(shadow.noOriginalPlatformLineQuotesUsed,true);
});
test("period diagnostic is walk-forward; later outcomes cannot become earlier training samples",()=>{
 const h=history(20);
 const r=walkForwardPeriodDiagnostics(h);
 const first=r.byMarket["1|shotsOnGoal"];
 assert.equal(first.walkForwardPlayerPeriodPredictions,12);
 assert.equal(first.distinctHeldoutGames,12);
 assert.equal(first.distinctHeldoutDates,12);
 assert.equal(first.fixedThresholdCount,36);
 assert.ok(first.poissonBrier>=0&&first.poissonBrier<=1);
 assert.ok(first.rollingMeanBaselineMae>=0);
 assert.equal(first.passesMinimumDiagnosticSize,false);
 assert.equal(first.realPlatformOfferedLinesUsed,false);
 assert.equal(r.platformOfferedLinesVerified,false);
 assert.equal(r.productionPromotionAllowed,false);
 assert.equal(r.provenBettingEdge,false);
 const onlyLater=walkForwardPeriodDiagnostics(h,{fromDate:day(12)});
 assert.equal(onlyLater.byMarket["1|shotsOnGoal"].walkForwardPlayerPeriodPredictions,8);
 const altered=history(20);
 altered.players[String(playerId)]["1"][19].shotsOnGoal=900;
 const previous=buildPeriodMarketResearch(h,{asOf:day(19)+"T23:00:00Z"});
 const changed=buildPeriodMarketResearch(altered,{asOf:day(19)+"T23:00:00Z"});
 assert.equal(previous.players[String(playerId)]["1"].shotsOnGoal.estimate,
  changed.players[String(playerId)]["1"].shotsOnGoal.estimate);
});
test("null periods and unplayed periods never count as zero-period training samples",()=>{
 const h=history();
 h.players[String(playerId)]["1"][0].shotsOnGoal=null;
 h.players[String(playerId)]["1"][1].playedInPeriod=false;
 const first=observedPeriodHistory(h,playerId,1,"shotsOnGoal",day(8)+"T23:00:00Z");
 assert.equal(first.length,6);
 assert.equal(periodCountModel(first,"shotsOnGoal"),null);
 const shadow=buildPeriodMarketResearch(h,{asOf:day(8)+"T23:00:00Z"});
 assert.equal(shadow.players[String(playerId)]?.["1"]?.shotsOnGoal,undefined);
 assert.equal(shadow.players[String(playerId)]["2"].shotsOnGoal.count,8);
});
test("offer validation observes market-specific official history but never self-approves settlement",()=>{
 const h=history();
 const offer={period:"2nd period",officialPlayerId:playerId,
  officialGameId:2026020321,market:"shotsOnGoal"};
 const out=validatePeriodStatOffer(offer,h);
 assert.equal(out.officialSampleCount,12);
 assert.equal(out.reason,"original_period_offer_and_settlement_not_verified");
 assert.equal(out.eligible,false);
});

test("fixed prior-only blend reports calibration and loss without approving deployment",()=>{
 const r=walkForwardPeriodDiagnostics(history(20)),x=r.byMarket["1|shotsOnGoal"],b=x.fixedBlendResearch;
 assert.ok(b.brier>=0&&b.brier<=1);
 assert.ok(b.logLoss>=0&&b.poissonLogLoss>=0);
 assert.equal(b.reliability.reduce((s,z)=>s+z.n,0),x.fixedThresholdCount);
 assert.equal(b.syntheticThresholdsOnly,true);assert.equal(b.approved,false);
 assert.equal(x.probabilityCalibrationApproved,false);
});
