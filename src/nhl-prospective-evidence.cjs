"use strict";
/**
 * Research-only audit of Git-frozen selections versus official NHL final
 * stats. No lineup payouts, original platform settlements, or wager returns.
 */
function wilson(wins,n,z=1.959963984540054){
 if(!Number.isInteger(n)||n<0||!Number.isInteger(wins)||wins<0||wins>n)
  throw Error("Invalid hit-rate count");
 if(!n)return {lower:null,upper:null,rate:null,n:0};
 const p=wins/n,z2=z*z,den=1+z2/n,ctr=p+z2/(2*n),
  err=z*Math.sqrt((p*(1-p)+z2/(4*n))/n);
 return {lower:Math.max(0,(ctr-err)/den),upper:Math.min(1,(ctr+err)/den),rate:p,n};
}
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function groupMetrics(rows){
 const n=rows.length,wins=rows.filter(r=>r.correct).length;
 const high=rows.filter(r=>r.result==="Higher").length,
  low=rows.filter(r=>r.result==="Lower").length;
 const probs=rows.filter(r=>finite(r.probability)&&r.probability>0&&r.probability<1);
 const brier=probs.length?probs.reduce((s,r)=>
   s+(r.probability-(r.correct?1:0))**2,0)/probs.length:null;
 const logLoss=probs.length?probs.reduce((s,r)=>{
  const p=Math.min(1-1e-9,Math.max(1e-9,r.probability));
  return s-(r.correct?Math.log(p):Math.log(1-p));
 },0)/probs.length:null;
 const meanPred=probs.length?probs.reduce((s,r)=>s+r.probability,0)/probs.length:null;
 return {gradedDecisions:n,correct:wins,observedHitRate:n?wins/n:null,
  wilson95Unclustered:wilson(wins,n),
  alwaysHigherBaseline:n?high/n:null,alwaysLowerBaseline:n?low/n:null,
  brier,logLoss,meanModelProbability:meanPred,
  probabilityRows:probs.length,
  distinctGames:new Set(rows.map(r=>r.gameId)).size,
  distinctCalendarDates:new Set(rows.map(r=>r.gameDate)).size};
}
function clusterBoot(rows,replicates=1200){
 const games=new Map();
 for(const r of rows){
  if(!games.has(r.gameId))games.set(r.gameId,[]);
  games.get(r.gameId).push(r);
 }
 const clusters=[...games.values()];
 // Inference using one completed game cannot be promoted.
 if(clusters.length<10||rows.length<50)return null;
 let seed=0x6b85d832;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const hit=[],versusLower=[],versusHigher=[];
 for(let j=0;j<replicates;j++){
  let n=0,correct=0,low=0,high=0;
  for(let i=0;i<clusters.length;i++){
   const group=clusters[Math.floor(random()*clusters.length)];
   n+=group.length;
   for(const row of group){
    correct+=Number(row.correct);
    low+=Number(row.result==="Lower");
    high+=Number(row.result==="Higher");
   }
  }
  if(!n)continue;
  hit.push(correct/n);versusLower.push((correct-low)/n);versusHigher.push((correct-high)/n);
 }
 const interval=a=>{
  if(!a.length)return {lower:null,upper:null};
  a.sort((x,y)=>x-y);
  return {lower:a[Math.floor(.025*(a.length-1))],
   upper:a[Math.ceil(.975*(a.length-1))]};
 };
 return {method:"deterministic_game_cluster_bootstrap",
  unit:"official_NHL_game_ID",samples:replicates,
  hitRate95:interval(hit),
  modelMinusAlwaysLower95:interval(versusLower),
  modelMinusAlwaysHigher95:interval(versusHigher),
  warning:"Bootstrap intervals are exploratory across games and do not independently validate payouts, correlated opponent effects, calibration or data-source correctness."};
}
function evaluateProspectiveEvidence(gradedRows,{precommitted=false}={}){
 if(!Array.isArray(gradedRows))throw Error("Expected official-finale graded rows");
 const rows=gradedRows.filter(r=>r&&typeof r.correct==="boolean"&&
  ["Higher","Lower"].includes(r.result)&&["Higher","Lower"].includes(r.lean)&&
  Number.isInteger(r.gameId)&&["Standard","Goblin","Demon"].includes(r.tier));
 const byTier={},byMarket={};
 for(const r of rows){
  for(const [group,k] of [[byTier,r.tier],[byMarket,r.market]]){
   if(!group[k])group[k]=[];
   group[k].push(r);
  }
 }
 const normalizeGroup=group=>Object.fromEntries(Object.entries(group)
  .map(([key,values])=>[key,groupMetrics(values)]));
 const overall=groupMetrics(rows),cluster=clusterBoot(rows);
 const enoughData=rows.length>=200&&overall.distinctGames>=30;
 return {kind:"nhl_frozen_prop_direction_skill_prospective_evidence_v1",
  sourceCohort:precommitted?"explicit_git_frozen_pregame_individual_selections":
   "retrospective_reconstructed_rule_not_precommitted",
  prospectivelyPrecommitted:precommitted,
  ...overall,byTier:normalizeGroup(byTier),byMarket:normalizeGroup(byMarket),
  gameClusterBootstrap95:cluster,
  provisionalSampleGateSatisfied:enoughData,
  // These are categorically unknown until independent original terms and
  // actual platform-style settlements and payout mapping exist.
  originalPlatformOfferAuthenticated:false,
  originalPlatformSettlementsVerified:false,
  originalTierPayoutVerified:false,
  exactPayoutAdjustedReturn:null,
  realizedPlatformROI:null,
  positiveReturnConfidenceBound:null,
  bettingEdgeVerified:false,
  calibrationApproved:false,
  referenceBaselineDeclaredBeforeEvaluation:false,
  reason:!precommitted?"Rule formalized after evaluated results; not a prospectively precommitted strategy":
   !rows.length?"No decided precommitted props yet":
   !enoughData?"Not enough distinct precommitted NHL games and decisions for preliminary reliability review":
   "Enough for preliminary directional-skill review only; independent payout, settlement and validation remain missing",
  note:"Wilson interval treats prop decisions as independent (often false). Cluster bootstrap groups all correlated props from each NHL game. Evaluating direction accuracy cannot by itself verify a profitable betting edge."};
}
module.exports={wilson,groupMetrics,clusterBoot,evaluateProspectiveEvidence};
