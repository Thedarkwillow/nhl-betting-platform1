"use strict";
const {projectPlayer}=require("./projections.cjs");
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const FIELDS={skater:["shotsOnGoal","goals","assists","points","blockedShots"],goalie:["saves"]};
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
function evaluate(history,{minGames=5,thresholds=[0.5,1.5,2.5,3.5,4.5],minSamples=30}={}){
 const rows=[];
 for(const player of Object.values(history.players||{})){
  const games=[...(player.games||[])].sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
  for(let i=minGames;i<games.length;i++){
   const prior={...player,games:games.slice(0,i)},actual=games[i];
   const weighted=projectPlayer(prior,{minGames});
   for(const field of FIELDS[player.type]||[]){
    const p=weighted.projections[field];
    const valid=prior.games.map(g=>g[field]).filter(Number.isFinite);
    if(!p?.ready||!Number.isFinite(actual[field])||valid.length<minGames)continue;
    const means={weighted:p.estimate,season:avg(valid),last5:avg(valid.slice(-5))};
    for(const line of thresholds){
     const outcome=actual[field]>line?1:0;
     const probs=Object.fromEntries(Object.entries(means).map(([key,mean])=>
      [key,estimateCountProbabilities(mean,line)?.higher]));
     if(Object.values(probs).some(v=>v===null||v===undefined))continue;
     rows.push({gameDate:actual.gameDate,playerId:player.playerId,field,line,outcome,probs});
    }
   }
  }
 }
 function summarize(sample){
  const scores={};
  for(const model of ["weighted","season","last5"]){
   const brier=sample.length?avg(sample.map(r=>(r.probs[model]-r.outcome)**2)):null;
   scores[model]=brier;
  }
  return {samples:sample.length,brier:scores,weightedMinusSeason:scores.weighted===null?null:scores.weighted-scores.season,
   weightedMinusLast5:scores.weighted===null?null:scores.weighted-scores.last5};
 }
 const buckets=Array.from({length:10},(_,i)=>{
  const subset=rows.filter(r=>r.probs.weighted>=i/10&&(i===9?r.probs.weighted<=1:r.probs.weighted<(i+1)/10));
  return {range:[i/10,(i+1)/10],count:subset.length,
   meanPredicted:subset.length?avg(subset.map(r=>r.probs.weighted)):null,
   observedRate:subset.length?avg(subset.map(r=>r.outcome)):null,
   sufficientSamples:subset.length>=minSamples};
 });
 const byMarket=Object.fromEntries([...new Set(rows.map(r=>r.field))].map(f=>[f,summarize(rows.filter(r=>r.field===f))]));
 const dates=[...new Set(rows.map(r=>r.gameDate))].sort();
 const byDate=Object.fromEntries(dates.map(d=>[d,summarize(rows.filter(r=>r.gameDate===d))]));
 const minEvaluationDates=20;
 const marketDecisions=Object.fromEntries(Object.entries(byMarket).map(([field,score])=>{
  const marketRows=rows.filter(r=>r.field===field);
  const nDates=new Set(marketRows.map(r=>r.gameDate)).size;
  const eligible=nDates>=minEvaluationDates&&score.samples>=500;
  const best=Object.entries(score.brier).filter(([,v])=>v!==null).sort((a,b)=>a[1]-b[1])[0]?.[0]||null;
  return [field,{bestObservedModel:best,eligibleForModelSelection:eligible,
   distinctGameDates:nDates,minEvaluationDates,
   recommendation:eligible?best:null,
   reason:eligible?"Candidate only; verify on a later holdout period":"Insufficient distinct evaluation dates; keep existing production model"}];
 }));
 const calibrationByMarket=Object.fromEntries(Object.keys(byMarket).map(field=>{
  const marketRows=rows.filter(r=>r.field===field);
  return [field,Array.from({length:10},(_,i)=>{
   const subset=marketRows.filter(r=>r.probs.weighted>=i/10&&(i===9?r.probs.weighted<=1:r.probs.weighted<(i+1)/10));
   return {range:[i/10,(i+1)/10],count:subset.length,
    meanPredicted:subset.length?avg(subset.map(r=>r.probs.weighted)):null,
    observedRate:subset.length?avg(subset.map(r=>r.outcome)):null,
    sufficientSamples:subset.length>=minSamples};
  })];
 }));
 return {schemaVersion:3,method:"walk-forward comparison against season-mean and last-five Poisson baselines; synthetic thresholds",
  warning:"Synthetic thresholds, NOT historical PrizePicks lines. Repeated thresholds and outcomes are correlated; observed evaluation dates do not independently establish model superiority. No odds, payout, or expected value inference.",
  predictions:rows.length,distinctGameDates:dates.length,minGames,thresholds,minSamples,
  overall:summarize(rows),byMarket,byDate,marketDecisions,calibrationByMarket,calibrationBuckets:buckets};
}
module.exports={evaluate};
