"use strict";
/**
 * Prospective validation on ORIGINAL Git-frozen individual NHL selections.
 * Original-platform outcomes, payouts and monetary EV are NOT inferred from NHL stats.
 * Freeze this policy before any future validation outcomes are observed.
 */
const KIND="private_nhl_prospective_probability_validation_v1";
const {fitTrainingOnly,evaluateChallenger}=require("./nhl-prospective-calibrator.cjs");
const asTime=x=>typeof x==="string"?Date.parse(x):NaN;
const finite=x=>Number.isFinite(x);
function score(rows){
 const out={decided:rows.length,distinctGames:new Set(rows.map(x=>x.gameId)).size,
  distinctGameDates:new Set(rows.map(x=>x.officialGameDate)).size,
  observedHitRate:null,meanPredictedProbability:null,brier:null,logLoss:null,
  alwaysHigherHitRate:null,alwaysLowerHitRate:null,bins:[]};
 if(!rows.length)return out;
 const avg=f=>rows.reduce((s,x)=>s+f(x),0)/rows.length;
 out.observedHitRate=avg(x=>Number(x.win));
 out.meanPredictedProbability=avg(x=>x.estimatedProbability);
 out.brier=avg(x=>(x.estimatedProbability-Number(x.win))**2);
 out.logLoss=avg(x=>-(x.win?Math.log(x.estimatedProbability):Math.log(1-x.estimatedProbability)));
 out.alwaysHigherHitRate=avg(x=>Number(x.officialResult==="Higher"));
 out.alwaysLowerHitRate=avg(x=>Number(x.officialResult==="Lower"));
 for(let i=0;i<5;i++){
  const low=i/5,high=(i+1)/5;
  const band=rows.filter(x=>x.estimatedProbability>=low&&(i===4?x.estimatedProbability<=high:x.estimatedProbability<high));
  out.bins.push({lower:low,upper:high,n:band.length,
   meanPredicted:band.length?band.reduce((a,x)=>a+x.estimatedProbability,0)/band.length:null,
   observedRate:band.length?band.filter(x=>x.win).length/band.length:null});
 }
 return out;
}
function validate(ledger,{policyFirstCommittedAt=null,minTraining=200,minFutureDecisions=100,
 minFutureGames=30,minFutureGameDates=20}={}){
 const blocked=why=>({kind:KIND,status:"unavailable",reason:why,
  calibrated:false,productionRecommendationsApproved:false,validatedEV:false,
  training:score([]),futureHoldout:score([]),excluded:{},originalPlatformSettlementsVerified:false});
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
  ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
  !Array.isArray(ledger.records)||!ledger.counts)return blocked("missing_original_git_frozen_selection_registry");
 const tally={registered:0,correct:0,incorrect:0,push:0,pending:0},seen=new Set();
 const excluded={push:0,pending:0,not_standard:0,invalid_probability:0};
 const decided=[];
 for(const r of ledger.records){
  if(!r||typeof r.id!=="string"||!r.id||seen.has(r.id)||
    !Number.isInteger(r.gameId)||!Number.isInteger(r.playerId)||
    !["Higher","Lower"].includes(r.selectedSide)||!["Standard","Goblin","Demon"].includes(r.tier)||
    !["correct","incorrect","push","pending_official_player_stats"].includes(r.selectionStatus)||
    !finite(asTime(r.firstCaptureAt))||!finite(asTime(r.firstResearchAt))||
    !finite(asTime(r.firstGitCommittedAt))||!finite(asTime(r.gameStartAt))||
    asTime(r.firstCaptureAt)>asTime(r.firstResearchAt)||
    asTime(r.firstResearchAt)>asTime(r.firstGitCommittedAt)+999||
    asTime(r.firstGitCommittedAt)>=asTime(r.gameStartAt))
   return blocked("invalid_duplicate_or_not_proven_pregame_selection");
  seen.add(r.id);tally.registered++;
  tally[r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus]++;
  if(r.selectionStatus==="push"){excluded.push++;continue;}
  if(r.selectionStatus==="pending_official_player_stats"){excluded.pending++;continue;}
  if(r.tier!=="Standard"){excluded.not_standard++;continue;}
  if(!finite(r.estimatedProbability)||r.estimatedProbability<=0||r.estimatedProbability>=1){
   excluded.invalid_probability++;continue;
  }
  if(!["Higher","Lower"].includes(r.officialResult)||
   (r.selectionStatus==="correct")!==(r.selectedSide===r.officialResult)||
   typeof r.officialGameDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(r.officialGameDate))
   return blocked("original_selected_direction_and_official_outcome_disagree");
  decided.push({...r,win:r.selectionStatus==="correct"});
 }
 if(Object.keys(tally).some(k=>tally[k]!==ledger.counts[k]))
  return blocked("original_registry_counts_disagree");
 const policyAt=asTime(policyFirstCommittedAt);
 const training=decided.filter(x=>finite(policyAt)&&
  asTime(x.gameStartAt)<policyAt&&asTime(x.firstGitCommittedAt)<policyAt);
 const holdout=decided.filter(x=>finite(policyAt)&&
  asTime(x.firstGitCommittedAt)>policyAt&&asTime(x.gameStartAt)>policyAt);
 const trainMetrics=score(training),futureMetrics=score(holdout),descriptive=score(decided);
 const challengerFit=fitTrainingOnly(training);
 const challengerFuture=evaluateChallenger(challengerFit,holdout);
 const reasons=[];
 if(!finite(policyAt))reasons.push("validation_policy_first_git_commit_not_verified");
 if(trainMetrics.decided<minTraining)reasons.push("insufficient_past_only_standard_training_decisions");
 if(futureMetrics.decided<minFutureDecisions)reasons.push("insufficient_future_standard_holdout_decisions");
 if(futureMetrics.distinctGames<minFutureGames)reasons.push("insufficient_future_distinct_games");
 if(futureMetrics.distinctGameDates<minFutureGameDates)reasons.push("insufficient_future_distinct_dates");
 // The above metrics establish *diagnostic* accuracy only. A held-out
 // calibrator, verified platform settlement, payout and game-cluster edge
 // evidence are additional release gates. Never auto-promote.
 reasons.push("heldout_calibrator_not_independently_approved");
 reasons.push("original_platform_settlement_and_payout_unverified");
 reasons.push("payout_adjusted_edge_and_correlation_not_validated");
 return {kind:KIND,status:reasons.length?"research_validation_only":"eligible_for_review",
  policyFirstGitCommittedAt:finite(policyAt)?policyFirstCommittedAt:null,
  scope:"standard_only_original_frozen_model_side_and_official_nhl_final_stat",
  counts:tally,excluded,allStandardDescriptive:descriptive,
  training:trainMetrics,futureHoldout:futureMetrics,
  challengerTraining:challengerFit,challengerFutureHoldout:challengerFuture,
  releaseBlockers:reasons,
  calibrated:false,productionRecommendationsApproved:false,
  validatedEV:false,originalPlatformSettlementsVerified:false,
  autoWagerEnabled:false,modelChanged:false,
  note:"Original future frozen selections only. Training outcomes must predate validation policy; future holdout uses later first-Git commits. Diagnostic Brier/log loss and bins are NOT independent probability calibration."};
}
function publicBrief(privateResult){
 const r=privateResult?.kind===KIND?privateResult:null;
 const count=n=>Number.isInteger(n)&&n>=0?n:0;
 return {kind:"public_nhl_probability_validation_v1",
  status:r?.status==="research_validation_only"?"research_validation_only":"evidence_unavailable",
  originalFrozenRegistered:count(r?.counts?.registered),
  standardTrainingDecisions:count(r?.training?.decided),
  futureStandardHoldoutDecisions:count(r?.futureHoldout?.decided),
  futureStandardHoldoutGames:count(r?.futureHoldout?.distinctGames),
  futureStandardHoldoutDates:count(r?.futureHoldout?.distinctGameDates),
  futureStandardBrier:r?.futureHoldout?.decided>=100&&finite(r?.futureHoldout?.brier)?Number(r.futureHoldout.brier.toFixed(5)):null,
  futureStandardLogLoss:r?.futureHoldout?.decided>=100&&finite(r?.futureHoldout?.logLoss)?Number(r.futureHoldout.logLoss.toFixed(5)):null,
  estimatedProbabilitiesValidated:false,bettingRecommendationsApproved:false,
  actualPlatformSettlementsVerified:false,payoutAdjustedEVVerified:false,
  researchOnly:true};
}
module.exports={KIND,score,validate,publicBrief};
