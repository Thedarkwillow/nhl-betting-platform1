"use strict";
/** Explicitly historical/synthetic transfer holdout review, never prospective. */
const KIND="nhl_multiseason_chronological_historical_holdout_review_v1";
const MARKETS=["shotsOnGoal","points","assists","blockedShots"];
function review(source){
 if(source?.kind!=="nhl_position_multiseason_weight_trial_v3"||
   source.selectionSeason!=="2025-26"||
   source.evaluationSeason!=="2026-27"||
   !source.syntheticOnly||!source.holdout||!source.chosen)
  return {kind:KIND,status:"historical_source_not_eligible",modelPromoted:false};
 const byMarket={};
 for(const market of MARKETS){
  const r=source.holdout[market],w=source.chosen[market];
  if(!r||!w||!Number.isInteger(r.games)||!Number.isInteger(r.thresholds)||
    !Number.isFinite(r.baselineBrier)||!Number.isFinite(r.challengerBrier)||
    !Array.isArray(w.weights)||!Number.isInteger(w.trainingGames)||
    !r.pairedGameCI)return {kind:KIND,status:"incomplete_historical_holdout",
     modelPromoted:false};
  const delta=r.challengerBrier-r.baselineBrier;
  byMarket[market]={holdoutGames:r.games,syntheticThresholds:r.thresholds,
   trainingGames:w.trainingGames,preselectedFeatureWeights:w.weights,
   baselineBrier:r.baselineBrier,enhancedBrier:r.challengerBrier,
   enhancedMinusBaselineBrier:delta,
   relativeErrorReductionPercent:r.baselineBrier>0?
    (r.baselineBrier-r.challengerBrier)/r.baselineBrier*100:null,
   pairedGame95:r.pairedGameCI,
   descriptiveImprovement:delta<0,
   clusterCIExcludesZeroInFavorOfEnhanced:r.pairedGameCI.upper<0,
   gridAblations:(r.prespecifiedGridHoldout||[]).map(x=>({
    weights:x.weights,brier:x.holdoutBrier,
    versusBaseline:x.modelMinusBaselineBrier,pairedGame95:x.pairedGameCI,
    selectedAfterHoldout:false})),
   expectedIceTimeAdjustmentAblation:r.expectedIceTimeAdjustmentAblation??null,
   pregamePowerPlayUsageEvidenceStrata:r.pregamePowerPlayUsageEvidenceStrata??null,
   pregamePPUnitCausalAblationNotAvailable:true,
   multiplicityCorrected:false,platformPropAccuracyValidated:false};
 }
 return {kind:KIND,status:"historical_2026_27_evaluated",
  trainingSeason:"2025-26",evaluationSeason:"2026-27",cutoff:source.cutoff,
  sourceGeneratedAt:source.generatedAt??null,
  syntheticThresholdsOnly:true,onlyOfficialCompletedAppearances:true,
  opponentDefenseWeightAblationsTested:byMarket.shotsOnGoal.gridAblations.length>0,
  prospectivePolicyNewerThanSomeHistoricalHoldout:true,
  noSameSlateLookaheadInChronologicalBuilder:true,
  historicalDataNotUntouchedFutureOriginalOffers:true,
  noExactPrizePicksUnderdogHistoricalOffers:true,
  independentExpectedIceTimeCounterfactualTested:MARKETS.every(m=>
   byMarket[m].expectedIceTimeAdjustmentAblation!=null),
  independentPowerPlayLineupCounterfactualTested:false,
  selectionMultipleComparisonsNotCorrected:true,
  byMarket,bettingEligible:false,calibrated:false,
  historicallyValidatedBettingEdge:false,modelPromoted:false};
}
module.exports={KIND,review};