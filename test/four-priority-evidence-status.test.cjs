"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {build,FORMATS}=require("../src/four-priority-evidence-status.cjs");
const at="2026-11-17T23:00:00Z";
function fixture(){
 return {
  nhl:{kind:"private_nhl_prospective_probability_validation_v1",calibrated:false,
   originalPlatformSettlementsVerified:false,status:"research_validation_only",
   futureHoldout:{decided:200,distinctGames:31,distinctGameDates:9,brier:.25},
   counts:{pending:15}},
  nfl:{kind:"nfl_private_pregame_evidence_separated_outcome_audit_v1",
   nflverseFinalStatsNotPlatformSettlement:true,
   explicitFrozenDirections:{decided:150,firstDistinctThresholdGrade:{
    earliestPerPlayerGameMarketAndLine:{decided:70,distinctFinalGames:12,modelObservedRate:.48}}}},
  calibration:{kind:"private_nhl_validation_and_paper_audit_v1",
   calibration:{kind:"exact_market_tier_side_calibration_v3",byGroup:{standard:{}}},
   calibrationTrial:{approved:false,byGroup:{one:{decided:120,pairedGameEvidence:{
    status:"paired_frozen_research_only",minimumEvidenceMet:true,gameClusterEvidenceFavoringAdjustment:true}}}},
   paperProspective:{kind:"nine_format_first_registered_reference_paper_v2",
    formats:Object.fromEntries(FORMATS.map(k=>[k,{registered:5,decided:4,independentSlateReview:{approval:false}}]))}},
  underdog:{kind:"private_underdog_offline_candidate_archive_audit_v1",
   productionEligible:false,publicRows:0,bySport:{NHL:{archives:2,candidateSides:5},
    NFL:{archives:1,candidateSides:0}}}
 };
}
test("each priority is reported without leaking source identities or approval",()=>{
 const z=build(fixture(),at);
 a.equal(z.calibration.totalGenuinelyFrozenTrialDecisions,120);
 a.equal(z.calibration.groupsWithClusterEvidenceFavoringAdjustment,1);
 a.equal(z.calibration.calibrated,false);
 a.equal(z.grading.nflDistinctThresholdDecided,70);
 a.equal(z.lineups.legalFormatCount,9);a.equal(z.lineups.totalDecided,36);
 a.equal(z.lineups.formats.flex_2,undefined);
 a.equal(z.underdog.nhlArchives,2);
 a.equal(z.acceptance.allFourEngineeringTracksAudited,true);
 a.equal(z.acceptance.probabilityRelease,false);
 a.equal(z.acceptance.approvedOptimizedLineups,false);
 for(const x of ["playerId","sourceOfferId","modelWeights","rawProviderRows"])
  a.ok(!JSON.stringify(z).includes('"'+x+'"'));
});
test("unknown, mismatched or optimistic source claims fail closed",()=>{
 const z=build({nhl:{...fixture().nhl,calibrated:true},
  nfl:{...fixture().nfl,nflverseFinalStatsNotPlatformSettlement:false},
  calibration:{...fixture().calibration,calibrationTrial:{approved:true}},
  underdog:{...fixture().underdog,productionEligible:true}},at);
 a.equal(z.calibration.originalStandardDecided,0);
 a.equal(z.grading.nflOriginalDecided,0);
 a.equal(z.calibration.matchedFrozenCalibrationGroups,0);
 a.equal(z.lineups.totalRegistered,0);
 a.equal(z.underdog.nhlArchives,0);
 a.equal(z.acceptance.allFourEngineeringTracksAudited,false);
 a.throws(()=>build({},"not a date"));
});
