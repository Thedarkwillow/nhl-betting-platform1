"use strict";
/**
 * Time-safe private champion probability calibration challenger.
 * ONLY original Git-precommitted Standard outcomes already final before
 * the next snapshot date are eligible for training. Never release as live EV.
 */
const {fitTrainingOnly,evaluateChallenger}=require("./nhl-prospective-calibrator.cjs");
const cutoffDay=now=>new Date(now).toISOString().slice(0,10);
function fitAtFreeze(ledger,asOf){
 const now=Date.parse(asOf),built=Date.parse(ledger?.builtAt);
 if(!Number.isFinite(now))throw Error("Valid original pregame as-of required");
 const unavailable=reason=>({kind:"nhl_standard_training_only_calibrator_shadow_v1",
  status:reason,trainingRows:0,trainingGames:0,trainingDates:0,
  fittedParameters:null,approvedForLiveUse:false,sourceLedgerAsOf:ledger?.builtAt||null});
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
  !Array.isArray(ledger.records)||!Number.isFinite(built)||built>now)
  return unavailable("no_verified_prior_private_frozen_ledger");
 const eligible=ledger.records.filter(x=>
  x.tier==="Standard"&&["correct","incorrect"].includes(x.selectionStatus)&&
  Number.isInteger(x.gameId)&&Number.isFinite(x.estimatedProbability)&&
  x.estimatedProbability>0&&x.estimatedProbability<1&&
  typeof x.officialGameDate==="string"&&x.officialGameDate<cutoffDay(asOf)&&
  Number.isFinite(Date.parse(x.firstGitCommittedAt))&&
  Number.isFinite(Date.parse(x.gameStartAt))&&
  Date.parse(x.firstGitCommittedAt)<Date.parse(x.gameStartAt)&&
  Date.parse(x.gameStartAt)<now-6*3600000);
 const games=new Set(eligible.map(x=>x.gameId)).size;
 const days=new Set(eligible.map(x=>x.officialGameDate)).size;
 const fit=fitTrainingOnly(eligible.map(x=>({
  gameId:x.gameId,estimatedProbability:x.estimatedProbability,
  win:x.selectionStatus==="correct"
 })),{minimumTrainingDecisions:200,minimumTrainingGames:30});
 // Wait for 20 independent game dates as an additional external release guard.
 const fitted=fit.status==="research_only_training_fitted"&&days>=20;
 return {kind:"nhl_standard_training_only_calibrator_shadow_v1",
  status:fitted?"unapproved_trained_research_only":"insufficient_prior_frozen_standard_training",
  trainingRows:eligible.length,trainingGames:games,trainingDates:days,
  fittedParameters:fitted?fit.parameters:null,
  approvedForLiveUse:false,sourceLedgerAsOf:ledger.builtAt,
  futureChallengerCandidateOnly:true,
  warning:"Fitting uses only prior completed original Git-frozen STANDARD selections, never the current game. No platform payout/settlement, model release, or verified calibrated probability."};
}
module.exports={fitAtFreeze,evaluateChallenger};
