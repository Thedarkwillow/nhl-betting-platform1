"use strict";
function quantifyHistoricalUncertainty(decisions,{draws=1200,seed=99173}={}){
 const valid=(decisions||[]).filter(x=>x.status==="evaluated"&&typeof x.correct==="boolean"&&
    Number.isFinite(x.modelSelectedProbability)&&x.modelSelectedProbability>0&&x.modelSelectedProbability<1);
 const seasons=["2025-26","2026-27"];
 function summarize(rows){
  const buckets=new Map();
  for(const row of rows){
   const id=String(row.season)+"|"+String(row.gameId);
   if(!buckets.has(id))buckets.set(id,[]);
   buckets.get(id).push(row);
  }
  const games=[...buckets.values()];
  const hitRate=rows.length?rows.filter(x=>x.correct).length/rows.length:null;
  const brier=rows.length?rows.reduce((n,x)=>n+(x.modelSelectedProbability-(x.correct?1:0))**2,0)/rows.length:null;
  let interval=null;
  if(games.length>=5&&draws>=100&&draws<=10000){
   let state=seed>>>0;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
   const rates=[];
   for(let i=0;i<draws;i++){
    let wins=0,total=0;
    for(let k=0;k<games.length;k++){
     const group=games[Math.floor(next()*games.length)];
     total+=group.length;wins+=group.filter(x=>x.correct).length;
    }
    rates.push(wins/total);
   }
   rates.sort((a,b)=>a-b);
   interval=[rates[Math.floor(.025*(rates.length-1))],rates[Math.floor(.975*(rates.length-1))]];
  }
  return {evaluated:rows.length,distinctGames:games.length,sampledHitRate:hitRate,brierScore:brier,
   exploratoryClusterBootstrap95:interval,uncertaintyLabel:"Exploratory bootstrap resampling whole games. Limited game/sample diversity and repeated players; NOT a prospective performance confidence guarantee."};
 }
 const markets={};
 for(const market of new Set(valid.map(x=>x.market))){
  markets[market]=summarize(valid.filter(x=>x.market===market));
 }
 const bands={};
 for(const [label,low,high] of [["50-59%",.5,.6],["60-69%",.6,.7],["70-79%",.7,.8],["80%+",.8,1.000001]]){
  const subset=valid.filter(x=>x.modelSelectedProbability>=low&&x.modelSelectedProbability<high);
  bands[label]={count:subset.length,observedHitRate:subset.length?subset.filter(x=>x.correct).length/subset.length:null};
 }
 return {all:summarize(valid),bySeason:Object.fromEntries(seasons.map(s=>[s,summarize(valid.filter(x=>x.season===s))])),
  byMarket:markets,probabilityBuckets:bands,calibrated:false,payoutExpectedValue:null,
  caveat:"Small correlated historical game sample; bootstrap intervals are exploratory only. No temporal held-out probability calibration or verified betting return."};
}
module.exports={quantifyHistoricalUncertainty};
