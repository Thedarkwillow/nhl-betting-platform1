"use strict";
/** Research-only eligibility audit. No single flag bypasses evidence gates. */
function assessNhlRecommendations({validation=null,modelRelease=null,platform=null,
 source=null,market=null,role=null,pricing=null,correlations=null}={}){
 const reasons=[],requireProof=(ok,why)=>{if(!ok)reasons.push(why);};
 requireProof(validation?.kind==="private_nhl_prospective_probability_validation_v1"&&
  validation.calibrated===true&&validation.releaseBlockers?.length===0,
  "future_heldout_probabilities_not_approved");
 requireProof(modelRelease?.modelPromotionAllowed===true&&
  modelRelease?.bettingEdgeEstablished===true,
  "model_vs_simple_strategies_not_independently_proven");
 requireProof(platform?.actualOriginalOfferAuthenticated===true,
  "original_app_offer_not_authenticated");
 requireProof(platform?.originalSettlementRulesReconciled===true,
  "original_platform_settlement_rules_unverified");
 requireProof(source?.completeSourceAtActualCapture===true&&
  source?.originalOfferStillAvailableNow===true&&source?.gameNotStarted===true,
  "fresh_original_offer_and_game_state_unverified");
 requireProof(market?.specificMarketBacktested===true&&market?.historicalCoverageSufficient===true,
  "market_specific_calibration_not_verified");
 requireProof(role?.injuryAvailabilityVerified===true&&
  (role?.isGoalie!==true||role?.startingGoalieConfirmed===true),
  "injury_or_starter_unverified");
 requireProof(pricing?.lineSpecificPayoutVerified===true&&
  pricing?.settlementAdjustedExpectedValueVerified===true&&
  typeof pricing.expectedValueAfterCosts==="number"&&
  Number.isFinite(pricing.expectedValueAfterCosts)&&pricing.expectedValueAfterCosts>0,
  "payout_adjusted_positive_value_not_verified");
 requireProof(correlations?.lineupRestrictionsChecked===true&&
  correlations?.dependencyModelValidated===true,
  "lineup_dependency_and_platform_rules_unverified");
 return {kind:"private_nhl_recommendation_release_audit_v1",
  researchOnly:true,readyForIndependentHumanReview:reasons.length===0,
  approvedBettingRecommendations:false,submittedWagers:0,
  noAutomaticWagerPlacement:true,blockers:reasons,
  note:"Model rankings and favorable estimates do not constitute validated recommendations. No automatic promotion."};
}
module.exports={assessNhlRecommendations};
