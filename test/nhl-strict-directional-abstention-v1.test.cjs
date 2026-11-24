"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const challenger=require("../src/nhl-strict-directional-abstention-v1.cjs");
const {audit}=require("../src/nhl-strict-directional-forward-audit-v1.cjs");
const {analyze}=require("../src/nhl-original-line-directional-bias-diagnostic-v1.cjs");
const quality=require("../src/nhl-standard-quality-challenger-v2.cjs");
const inputAB=require("../src/nhl-standard-input-frozen-ab-v1.cjs");
const time="2026-11-21T02:00:00Z",firstGit="2026-11-21T02:00:35Z",
 start="2026-11-22T02:00:00Z",captured="2026-11-21T01:55:00Z";
function standard(market="shotsOnGoal",side="Higher"){
 return {gameId:2026020667,playerId:8480001,market,tier:"Standard",
  lean:side,line:market==="shotsOnGoal"?2.5:.5,probability:.82,
  capturedAt:captured,gameStartAt:start,team:"TOR",opponent:"MTL"};
}
function factor(p,overrides={}){
 return {gameId:p.gameId,playerId:p.playerId,market:p.market,tier:p.tier,
  originalSide:p.lean,line:p.line,capturedAt:p.capturedAt,
  gameStartAt:p.gameStartAt,status:"research_only_conditional_on_appearance",
  opponentFactorUsed:true,
  iceTime:{ppVerifiedHistory:true,pkVerifiedHistory:true,
   instableRecentUsage:false},
  shotConversion:{status:"source_verified_pregame"},
  evidence:{assists:{sourceGoalOpportunityAvailable:true,
    projectedPowerPlayGroup:"pp1",lineMatesProjected:2,
    individualPPAssistHistoryVerified:false},
   blocks:{opponentShotAttemptsVerified:true,defensiveZoneStartsVerified:true}},
  models:{opponentAdjusted:.82,dist_empirical:.8,
   dist_shifted:.78,shotAttemptConversion:.85,
   teammateAndRole:.83,defensiveExposure:.82},...overrides};
}
test("market directional Higher and Lower have distinct fixed margins and past agreement",()=>{
 const h=standard(),r=challenger.assess(h,factor(h));
 a.equal(r.status,"shadow_selected_research_only");
 a.equal(r.direction,"Higher");
 a.equal(r.bettingEligible,false);
 const l=standard("shotsOnGoal","Lower");
 const low=challenger.assess(l,factor(l,{
  models:{opponentAdjusted:.18,dist_empirical:.2,dist_shifted:.22,
   shotAttemptConversion:.16}
 }));
 a.equal(low.status,"shadow_selected_research_only");
 a.equal(low.direction,"Lower");
 const conflict=challenger.assess(h,factor(h,{models:{
  opponentAdjusted:.85,dist_empirical:.25,dist_shifted:.8,shotAttemptConversion:.9
 }}));
 a.equal(conflict.reason,"prior_history_direction_disagrees");
});
test("missing shot, assist, block source and unoffered opposite side are withheld",()=>{
 const p=standard();
 a.equal(challenger.assess(p,factor(p,{
  shotConversion:{status:"unverified"}})).reason,
  "source_gated_shot_attempt_conversion_missing");
 const ap=standard("assists");
 a.equal(challenger.assess(ap,factor(ap)).reason,
  "historical_pp_assist_involvement_unverified");
 const bp=standard("blockedShots");
 a.equal(challenger.assess(bp,factor(bp,{
  evidence:{blocks:{opponentShotAttemptsVerified:false,defensiveZoneStartsVerified:true}}
 })).reason,"opposing_attempt_or_pk_zone_exposure_unverified");
 const mismatch=challenger.assess(p,factor(p,{models:{
  opponentAdjusted:.18,dist_empirical:.2,dist_shifted:.2,shotAttemptConversion:.16
 }}));
 a.equal(mismatch.reason,"independent_side_not_same_original_offer");
 a.equal(mismatch.selectedResearchOnly,false);
 a.equal(mismatch.shadowUnbookableDirection,"Lower");
});
test("the strict freeze covers full original population and cannot silently rewrite props",()=>{
 const p=standard(),r=factor(p),snapshot={
  generatedAt:time,rankedProps:[{...p,probabilities:{higher:.82,lower:.18,push:0}}],
  individualPropSelections:[p],
  eightAccuracyResearchV1:{rows:[r],generatedAt:time}};
 const v=challenger.freeze(snapshot);
 a.equal(v.registered,1);a.equal(v.researchSelected,1);
 a.equal(v.rows[0].line,2.5);a.equal(v.rows[0].originalSide,"Higher");
 a.equal(v.modelPromoted,false);
 const bad=structuredClone(snapshot);bad.rankedProps[0].line=3.5;
 a.throws(()=>challenger.freeze(bad),/Changed original offer identity/);
});
function future(){
 const p=standard();
 const s={generatedAt:time,rankedProps:[{...p,probabilities:{
  higher:.82,lower:.18,push:0}}],
  individualPropSelections:[p]};
 const ad={kind:"adaptive",generatedAt:time,modelPromoted:false,
  rows:[{...p,originalSide:"Higher",priorGames:24,
   opponentGames:16,trainingGames:150,trainingDates:25,
   opponentHistoryUsed:true,expectedIceSeconds:850,
   priorComponentVerified:true,predictions:{learned:.74,fixed:.75},
   pointsSourceEvidence:{projectedPP:"pp1",linemateCount:2}}]};
 const pos={kind:"pos",generatedAt:time,modelPromoted:false,
  rows:[{...p,side:p.lean,position:"C",defenseFactor:1.03,
   offenseFactor:1.07,defense:{last10:{games:10}},
   probabilities:{usage:{higher:.6},offenseDefense:{higher:.72}}}]};
 s.standardAdaptiveResearchV2=ad;s.positionRateMatchupV2=pos;
 s.standardQualityShadowV2=quality.freeze(s);
 s.standardQualityInputABV1=inputAB.freeze(s,{
  currentAdaptive:ad,currentPosition:pos,
  inputSource:{available:true,seasons:["2025-26","2026-27"]}});
 s.eightAccuracyResearchV1={generatedAt:time,rows:[factor(p)]};
 s.strictDirectionalShadowV1=challenger.freeze(s);
 const history={players:{[p.playerId]:{games:[{
  playerId:p.playerId,gameId:p.gameId,gameDate:"2026-11-21",
  type:"skater",gameState:"FINAL",timeOnIceSeconds:950,shotsOnGoal:4}]}}};
 return {p,s,history,f:{snapshot:s,firstGitCommittedAt:firstGit,gitHistoryCount:1}};
}
test("genuine first-Git future selected beats or loses to exact original baseline; no historical promotion",()=>{
 const {f,history}=future();
 const report=audit([f],history,{
  abPolicyAt:"2026-11-21T00:30:00Z",
  policyAt:"2026-11-21T01:00:00Z"});
 a.equal(report.acceptedFrames,1);
 a.equal(report.pregameFrozenOriginals,1);
 a.equal(report.all.kept.registered,1);
 a.equal(report.all.kept.wins,1);
 a.equal(report.all.kept.hitRate,1);
 a.equal(report.all.kept.alwaysHigherSameLines,1);
 a.equal(report.all.kept.alwaysLowerSameLines,0);
 a.equal(report.all.skipped.registered,0);
 a.equal(report.bettingEdgeVerified,false);
 a.equal(report.all.kept.minimumEvidenceMet,false);
});
test("postgame archives, repeated originals, and tampered selected sides are quarantined",()=>{
 const {f,history}=future();
 const run=fs=>audit(fs,history,{
  abPolicyAt:"2026-11-21T00:30:00Z",
  policyAt:"2026-11-21T01:00:00Z"});
 a.equal(run([f,f]).pregameFrozenOriginals,1);
 a.equal(run([{...f,firstGitCommittedAt:"2026-11-23T02:00:35Z"}]).acceptedFrames,0);
 const alter=structuredClone(f);alter.snapshot.strictDirectionalShadowV1.rows[0].direction="Lower";
 a.equal(run([alter]).rejectedTamperedShadow,1);
 const alteredProbability=structuredClone(f);
 alteredProbability.snapshot.strictDirectionalShadowV1.rows[0].directionHigherProbability=.999;
 a.equal(run([alteredProbability]).rejectedTamperedShadow,1);
 const alteredReason=structuredClone(f);
 alteredReason.snapshot.strictDirectionalShadowV1.rows[0].reason="guaranteed_win";
 a.equal(run([alteredReason]).rejectedTamperedShadow,1);
 const old=structuredClone(f);old.snapshot.generatedAt="2026-11-20T22:00:00Z";
 a.equal(run([old]).acceptedFrames,0);
});
test("historical directional bins describe losses without selecting hindsight-winning cutoffs",()=>{
 const p=standard();
 const row={gameId:p.gameId,playerId:p.playerId,market:p.market,line:p.line,
  originalSide:"Higher",tier:"Standard",gameStartAt:start,sourceCapturedAt:captured,
  officialStatus:"decided",
  actualSide:"Lower",originalModelHigher:.78,
  eightFactorReplayedHigher:.8,replayedSource:factor(p)};
 const out=analyze([row]);
 a.equal(out.overall.decided,1);
 a.equal(out.overall.originalWins,0);
 a.equal(out.overall.reconstructedNewLosses,1);
 a.equal(out.overall.strictRetrospectiveSelected,1);
 a.equal(out.overall.strictRetrospectiveSelectedDecided,1);
 a.equal(out.overall.strictRetrospectiveLosses,1);
 a.equal(out.overall.abstentionReasons.unsupported_original_source,undefined);
 a.equal(out.overall.alwaysLowerSameLines,1);
 a.equal(out.byMarketOriginalSide["shotsOnGoal|Higher"].decided,1);
 a.equal(out.byExactMarketLine["shotsOnGoal|2.5"].decided,1);
 a.equal(out.byMarketOriginalProbabilityBand["shotsOnGoal|pHigher_70_79"].decided,1);
 a.equal(out.noPosthocThresholdSelection,true);
 a.equal(out.chronologicalPartitionNotIndependentProspectiveHoldout,true);
});
