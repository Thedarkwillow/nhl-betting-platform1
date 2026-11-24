"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freeze,grade,summarize,acceptance,KIND}=require("../src/nhl-multifactor-future-v1.cjs");
const start="2026-11-24T02:00:00Z",generatedAt="2026-11-22T20:00:00Z",
 capturedAt="2026-11-22T19:59:00Z";
const p={gameId:2026020380,playerId:8481234,market:"shotsOnGoal",line:1.5,tier:"Standard",
 lean:"Higher",probability:.64,team:"MTL",opponent:"PHI",capturedAt,gameStartAt:start};
function snap(){
 return {generatedAt,individualPropSelections:[{...p}],
 rankedProps:[{...p,projection:2.4,observations:16}],
 standardQualityShadowV2:{kind:"nhl_standard_market_quality_challenger_20261120_v2",
  generatedAt,rows:[{...p,originalSide:"Higher",originalLine:1.5,
   status:"shadow_selected_research_only",bettingEligible:false}]}};
}
function makeFrame(overrides={},rowOverrides={}){
 const s=snap(),trial=freeze(s);
 trial.rows[0]={...trial.rows[0],...rowOverrides};
 return {snapshot:{...s,multifactorFutureV1:trial,...overrides},
  firstGitCommittedAt:"2026-11-22T20:02:00Z",gitHistoryCount:1};
}
const history={players:{[p.playerId]:{games:[{gameId:p.gameId,playerId:p.playerId,
 type:"skater",gameState:"OFF",shotsOnGoal:3,timeOnIceSeconds:850}]}}};
const policy="2026-11-21T23:00:00Z";
test("full original cohort is registered despite missing live sources and no pick is auto-promoted",()=>{
 const trial=freeze(snap());
 assert.equal(trial.rows.length,1);
 assert.equal(trial.incumbentKept,1);
 assert.equal(trial.multifactorKept,0);
 assert.equal(trial.rows[0].controlSelected,true);
 assert.equal(trial.rows[0].multifactorKept,false);
 assert.equal(trial.rows[0].highConfidenceEligible,false);
 assert.equal(trial.rows[0].originalSide,"Higher");
 assert.equal(trial.calibrationApproved,false);
 assert.ok(trial.rows[0].reasons.includes("fresh_xg_and_opponent_quality_unverified"));
});
test("duplicates and unsupported exact original offers are not future cohorts",()=>{
 const s=snap();s.individualPropSelections.push({...p});
 assert.equal(freeze(s).status,"not_enrolled_invalid_or_duplicate_original");
 const t=snap();t.rankedProps[0].line=2.5;
 assert.equal(freeze(t).status,"not_enrolled_original_side_unverified");
});
test("invalid or postgame clock cannot be frozen",()=>{
 const s=snap();s.individualPropSelections[0].gameStartAt="2026-11-22T20:10:00Z";
 assert.equal(freeze(s).status,"not_enrolled_invalid_or_duplicate_original");
});
test("no retrospective promotion: pre-policy original frames ignored",()=>{
 const f=makeFrame();f.firstGitCommittedAt="2026-11-21T20:02:00Z";
 assert.equal(grade([f],history,{policyFirstGitAt:policy}).originalRowsAccepted,0);
});
test("verified future first Git and exact original threshold grades incumbent, Higher and Lower",()=>{
 const result=grade([makeFrame()],history,{policyFirstGitAt:policy});
 assert.equal(result.originalRowsAccepted,1);
 assert.equal(result.existingStrictModel.decided,1);
 assert.equal(result.existingStrictModel.correct,1);
 assert.equal(result.existingStrictModel.alwaysHigherSameLines,1);
 assert.equal(result.existingStrictModel.alwaysLowerSameLines,0);
 assert.equal(result.multifactorKept.decided,0);
 assert.equal(result.modelPromoted,false);
});
test("future multifactor kept comparison uses same original SIDE, never changes direction",()=>{
 const f=makeFrame({},{multifactorKept:true});
 const r=grade([f],history,{policyFirstGitAt:policy});
 assert.equal(r.multifactorKept.decided,1);
 assert.equal(r.multifactorKept.hitRate,1);
 assert.equal(r.multifactorKept.alwaysHigherSameLines,1);
 assert.equal(r.multifactorKept.alwaysLowerSameLines,0);
 assert.equal(r.incumbentMatchesMultifactorOnOverlappingPicks,true);
});
test("duplicate source frames with the exact same original line only count once",()=>{
 const f=makeFrame();const duplicate=makeFrame();
 duplicate.firstGitCommittedAt="2026-11-22T20:03:00Z";
 const r=grade([f,duplicate],history,{policyFirstGitAt:policy});
 assert.equal(r.originalRowsAccepted,1);
 assert.equal(r.excluded.duplicate_original_threshold,1);
});
test("late initial Git commit, edited snapshot, and inconsistent treatment are discarded",()=>{
 const one=makeFrame();one.firstGitCommittedAt="2026-11-24T01:50:00Z";
 assert.equal(grade([one],history,{policyFirstGitAt:policy}).originalRowsAccepted,0);
 const two=makeFrame();two.gitHistoryCount=2;
 assert.equal(grade([two],history,{policyFirstGitAt:policy}).originalRowsAccepted,0);
 const three=makeFrame({},{controlSelected:false,multifactorKept:true});
 assert.equal(grade([three],history,{policyFirstGitAt:policy}).originalRowsAccepted,0);
});
test("pushes and no official stats stay out of directional hit rate denominator",()=>{
 const rows=[{...p,originalSide:"Higher",outcome:{status:"push"}},
  {...p,originalSide:"Higher",outcome:{status:"pending"}},
  {...p,originalSide:"Higher",outcome:{status:"decided",side:"Lower"}}];
 const x=summarize(rows);
 assert.equal(x.registered,3);
 assert.equal(x.decided,1);
 assert.equal(x.push,1);
 assert.equal(x.pending,1);
 assert.equal(x.correct,0);
 assert.equal(x.alwaysLowerSameLines,1);
});
test("immutable first-Git blocker audit reports source gaps per market and incumbent cohort",()=>{
 const f=makeFrame();
 const r=grade([f],history,{policyFirstGitAt:policy});
 const d=r.multifactorBlockerAudit;
 assert.equal(d.allOriginallyFrozen.registered,1);
 assert.equal(d.allOriginallyFrozen.rejected,1);
 assert.equal(d.incumbentStrictCandidates.registered,1);
 assert.equal(d.incumbentStrictCandidates.byMarket.shotsOnGoal.rejected,1);
 assert.equal(d.allOriginallyFrozen.reasons.fresh_xg_and_opponent_quality_unverified,1);
 assert.equal(
  d.allOriginallyFrozen.sourceSpecificFrozenRootCauses.opponentOpportunity
   .official_opponent_defensive_shots_conceded_not_verified,1);
 assert.equal(d.allOriginallyFrozen.noPostgameReclassification,true);
 assert.equal(r.multifactorKept.registered,0);
 assert.equal(r.bettingEligible,false);
});
test("blocker audit never counts excluded late-Git snapshots or retroactively refits",()=>{
 const f=makeFrame();
 f.firstGitCommittedAt="2026-11-24T01:50:00Z";
 const r=grade([f],history,{policyFirstGitAt:policy});
 assert.equal(r.originalRowsAccepted,0);
 assert.equal(r.multifactorBlockerAudit.allOriginallyFrozen.registered,0);
 assert.deepEqual(r.multifactorBlockerAudit.allOriginallyFrozen.reasons,{});
});

test("strict future acceptance requires 200 kept decisions, 30 games, 20 slates and positive four clustered baseline intervals",()=>{
 const ci={lower:.01,upper:.09},base={
  decided:201,distinctGames:31,distinctPacificSlates:21,hitRate:.64,
  gameCluster95VsHigher:ci,gameCluster95VsLower:ci,
  slateCluster95VsHigher:ci,slateCluster95VsLower:ci};
 const skip={decided:45,hitRate:.49};
 const allowed=acceptance(base,skip);
 assert.equal(allowed.preliminaryProspectiveBaselineSupport,true);
 assert.equal(allowed.descriptiveKeptMinusSkippedRate,.15);
 assert.equal(allowed.descriptiveKeptVsSkippedNotPairedOrCausal,true);
 assert.equal(allowed.modelPromoted,false);
 assert.equal(allowed.approvedLineups,0);
 assert.equal(allowed.highConfidenceApproved,false);
 assert.equal(allowed.bettingEligible,false);
 for(const tooSmall of [
  {...base,decided:199},{...base,distinctGames:29},
  {...base,distinctPacificSlates:19},
  {...base,gameCluster95VsHigher:{lower:0,upper:.09}},
  {...base,slateCluster95VsLower:{lower:-.001,upper:.09}},
  {...base,gameCluster95VsLower:null}
 ])assert.equal(acceptance(tooSmall,skip).preliminaryProspectiveBaselineSupport,false);
 const sparse=acceptance(base,{...skip,decided:0});
 assert.equal(sparse.descriptiveKeptMinusSkippedRate,null);
});
test("first Git multifactor scorecard reports unavailable acceptance rather than guessed confidence",()=>{
 const data=grade([makeFrame()],history,{policyFirstGitAt:policy});
 assert.equal(data.prospectiveAcceptance.keptDecided,0);
 assert.equal(data.prospectiveAcceptance.minProspectiveSampleMet,false);
 assert.equal(data.prospectiveAcceptance.preliminaryProspectiveBaselineSupport,false);
 assert.equal(data.prospectiveAcceptance.independentCalibrationApproved,false);
 assert.equal(data.prospectiveAcceptance.originalAppQuotesAuthenticated,false);
 assert.equal(data.prospectiveAcceptance.payoutEVVerified,false);
});

test("future first-Git source audit preserves unverified live statuses even when provider omits a reason",()=>{
 const f=makeFrame();
 const row=f.snapshot.multifactorFutureV1.rows[0],audit=row.sourceAudit;
 assert.equal(audit.iceTimeCrosscheckStatus,"unverified");
 assert.equal(audit.iceTimeCrosscheckReason,
  "expected_ice_time_historical_shadow_not_frozen");
 assert.equal(audit.historicalIceTimeRoleShiftRisk,false);
 assert.ok(typeof audit.projectedLineEvidenceReason==="string");
 assert.ok(typeof audit.opposingGoalieEvidenceReason==="string");
 assert.equal(row.multifactorKept,false);
 const r=grade([f],history,{policyFirstGitAt:policy});
 assert.equal(r.originalRowsAccepted,1);
 assert.equal(r.multifactorKept.registered,0);
 assert.equal(r.multifactorBlockerAudit.allOriginallyFrozen
  .sourceSpecificFrozenRootCauses.positionAndUsage
  .expected_ice_time_historical_shadow_not_frozen,1);
 assert.equal(r.multifactorBlockerAudit.allOriginallyFrozen.noPostgameReclassification,true);
});
