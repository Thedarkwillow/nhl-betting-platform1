"use strict";
// Fixed thresholds are synthetic statistical targets, never archived offers.
// Evaluate only final role-correct player appearances; train on earlier days.
const {estimateExperimentalMarketProbability}=require("./nhl-new-market-model.cjs");
const {INDIVIDUAL_MARKETS}=require("./nhl-experimental-offer-bridge.cjs");
const {bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const lines={hits:[.5,1.5,2.5],faceoffsWon:[2.5,5.5,8.5],timeOnIceSeconds:[900,1200,1500],goalieFantasyScore:[5.5,12.5,20.5],powerPlayPoints:[.5,1.5],goalsAgainst:[1.5,2.5,3.5],plusMinus:[-1.5,-.5,.5,1.5]};
const OUT=["higher","lower","push"];
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const mass=(values,line)=>{const c={higher:1,lower:1,push:1};for(const v of values)c[v>line?"higher":v<line?"lower":"push"]++;return Object.fromEntries(OUT.map(k=>[k,c[k]/(values.length+3)]));};
const brier=(p,y)=>OUT.reduce((s,k)=>s+(p[k]-Number(k===y))**2,0);
const loss=(p,y)=>-Math.log(Math.max(1e-8,p[y]));
function study(history){
 if(!history?.players)throw Error("Official history required");
 const result={};
 for(const [m,rule] of Object.entries(INDIVIDUAL_MARKETS)){
  const a={n:0,base:0,empirical:0,blend:0,baseLoss:0,blendLoss:0,empiricalLoss:0},games=new Map(),dates=new Set();
  for(const p of Object.values(history.players)){
   if(p.type!==rule.role)continue;
   const rows=(p.games||[]).filter(g=>["OFF","FINAL"].includes(g.gameState)&&g.type===rule.role&&Number.isInteger(g.gameId)&&Number.isFinite(g.timeOnIceSeconds)&&g.timeOnIceSeconds>0&&/^\d{4}-\d{2}-\d{2}$/.test(g.gameDate||"")&&Number.isFinite(g[rule.stat])&&(rule.unit==="count"?Number.isInteger(g[rule.stat])&&g[rule.stat]>=0:true)).sort((x,y)=>x.gameDate.localeCompare(y.gameDate)||x.gameId-y.gameId);
   if(new Set(rows.map(g=>g.gameId)).size!==rows.length)continue;
   for(const g of rows){
    if(g.gameDate<"2026-07-01")continue;
    const prior=rows.filter(x=>x.gameDate<g.gameDate).map(x=>x[rule.stat]);
    if(prior.length<8)continue;
    const mu=.5*mean(prior)+.25*mean(prior.slice(-10))+.25*mean(prior.slice(-5));
    for(const line of lines[m]){
     const base=estimateExperimentalMarketProbability({market:rule.stat,mean:mu,line,samples:prior});
     if(!base)continue;
     const empirical=mass(prior.slice(-20),line),blend=Object.fromEntries(OUT.map(k=>[k,.5*base[k]+.5*empirical[k]]));
     const y=g[rule.stat]>line?"higher":g[rule.stat]<line?"lower":"push";
     const baseB=brier(base,y),blendB=brier(blend,y);
     a.n++;a.base+=baseB;a.empirical+=brier(empirical,y);a.blend+=blendB;a.baseLoss+=loss(base,y);a.empiricalLoss+=loss(empirical,y);a.blendLoss+=loss(blend,y);
     const ag=games.get(g.gameId)||{diff:0,n:0};ag.diff+=blendB-baseB;ag.n++;games.set(g.gameId,ag);dates.add(g.gameDate);
    }
   }
  }
  const n=a.n;result[m]={syntheticLines:lines[m],thresholdEvaluations:n,distinctGames:games.size,distinctDates:dates.size,
   specialistBrier:n?a.base/n:null,empiricalBrier:n?a.empirical/n:null,blendBrier:n?a.blend/n:null,
   specialistLogLoss:n?a.baseLoss/n:null,empiricalLogLoss:n?a.empiricalLoss/n:null,blendLogLoss:n?a.blendLoss/n:null,
   blendMinusSpecialistBrierCluster95:bootstrapGameBrierDifference([...games.values()]),calibrationApproved:false};
 }
 return {kind:"nhl_individual_specialist_probability_lab_v1",generatedAt:new Date().toISOString(),byMarket:result,
  retrospectiveSyntheticThresholdsOnly:true,conditionalOnParticipation:true,realPlatformLinesUsed:false,modelPromoted:false};
}
module.exports={study};
