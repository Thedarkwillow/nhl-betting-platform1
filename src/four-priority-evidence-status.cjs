"use strict";
/**
 * Four-track checkpoint from ALREADY ARCHIVED private results.
 * Counts and evidence gates only: never serialize player props, raw provider
 * IDs, model parameters, private source files, or supposed platform payouts.
 */
const FORMATS=["power_2","power_3","power_4","power_5","power_6",
 "flex_3","flex_4","flex_5","flex_6"];
const good=n=>Number.isInteger(n)&&n>=0;
const count=n=>good(n)?n:0;
const scalar=n=>Number.isFinite(n)?n:null;
const timestamp=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?x:null;
function build({nhl,calibration,nfl,underdog}={},at=new Date().toISOString()){
 if(!timestamp(at))throw Error("Original audit time invalid");
 const validNhl=nhl?.kind==="private_nhl_prospective_probability_validation_v1"&&
  nhl.originalPlatformSettlementsVerified===false&&nhl.calibrated===false;
 const validCal=calibration?.kind==="private_nhl_validation_and_paper_audit_v1"&&
  calibration.calibration?.kind==="exact_market_tier_side_calibration_v3"&&
  calibration.calibrationTrial?.approved===false&&
  calibration.paperProspective?.kind==="nine_format_first_registered_reference_paper_v2";
 const validNFL=nfl?.kind==="nfl_private_pregame_evidence_separated_outcome_audit_v1"&&
  nfl.nflverseFinalStatsNotPlatformSettlement===true;
 const validUd=underdog?.kind==="private_underdog_offline_candidate_archive_audit_v1"&&
  underdog.productionEligible===false&&underdog.publicRows===0;
 const gs=validCal?calibration.calibrationTrial.byGroup||{}:{};
 const matched=Object.entries(gs).filter(([_,x])=>good(x.decided)&&x.decided>0&&x.pairedGameEvidence?.status==="paired_frozen_research_only");
 const formats=Object.fromEntries(FORMATS.map(k=>{
  const b=validCal?calibration.paperProspective.formats?.[k]:null;
  const resolved=count(b?.decided),registered=count(b?.registered);
  const complete=!!b&&good(b.decided)&&good(b.registered)&&b.registered>=b.decided&&
   b.independentSlateReview?.approval===false;
  return [k,{registered:complete?registered:0,resolved:complete?resolved:0,
   minimumResolvedSlates:50,remainingToMinimum:complete?Math.max(0,50-resolved):50,
   slateBootstrapSupported:complete&&b.pairedSlateUncertainty?.modelVsLowerSlateBootstrap95!==null&&!!b.pairedSlateUncertainty?.modelVsLowerSlateBootstrap95,
   status:complete&&resolved>=50?"reference_sample_threshold_only":
    complete&&registered?"reference_paper_evidence_partial":"missing_or_unverified",
   productionEligible:false,verifiedPayoutEV:null}];
 }));
 const first=validNFL?nfl.explicitFrozenDirections?.firstDistinctThresholdGrade?.earliestPerPlayerGameMarketAndLine:null;
 const overall=validNFL?nfl.explicitFrozenDirections:null;
 const ud=validUd?underdog.bySport||{}:{};
 return {kind:"private_multisport_four_priority_acceptance_v1",generatedAt:at,
  calibration:{
   status:validCal?"precommitted_experiments_unapproved":"source_evidence_missing",
   originalStandardDecided:validNhl?count(nhl.futureHoldout?.decided):0,
   originalStandardGames:validNhl?count(nhl.futureHoldout?.distinctGames):0,
   originalStandardDates:validNhl?count(nhl.futureHoldout?.distinctGameDates):0,
   originalPacificSlateDays:validNhl?count(nhl.originalSameLineSlateClusterBaseline?.distinctPacificSlates):0,
   slateSampleTarget:20,
   originalMinusAlwaysLowerSameLines:validNhl?scalar(nhl.originalSameLineSlateClusterBaseline?.modelMinusAlwaysLower):null,
   slateClusterBaselineProofAvailable:validNhl&&nhl.originalSameLineSlateClusterBaseline?.status==="original_pregame_research_only"&&
    nhl.originalSameLineSlateClusterBaseline.minimumTwentyIndependentSlatesMet===true,
   standardOriginalBrier:validNhl?scalar(nhl.futureHoldout?.brier):null,
   separateMarketTierSideGroups:validCal?Object.keys(calibration.calibration.byGroup||{}).length:0,
   matchedFrozenCalibrationGroups:matched.length,
   totalGenuinelyFrozenTrialDecisions:matched.reduce((s,[_,x])=>s+x.decided,0),
   groupsPassingMinimum:matched.filter(([_,x])=>x.pairedGameEvidence.minimumEvidenceMet).length,
   groupsWithClusterEvidenceFavoringAdjustment:matched.filter(([_,x])=>x.pairedGameEvidence.gameClusterEvidenceFavoringAdjustment).length,
   rawRetrospectiveCalibrationNotApproved:true,calibrated:false,
   originalPlatformSettlementVerified:false,productionEligible:false},
  grading:{
   nhlStatus:validNhl?nhl.status:"source_evidence_missing",
   nhlOriginalFutureDecisions:validNhl?count(nhl.futureHoldout?.decided):0,
   nhlPending:validNhl?count(nhl.counts?.pending):0,
   nflStatus:validNFL?"original_precommitted_official_stat_only":"source_evidence_missing",
   nflOriginalDecided:validNFL?count(overall?.decided):0,
   nflDistinctThresholdDecided:validNFL?count(first?.decided):0,
   nflDistinctThresholdGames:validNFL?count(first?.distinctFinalGames):0,
   nflDirectionalHitRate:validNFL&&count(first?.decided)>0?scalar(first?.hitRate):null,
   nflAlwaysLowerSameLineHitRate:validNFL&&count(first?.decided)>0?scalar(first?.alwaysLowerRate):null,
   originalPlatformSettlementsVerified:false,allSportsGradedAutomaticallyProven:false},
  lineups:{formats,legalFormatCount:FORMATS.length,
   totalRegistered:FORMATS.reduce((s,k)=>s+formats[k].registered,0),
   totalDecided:FORMATS.reduce((s,k)=>s+formats[k].resolved,0),
   uniqueUnderlyingCalendarSlatesResolved:validCal?count(calibration.paperProspective.uniqueCalendarSlatesResolvedAcrossFormats):0,
   uniqueUnderlyingCalendarSlatesRegistered:validCal?count(calibration.paperProspective.uniqueCalendarSlatesRegisteredAcrossFormats):0,
   correlatedFormatsNotSeparateIndependentTrials:true,
   overlappingSlatesNotIndependent:true,referenceOnly:true,
   calibratedJointProbability:null,verifiedPayoutEV:null,
   automatedRecommendationsEligible:false},
  underdog:{
   status:validUd?"bounded_offline_research_only":"evidence_missing",
   nhlArchives:validUd?count(ud.NHL?.archives):0,
   nhlCandidateSides:validUd?count(ud.NHL?.candidateSides):0,
   nflArchives:validUd?count(ud.NFL?.archives):0,
   nflCandidateSides:validUd?count(ud.NFL?.candidateSides):0,
   completeProviderPaginationVerified:false,originalAppAuthenticationVerified:false,
   marketContractVerified:false,liveComparisonEligible:false,
   publicRows:0,paidRequests:0},
  acceptance:{probabilityRelease:false,approvedOptimizedLineups:false,
   authorizedFullUnderdogIntegration:false,platformSettlementAndPayouts:false,
   noOfficialWagers:true,allFourEngineeringTracksAudited:validCal&&validNhl&&validNFL&&validUd},
  note:"Research-only status. No automated bookmaker requests, no model promotion, no payouts or wagers."};
}
module.exports={FORMATS,build};
