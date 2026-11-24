"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {proof,nhl,nfl,evaluate,weekendDays}=require("../src/weekend-offday-preflight.cjs");
const starts="2026-11-21T18:00:00Z",at="2026-11-20T23:09:52Z",git="2026-11-20T23:10:01Z";
const p={gameId:2026020359,playerId:8480830,team:"CAR",opponent:"EDM",
 market:"shotsOnGoal",line:2.5,tier:"Standard",lean:"Higher",probability:.63,
 gameStartAt:starts,capturedAt:"2026-11-20T23:09:32Z"};
function nhlFrame(){
 const s={generatedAt:at,boardAsOfAt:"2026-11-20T23:09:32Z",
  rankedProps:[{...p,probabilities:{higher:.63,lower:.37,push:0}}],
  individualPropSelections:[p],standardAdaptiveResearchV2:{rows:[]},
  standardQualityShadowV2:{
   kind:"nhl_standard_market_quality_challenger_20261120_v2",
   rows:[{...p,originalSide:"Higher",status:"shadow_abstain",
    reason:"unverified_or_negative_pregame_availability"}]}};
 return {snapshot:s,firstGitCommittedAt:git,gitHistoryCount:1};
}
const nflP={id:"original-a",season:2026,week:11,market:"rushing_yards",line:39.5,
 tier:"Standard",selectedSide:"Higher",offeredSide:"Higher",
 autoPickEligible:false,probability:null,
 eventStartsAt:"2026-11-22T18:00:00Z"};
function nflFrame(){
 const s={createdAt:"2026-11-20T23:06:41Z",
  sourceBoardAsOfAt:"2026-11-20T23:05:41Z",selections:[nflP],
  usageDirectionShadowV3:{kind:"nfl_rushing_and_combo_abstaining_challenger_20261120_v3",
    rows:[{originalId:nflP.id,originalMarket:nflP.market,
     originalLine:nflP.line,originalSide:nflP.selectedSide,
     status:"shadow_selected_research_only",bettingEligible:false,
     officialGameDayActive:false}]}
 };
 return {snapshot:s,firstGitCommittedAt:"2026-11-20T23:06:45Z",gitHistoryCount:1};
}
test("NFL weekend count stays explicitly unverified and not betting eligible",()=>{
 const o=nfl(nflFrame(),"2026-11-20T23:20:00Z");
 assert.equal(o.proof.precommitValid,true);
 assert.equal(o.all.original,1);
 assert.equal(o.all.shadowSelected,1);
 assert.equal(o.all.officialActiveVerified,0);
 assert.equal(o.officialGameDayActiveStillUnverified,true);
 assert.equal(o.bettingApproved,false);
 assert.equal(o.proof.policyEligible,false);
});
test("NHL separates availability blocks from past-only model evidence, no promotion",()=>{
 const o=nhl(nhlFrame(),"2026-11-20T23:20:00Z");
 assert.equal(o.all.originalExactVerified,1);
 assert.equal(o.all.shadowAbstained,1);
 assert.equal(o.all.availabilityBlocks,1);
 assert.equal(o.all.modelOnlyWithoutRosterProof,0);
 assert.equal(o.byMarket.shotsOnGoal.modelOnlyReasons.missing_original_frozen_adaptive_evidence,1);
 assert.equal(o.status,"early_prepolicy_diagnostic_only");
 assert.equal(o.bettingApproved,false);
});
test("no first Git commit, changed original or after kickoff is not valid",()=>{
 const s=nhlFrame();
 assert.equal(nhl({...s,gitHistoryCount:2},"2026-11-20T23:20:00Z").all.selectedOriginal,0);
 const z=nhlFrame();z.snapshot.individualPropSelections[0]={...p,line:5.5};
 assert.equal(nhl(z,"2026-11-20T23:20:00Z").all.originalExactVerified,0);
 const v=nhlFrame();v.firstGitCommittedAt="2026-11-21T18:00:00Z";
 assert.equal(v.snapshot.individualPropSelections.length,1);
 assert.equal(nhl(v,"2026-11-20T23:20:00Z").all.firstGitFutureOriginal,0);
});
test("no verified platform quotes or settlements are inferred from a valid frozen board",()=>{
 const z=evaluate({nhlFrame:nhlFrame(),nflFrame:nflFrame(),now:"2026-11-20T23:20:00Z",
  platform:{authenticatedExactAppOffers:0,authenticatedExactPayoutQuotes:0,
   authenticatedFinalSettlements:0},trial:{nhl:{all:{decided:0}},nfl:{all:{decided:0}}}});
 assert.equal(z.platformEvidence.verifiedExactOffers,0);
 assert.equal(z.bettingRecommendationsApproved,false);
 assert.equal(z.strictTrial.noHoldoutOutcomesUsedForModelTuning,true);
 assert.equal(z.realEntriesPlaced,0);
});

test("each Friday chooses the next Pacific Saturday NHL and Sunday NFL slate",()=>{
 assert.deepEqual(weekendDays("2026-11-20T23:20:00Z"),{saturday:"2026-11-21",sunday:"2026-11-22"});
 assert.deepEqual(weekendDays("2026-11-27T23:20:00Z"),{saturday:"2026-11-28",sunday:"2026-11-29"});
});

test("previous Standard market evidence stays descriptive and cannot train new future policy",()=>{
 const x=evaluate({nhlFrame:nhlFrame(),nflFrame:nflFrame(),now:"2026-11-20T23:20:00Z",
  historicalNhlStandard:{kind:"private_nhl_standard_proof_v1",scorecard:{
   "market:assists":{decided:22,distinctGames:12,distinctDates:5,
    hitRates:{model:.18,challenger:.32,alwaysHigher:.4,alwaysLower:.6}}}}});
 assert.equal(x.olderFrozenStandardMarketDiagnostics.assists.decided,22);
 assert.equal(x.olderFrozenStandardMarketDiagnostics.assists.modelImprovementProven,false);
 assert.equal(x.historicalResultsNotTrainingDataForNewRules,true);
 assert.equal(x.strictTrial.noHoldoutOutcomesUsedForModelTuning,true);
});

test("NFL unsupported unscored markets are distinguished from genuine abstentions",()=>{
 const frame=nflFrame();
 frame.snapshot.selections.push({...nflP,id:"original-not-supported",market:"pass_rush_yards"});
 const result=nfl(frame,"2026-11-20T23:20:00Z");
 assert.equal(result.all.original,2);
 assert.equal(result.all.shadowSelected,1);
 assert.equal(result.all.shadowAbstained,0);
 assert.equal(result.all.unscoredShadow,1);
 assert.equal(result.byMarket.pass_rush_yards.unscoredShadow,1);
});

test("untrusted NFL shadow active=true NEVER clears the official participation hold",()=>{
 const f=nflFrame();
 f.snapshot.usageDirectionShadowV3.rows[0].officialGameDayActive=true;
 const result=nfl(f,"2026-11-20T23:20:00Z");
 assert.equal(result.all.shadowSelected,1);
 assert.equal(result.all.officialActiveVerified,0);
 assert.equal(result.all.participationHolds,1);
 assert.equal(result.all.untrustedShadowActiveClaims,1);
 assert.equal(result.byMarket.rushing_yards.participationHolds,1);
 assert.equal(result.byMarket.rushing_yards.reasons.unverified_shadow_active_assertion,1);
 assert.equal(result.officialGameDayActiveStillUnverified,true);
 assert.equal(result.independentOfficialPositivePlayerEvidenceJoined,false);
 assert.equal(result.bettingApproved,false);
});
