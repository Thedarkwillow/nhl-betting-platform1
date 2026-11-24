"use strict";
/**
 * Exact-member NHL COMBO research. Same-game: use historical observed joint
 * sums, preserving covariance. Cross-game: empirical marginals convolved
 * under an explicit unverified independence approximation. Never treat a
 * team's prior unrelated games as simultaneous combo outcomes.
 *
 * Statistics are from OFFICIAL games strictly before the original quote
 * capture calendar date; no invented provider membership, no live lineups.
 */
const {validateStructuredComboSource}=require("./nhl-combo-source-evidence.cjs");
const MIN_SHARED_GAMES=8,MIN_MARGINAL_GAMES=8;
const dateOk=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||"");
const round=x=>Number(x.toFixed(5));
function priorMemberGames(player,stat,asOf){
 const cutoff=new Date(Date.parse(asOf)).toISOString().slice(0,10);
 return player.games.filter(g=>dateOk(g.gameDate)&&g.gameDate<cutoff&&
   Number.isInteger(g.gameId)&&g.gameId>0&&
   Number.isInteger(g[stat])&&g[stat]>=0)
  .sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
}
function comboJointSample(members,stat,asOf){
 if(!Array.isArray(members)||members.length<2||
  !Number.isFinite(Date.parse(asOf)))return [];
 const maps=members.map(p=>new Map(priorMemberGames(p,stat,asOf)
  .map(g=>[g.gameId,g])));
 const samples=[];
 for(const [gameId,first] of maps[0]){
  const games=maps.map(m=>m.get(gameId));
  if(games.some(g=>!g||g.gameDate!==first.gameDate))continue;
  samples.push({gameId,gameDate:first.gameDate,
   value:games.reduce((a,g)=>a+g[stat],0)});
 }
 samples.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
 return samples;
}
function empiricVector(values,line){
 const n=values.length;
 const higher=values.filter(v=>v>line+1e-9).length,
  lower=values.filter(v=>v<line-1e-9).length,
  push=n-higher-lower;
 // Two predeclared opposing pseudo-counts avoid fake P=100%.
 return {higher:round((higher+1)/(n+2)),
  lower:round((lower+1)/(n+2)),push:round(push/(n+2))};
}
function empiricalMarginal(values){
 const frequency=new Map();
 for(const v of values)frequency.set(v,(frequency.get(v)||0)+1);
 return new Map([...frequency].map(([v,n])=>[v,n/values.length]));
}
function convolution(marginals){
 let result=new Map([[0,1]]);
 for(const m of marginals){
  const next=new Map();
  for(const [x,a] of result)for(const [y,b] of m)
   next.set(x+y,(next.get(x+y)||0)+a*b);
  result=next;
 }
 return result;
}
function theoreticalVector(distribution,line){
 let higher=0,lower=0,push=0;
 for(const [v,p] of distribution){
  if(v>line+1e-9)higher+=p;
  else if(v<line-1e-9)lower+=p;
  else push+=p;
 }
 // 1% prior probability mass on either side, avoiding spurious 1.0.
 return {higher:round(0.98*higher+0.01),
  lower:round(0.98*lower+0.01),push:round(0.98*push)};
}
function researchComboProbability(offer,history,{asOf=offer?.sourceCapturedAt}={}){
 if(!Number.isFinite(Date.parse(asOf)))return {
  eligible:false,reason:"combo_research_asof_invalid"};
 const validation=validateStructuredComboSource(offer,history,{now:asOf});
 if(!validation.valid)return {eligible:false,reason:validation.reason};
 const at=Date.parse(asOf),capture=Date.parse(offer.sourceCapturedAt);
 if(at<capture||at-capture>30*60000)
  return {eligible:false,reason:"combo_quote_not_current"};
 const members=offer.members.map(m=>history.players[String(m.playerId)]);
 const stat=validation.stat;
 if(validation.relation==="same_game"){
  const samples=comboJointSample(members,stat,asOf);
  if(samples.length<MIN_SHARED_GAMES)return {
   eligible:false,reason:"insufficient_exact_co_game_history",
   availableCoGames:samples.length};
  const probs=empiricVector(samples.map(x=>x.value),offer.line);
  return {eligible:true,status:"research_only",market:offer.market,
   relation:"same_game",line:offer.line,stat,
   sharedGameSamples:samples.length,
   mostRecentTrainingDate:samples.at(-1).gameDate,
   meanSum:round(samples.reduce((s,x)=>s+x.value,0)/samples.length),
   probabilities:{...probs,calibrated:false,
    distribution:"observed_actual_co_game_joint_sums_laplace_v1"},
   historicalJointMembershipProven:true,
   playerGameMembershipVerifiedForSource:validation.valid,
   originalPlatformScoringVerified:false,
   originalPlatformSettlementVerified:false,
   eligibleForAutoHigherLower:false,eligibleForOptimizedLineups:false,
   note:"Research-only empirical joint history for SAME exact players on SAME earlier NHL games; not general matchup-calibrated."};
 }
 const counts=members.map(p=>priorMemberGames(p,stat,asOf));
 if(counts.some(rows=>rows.length<MIN_MARGINAL_GAMES))
  return {eligible:false,reason:"insufficient_cross_game_member_histories",
   counts:counts.map(x=>x.length)};
 const all=counts.map(rows=>rows.map(r=>r[stat]));
 const pmf=convolution(all.map(empiricalMarginal)),probs=theoreticalVector(pmf,offer.line);
 return {eligible:true,status:"research_only",market:offer.market,
  relation:"cross_game",line:offer.line,stat,
  marginalSamples:counts.map(x=>x.length),
  mostRecentTrainingDate:counts.map(x=>x.at(-1).gameDate).sort().at(-1),
  meanSum:round(all.reduce((a,values)=>a+
   values.reduce((s,x)=>s+x,0)/values.length,0)),
  probabilities:{...probs,calibrated:false,
   distribution:"cross_game_empirical_marginal_convolution_v1"},
  independenceAssumptionUnverified:true,
  historicalJointMembershipProven:false,originalPlatformScoringVerified:false,
  originalPlatformSettlementVerified:false,
  eligibleForAutoHigherLower:false,eligibleForOptimizedLineups:false,
  note:"Independent-marginal approximation for distinct NHL games; no inference of same-game joint history or confirmed correlation."};
}
module.exports={MIN_SHARED_GAMES,MIN_MARGINAL_GAMES,
 priorMemberGames,comboJointSample,researchComboProbability,
 empiricVector,theoreticalVector,convolution};
