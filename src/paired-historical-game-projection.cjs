"use strict";
/*
 * Game-cluster paired MAE comparison for strictly prior-week position,
 * offensive pace and opponent-defense analogues.
 * NFL actual receiving/rushing yards may be negative; only projected yardage\n * counts are clamped nonnegative. NOT an original-line hit rate,\n * an independent NFL future trial, or EV.
 */
const good=x=>typeof x==="number"&&Number.isFinite(x);
function audit(rows,{draws=2400}={}){
 const blocked=reason=>({kind:"paired_historical_game_projection_mae_v1",
  status:reason,observations:0,games:0,weeks:0,
  baselineMAE:null,challengerMAE:null,
  baselineMinusChallengerGameWeighted:null,gameBootstrap95:null,
  independentlyValidatedFutureOriginalLines:false,
  modelPromoted:false});
 if(!Array.isArray(rows)||!Number.isInteger(draws)||draws<200||draws>10000)
  return blocked("invalid_input");
 const seen=new Set(),games=new Map(),weeks=new Set();let baselineSum=0,challengerSum=0;
 for(const x of rows){
  if(!x||!Number.isInteger(x.season)||!Number.isInteger(x.week)||x.week<1||x.week>18||
     !String(x.gameId??"")||!String(x.playerId??"")||!String(x.market??"")||
     !good(x.observed)||![x.baseline,x.challenger].every(v=>good(v)&&v>=0))
   return blocked("invalid_historical_feature_evidence");
  const key=JSON.stringify([x.season,x.gameId,x.playerId,x.market]);
  if(seen.has(key))return blocked("ambiguous_repeated_player_game_market");
  seen.add(key);
  const gkey=JSON.stringify([x.season,x.week,x.gameId]),wk=x.season+"|"+x.week;
  weeks.add(wk);
  const a=Math.abs(x.baseline-x.observed),b=Math.abs(x.challenger-x.observed);
  baselineSum+=a;challengerSum+=b;
  const g=games.get(gkey)||{baseline:0,challenger:0,n:0};
  g.baseline+=a;g.challenger+=b;g.n++;
  games.set(gkey,g);
 }
 if(!rows.length)return blocked("no_matching_observations");
 const perGame=[...games.values()].map(x=>(x.baseline-x.challenger)/x.n);
 const average=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
 let ci=null;
 if(perGame.length>=12){
  let seed=0xb428a04b;const trials=[];
  for(let i=0;i<draws;i++){
   let total=0;
   for(let j=0;j<perGame.length;j++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    total+=perGame[Math.floor(seed/4294967296*perGame.length)];
   }
   trials.push(total/perGame.length);
  }
  trials.sort((a,b)=>a-b);
  ci={lower:trials[Math.floor((draws-1)*.025)],
   upper:trials[Math.ceil((draws-1)*.975)],
   resamples:draws,
   unit:"independent_game_cluster_means",
   measure:"baseline_absolute_error_minus_challenger_absolute_error"};
 }
 return {kind:"paired_historical_game_projection_mae_v1",
  status:"paired_prior_week_historical_research_only",
  observations:rows.length,games:perGame.length,weeks:weeks.size,
  baselineMAE:baselineSum/rows.length,challengerMAE:challengerSum/rows.length,
  baselineMinusChallengerGameWeighted:average(perGame),
  gameBootstrap95:ci,
  minimumDescriptiveSupport:perGame.length>=30&&weeks.size>=10,
  descriptiveImprovement:perGame.length>=30&&weeks.size>=10&&ci?.lower>0,
  historicalSelectionCouldOverfit:true,
  independentlyValidatedFutureOriginalLines:false,
  originalPlatformOfferIdentityVerified:false,
  platformSettlementsVerified:false,
  paidRequests:0,modelPromoted:false};
}
module.exports={audit};
