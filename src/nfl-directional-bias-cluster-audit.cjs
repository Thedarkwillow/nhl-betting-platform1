"use strict";
/*
 * NFL directional bias audit on FIRST Git-frozen distinct thresholds.
 * Bootstrap whole games, not highly correlated player offers. This is
 * retrospective diagnosis, never a newly precommitted challenger or a bet.
 */
const int=n=>Number.isInteger(n)&&n>=0;
const sum=(a,k)=>a.reduce((x,r)=>x+r[k],0);
const pct=(a,n)=>n?a/n:null;
function validGroup(g){
 return !!g&&[g.decided,g.correct,g.incorrect,g.alwaysHigherSameLines,
  g.alwaysLowerSameLines,g.distinctFinalGames].every(int)&&
  g.decided===g.correct+g.incorrect&&
  g.decided===g.alwaysHigherSameLines+g.alwaysLowerSameLines;
}
function clusterCI(games,metric,reps=2500){
 if(!Array.isArray(games)||games.length<10||
  !Number.isInteger(reps)||reps<100||reps>10000)return null;
 let seed=0x551ab921;
 const draws=[];
 for(let i=0;i<reps;i++){
  let n=0,d=0;
  for(let j=0;j<games.length;j++){
   seed=(Math.imul(1664525,seed)+1013904223)>>>0;
   const g=games[Math.floor(seed/4294967296*games.length)];
   n+=g.decided;
   d+=g.correct-g[metric];
  }
  if(n>0)draws.push(d/n);
 }
 if(!draws.length)return null;
 draws.sort((a,b)=>a-b);
 return {lower:draws[Math.floor((draws.length-1)*.025)],
  upper:draws[Math.ceil((draws.length-1)*.975)],
  metric:"original_model_minus_"+metric+"_directional_hit_rate",
  unit:"distinct_official_NFL_games",bootstrapResamples:reps,
  correlated_offers_not_independent:true};
}
function audit(grade){
 const f=grade?.explicitFrozenDirections?.firstDistinctThresholdGrade;
 if(grade?.kind!=="nfl_private_pregame_evidence_separated_outcome_audit_v1"||
    grade.nflverseFinalStatsNotPlatformSettlement!==true||
    f?.kind!=="nfl_original_first_distinct_threshold_official_stat_audit_v1"||
    f.originalFirstGitBeforeKickoffProven!==true||
    f.statisticsDerivedFromNflverseNotPlatformSettlement!==true)
  return {kind:"nfl_original_direction_bias_cluster_audit_v1",
   status:"unverified_frozen_grade",modelPromoted:false};
 const top=f.earliestPerPlayerGameMarketAndLine,byGame=Object.values(top?.byGame||{}),
  byMarket=Object.entries(top?.byMarket||{}),bySide=Object.entries(top?.bySelectedSide||{});
 if(!validGroup(top)||byGame.some(x=>!validGroup(x))||
    byMarket.some(([k,v])=>!k||!validGroup(v))||
    bySide.some(([k,v])=>!["Higher","Lower"].includes(k)||!validGroup(v))||
    sum(byGame,"decided")!==top.decided||
    sum(byGame,"correct")!==top.correct||
    sum(byGame,"alwaysLowerSameLines")!==top.alwaysLowerSameLines||
    sum(byGame,"alwaysHigherSameLines")!==top.alwaysHigherSameLines||
    sum(byMarket.map(x=>x[1]),"decided")!==top.decided||
    sum(bySide.map(x=>x[1]),"decided")!==top.decided||
    sum(bySide.map(x=>x[1]),"correct")!==top.correct||
    sum(bySide.map(x=>x[1]),"alwaysLowerSameLines")!==top.alwaysLowerSameLines||
    sum(bySide.map(x=>x[1]),"alwaysHigherSameLines")!==top.alwaysHigherSameLines||
    byGame.filter(g=>g.decided>0).length!==top.distinctFinalGames)
  return {kind:"nfl_original_direction_bias_cluster_audit_v1",
   status:"unreconciled_game_or_market_totals",modelPromoted:false};
 const games=byGame.filter(g=>g.decided>0),review=Object.fromEntries(byMarket.map(([market,g])=>{
  const min=g.decided>=50&&g.distinctFinalGames>=10;
  return [market,{decided:g.decided,distinctFinalGames:g.distinctFinalGames,
   selectedHitRate:pct(g.correct,g.decided),alwaysLowerRate:pct(g.alwaysLowerSameLines,g.decided),
   modelMinusLower:pct(g.correct-g.alwaysLowerSameLines,g.decided),
   evidenceStatus:min?"descriptive_market_risk_review_only":"insufficient_distinct_market_support",
   mayReverseFutureSide:false,independentlyImproved:false}];
 }));
 const bySelectedSide=Object.fromEntries(bySide.map(([side,g])=>[side,{
  decided:g.decided,distinctGames:g.distinctFinalGames,
  originalDirectionalHitRate:pct(g.correct,g.decided),
  alwaysLowerSameLineRate:pct(g.alwaysLowerSameLines,g.decided),
  modelMinusAlwaysLower:pct(g.correct-g.alwaysLowerSameLines,g.decided),
  historicalOnly:true,automaticOppositeSideAuthorized:false
 }]));
 const lower=clusterCI(games,"alwaysLowerSameLines"),
  higher=clusterCI(games,"alwaysHigherSameLines");
 return {kind:"nfl_original_direction_bias_cluster_audit_v1",
  status:"descriptive_first_git_game_cluster_diagnostics",firstGitEvidence:true,
  distinctFinalGames:games.length,decided:top.decided,
  originalHitRate:pct(top.correct,top.decided),
  alwaysLowerRate:pct(top.alwaysLowerSameLines,top.decided),
  alwaysHigherRate:pct(top.alwaysHigherSameLines,top.decided),
  originalMinusAlwaysLower95:lower,originalMinusAlwaysHigher95:higher,
  marketRisk:review,bySelectedSideResearch:bySelectedSide,
  marketsNeedingResearchReview:Object.keys(review).filter(k=>
    review[k].evidenceStatus==="descriptive_market_risk_review_only"&&
    review[k].modelMinusLower<0).sort(),
  fullyIndependentFutureGameDatesReached:false,
  automaticDirectionFlipAllowed:false,
  historicalMarketSelectionCouldOverfit:true,
  noVerifiedOriginalAppOfferedOppositeSide:true,
  independentProbabilityCalibrationApproved:false,
  modelPromoted:false,betterThanAlwaysLowerProven:false,
  warning:"This is the same original historical cohort, not a prospective trial of a changed strategy; bootstrap accounts only for shared game, not independent weeks or original app settlement."};
}
module.exports={audit,clusterCI,validGroup};
