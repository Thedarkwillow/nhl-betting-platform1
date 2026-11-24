"use strict";
/**
 * Market-specific Standard evidence, strictly from first-Git-frozen original
 * prop selections, never invented model picks or recalibrated probabilities.
 * Require many separate NHL games and both directions before model promotion.
 */
const MIN=Object.freeze({decided:200,games:30,lowerSelections:30,
 evaluationEndUTC:"2027-02-01T08:00:00Z"});
function wilson95(wins,n){
 if(!Number.isInteger(wins)||!Number.isInteger(n)||n<1||wins<0||wins>n)return null;
 const z=1.959963984540054,p=wins/n,zz=z*z,den=1+zz/n;
 const c=(p+zz/(2*n))/den,h=(z/den)*Math.sqrt(p*(1-p)/n+zz/(4*n*n));
 return {lower:Number(Math.max(0,c-h).toFixed(5)),
  upper:Number(Math.min(1,c+h).toFixed(5))};
}
function one(name,m){
 const n=m?.decided,g=m?.distinctGames,lo=m?.lowerModelChoices;
 if(!Number.isInteger(n)||n<0||!Number.isInteger(g)||g<0||g>n||
  !Number.isInteger(lo)||lo<0||lo>n||
  !["modelWins","alwaysHigherWins","alwaysLowerWins","pushes","ungraded",
   "observedSelected"].every(k=>Number.isInteger(m[k])&&m[k]>=0)||
  m.alwaysHigherWins+m.alwaysLowerWins!==n||
  m.observedSelected!==m.decided+m.pushes+m.ungraded||
  m.modelWins>n)
   return {market:name,status:"source_stats_inconsistent",modelReleasePermitted:false};
 const enough=n>=MIN.decided&&g>=MIN.games&&lo>=MIN.lowerSelections;
 return {market:name,status:enough?"sample_minimum_reached_not_validated":
    "insufficient_forward_market_games_or_lower_choices",
  originalPrecommittedSelections:m.observedSelected,
  decided:n,pending:m.ungraded,pushes:m.pushes,distinctGames:g,
  lowerDirectionsDecided:lo,
  modelCorrect:m.modelWins,
  hypotheticalAlwaysHigherCorrect:m.alwaysHigherWins,
  hypotheticalAlwaysLowerCorrect:m.alwaysLowerWins,
  modelObservedRate:n?Number((m.modelWins/n).toFixed(6)):null,
  hypotheticalHigherRate:n?Number((m.alwaysHigherWins/n).toFixed(6)):null,
  hypotheticalLowerRate:n?Number((m.alwaysLowerWins/n).toFixed(6)):null,
  descriptiveWilson95:n>=10?wilson95(m.modelWins,n):null,
  descriptiveWilsonDoesNotCorrectSameGameCorrelation:true,
  pairedModelMinusHigher:n?(m.modelWins-m.alwaysHigherWins)/n:null,
  pairedModelMinusLower:n?(m.modelWins-m.alwaysLowerWins)/n:null,
  minimumFutureMarketDecisions:MIN.decided,
  minimumDistinctGames:MIN.games,
  minimumOriginalLowerDirections:MIN.lowerSelections,
  predeclaredEvaluationEndUTC:MIN.evaluationEndUTC,
  modelReleasePermitted:false,authenticatedAvailableSides:false,
  independentlyValidatedProbabilityCalibration:false,payoutEV:null};
}
function audit(report){
 if(report?.kind!=="nhl_frozen_same_threshold_baselines_v1"||
    report.evidenceValid!==true||!report.postPolicySameSelectedLines?.byStandardMarket)
  return {kind:"nhl_standard_future_market_gate_v1",valid:false,markets:[],
   promotionPermitted:false};
 const markets=Object.entries(report.postPolicySameSelectedLines.byStandardMarket)
  .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>one(k,v));
 return {kind:"nhl_standard_future_market_gate_v1",valid:true,
  predeclaredTrialEndUTC:MIN.evaluationEndUTC,markets,
  originalSameSelectedLinesOnly:true,postPolicyOnly:true,
  sourcePlatformRuleEvidenceMissing:true,
  gameClusterIntervalRequired:true,
  modelProbabilitiesCalibrated:false,automaticPicksApproved:false,
  promotionPermitted:false,
  note:"A Wilson interval is descriptive only and treats correlated player props as independent. Small-market rates must not guide newly changed selection rules without a new precommit and holdout."};
}
module.exports={MIN,wilson95,one,audit};
