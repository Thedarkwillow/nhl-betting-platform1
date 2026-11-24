"use strict";
/**
 * Private promotion gate. No post-result fitting or promotion; each metric
 * must come from the ORIGINAL Git-verified, explicitly precommitted cohort.
 */
function assessNhlModelReadiness(individual){
 const metrics=individual?.directionalEvidence||{},issues=[];
 const decided=individual?.decided||0,graded=individual?.graded||0,correct=individual?.correct||0;
 const games=metrics.distinctGames||0,pending=individual?.pending||0;
 if(metrics.prospectivelyPrecommitted!==true||
    metrics.sourceCohort!=="explicit_git_frozen_pregame_individual_selections")
  issues.push("no_explicit_original_pregame_cohort");
 if(!Number.isInteger(decided)||decided<200)issues.push("fewer_than_200_decisions");
 if(!Number.isInteger(games)||games<30)issues.push("fewer_than_30_finished_games");
 if(!Number.isInteger(metrics.probabilityRows)||metrics.probabilityRows!==decided)
  issues.push("calibration_probability_rows_incomplete");
 const lower=metrics.gameClusterBootstrap95?.modelMinusAlwaysLower95?.lower;
 const higher=metrics.gameClusterBootstrap95?.modelMinusAlwaysHigher95?.lower;
 if(!Number.isFinite(lower)||lower<=0)issues.push("no_positive_game_cluster_bound_vs_always_lower");
 if(!Number.isFinite(higher)||higher<=0)issues.push("no_positive_game_cluster_bound_vs_always_higher");
 if(metrics.calibrationApproved!==true)issues.push("held_out_probability_calibration_not_approved");
 if(metrics.originalPlatformSettlementsVerified!==true)
  issues.push("original_platform_settlement_not_verified");
 const arithmeticValid=Number.isInteger(correct)&&correct>=0&&correct<=decided&&
   graded>=decided&&pending>=0;
 if(!arithmeticValid)issues.push("invalid_decision_count_arithmetic");
 return {kind:"private_nhl_model_promotion_evidence_gate_v1",
  selectedPregamePicks:individual?.uniqueSelections??0,
  graded,decided,correct,pushes:individual?.pushes??0,pending,
  distinctCompletedGames:games,
  observedProspectiveRate:decided>0&&arithmeticValid?correct/decided:null,
  alwaysLowerRate:metrics.alwaysLowerBaseline??null,
  alwaysHigherRate:metrics.alwaysHigherBaseline??null,
  gameCluster95:metrics.gameClusterBootstrap95??null,
  sampleGateReached:decided>=200&&games>=30,
  automaticModelPromotion:false,modelPromotionAllowed:false,
  bettingEdgeEstablished:false,unresolved:issues,
  note:"Private research gate; no rollout or profit claims from retrospective results, incomplete cohorts, unknown settlement or uncalibrated model probabilities."};
}
module.exports={assessNhlModelReadiness};
