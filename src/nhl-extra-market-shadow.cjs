"use strict";
/**
 * Additional NHL full-game markets sourced from official final games.
 * All past-only exploratory estimates. Never substitute future outcome data.
 */
const REQUIRED_OBSERVATIONS=8;
const marketDefinitions=Object.freeze({
 powerPlayPoints:{role:"skater",unit:"count",source:"NHL Stats REST skater/summary ppPoints"},
 plusMinus:{role:"skater",unit:"signed_integer",source:"NHL gamecenter plusMinus with Stats REST cross-check"},
 goalsAgainst:{role:"goalie",unit:"count",source:"NHL gamecenter and goalie/summary goalsAgainst"}
});
function mean(v){return v.reduce((s,x)=>s+x,0)/v.length;}
const round=x=>Number(x.toFixed(4));
function projectExtraMarket(p,asOf){
 const timestamp=Date.parse(asOf);
 if(!Number.isFinite(timestamp)||!p||!Array.isArray(p.games)||
  !["skater","goalie"].includes(p.type))throw Error("Invalid NHL stat history projection");
 const day=new Date(timestamp).toISOString().slice(0,10);
 const prior=p.games.filter(g=>/^\d{4}-\d{2}-\d{2}$/.test(g?.gameDate||"")&&
  g.gameDate<day).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||
   a.gameId-b.gameId);
 const projections={};
 for(const [stat,rule] of Object.entries(marketDefinitions)){
  if(rule.role!==p.type)continue;
  const samples=prior.map(x=>x[stat]).filter(x=>Number.isInteger(x)&&
   (rule.unit==="signed_integer"||x>=0));
  const n=samples.length,ok=n>=REQUIRED_OBSERVATIONS;
  const all=n?mean(samples):null,l5=n?mean(samples.slice(-5)):null,
   l10=n?mean(samples.slice(-10)):null;
  // Research-only, fixed predeclared 50% season + 30% last-ten + 20% last-five.
  const prediction=ok?(0.5*all+0.3*l10+0.2*l5):null;
  const spread=n>1?Math.sqrt(mean(samples.map(x=>(x-all)**2))):null;
  projections[stat]={estimate:prediction===null?null:round(prediction),
   last5:l5===null?null:round(l5),last10:l10===null?null:round(l10),
   sampleStdDev:spread===null?null:round(spread),observations:n,
   readyForResearch:ok,readyForLivePicks:false,higherProbability:null,
   lowerProbability:null,calibrated:false,expectedValue:null,
   unit:rule.unit,source:rule.source,model:"nhl-extra-market-static-shadow-v1"};
 }
 return {playerId:p.playerId,type:p.type,latestPriorDate:prior.at(-1)?.gameDate??null,
  projections};
}
function buildExtraMarketShadow(history,{asOf=new Date().toISOString()}={}){
 if(!history?.players)throw Error("Missing official player history");
 const players={},coverage=Object.fromEntries(Object.keys(marketDefinitions).map(
  stat=>[stat,{sourceObservations:0,readyPlayers:0}]));
 for(const [id,p] of Object.entries(history.players)){
  if(!p||!["skater","goalie"].includes(p.type))continue;
  const result=projectExtraMarket(p,asOf);players[id]=result;
  for(const [key,projection] of Object.entries(result.projections)){
   coverage[key].sourceObservations+=projection.observations;
   if(projection.readyForResearch)coverage[key].readyPlayers++;
  }
 }
 return {schemaVersion:1,kind:"nhl_extra_market_stat_shadow",
  builtAt:new Date(Date.parse(asOf)).toISOString(),
  status:"research_only_not_calibrated",marketDefinitions,
  modeledMarkets:Object.keys(marketDefinitions),sourceCoverage:coverage,
  modelProbabilitiesCalibrated:false,originalPlatformQuotesVerified:false,
  productionChampionChanged:false,liveOptimizerEnabled:false,
  warning:"Past-only raw-stat point estimates, not validated Higher/Lower odds or verified provider lines. Goalie starter, scoreless-result and signed-stat distribution checks still required.",
  players};
}
module.exports={marketDefinitions,projectExtraMarket,
 buildExtraMarketShadow,REQUIRED_OBSERVATIONS};
