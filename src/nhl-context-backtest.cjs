"use strict";
const {buildOpponentContext,adjustProjection}=require("./nhl-opponent-context.cjs");
const {projectPlayer}=require("./projections.cjs");
const MARKETS=["shotsOnGoal","goals","assists","points","blockedShots"];
function backtestContext(history){
 const events=new Map(),dates=new Set();
 for(const p of Object.values(history?.players||{}))for(const g of p.games||[]){
  if(g.gameId&&g.gameDate&&g.team){
   if(!events.has(g.gameId))events.set(g.gameId,new Set());
   events.get(g.gameId).add(g.team);
   dates.add(g.gameDate);
  }
 }
 const opponentByGame=new Map();
 for(const [id,teams] of events)if(teams.size===2)opponentByGame.set(id,[...teams]);
 const stats=Object.fromEntries(MARKETS.map(m=>[m,{samples:0,baselineAbsoluteError:0,adjustedAbsoluteError:0}]));
 const sorted=[...dates].sort();
 const contexts=new Map(sorted.map(date=>[date,buildOpponentContext(history,{beforeDate:date})]));
 for(const p of Object.values(history?.players||{})){
  if(p.type!=="skater")continue;
  const games=[...(p.games||[])].sort((a,b)=>a.gameDate.localeCompare(b.gameDate));
  for(const g of games){
   const prior=games.filter(x=>x.gameDate<g.gameDate);
   if(prior.length<5)continue;
   const teams=opponentByGame.get(g.gameId);
   const opponent=teams?.find(team=>team!==g.team);
   const context=contexts.get(g.gameDate);
   const base=projectPlayer({...p,games:prior});
   for(const m of MARKETS){
    const actual=g[m],estimate=base.projections[m]?.estimate;
    if(!Number.isFinite(actual)||!Number.isFinite(estimate))continue;
    const adj=adjustProjection(estimate,m,opponent,context).estimate;
    const record=stats[m];record.samples++;
    record.baselineAbsoluteError+=Math.abs(estimate-actual);
    record.adjustedAbsoluteError+=Math.abs(adj-actual);
   }
  }
 }
 const byMarket={};let observations=0;
 for(const [market,s] of Object.entries(stats)){
  observations+=s.samples;
  const a=s.samples?s.baselineAbsoluteError/s.samples:null,b=s.samples?s.adjustedAbsoluteError/s.samples:null;
  byMarket[market]={samples:s.samples,baselineMAE:a,adjustedMAE:b,
   adjustmentPassed:s.samples>=100&&a!==null&&b<a-.005};
 }
 return {model:"nhl-shrunk-opponent-v1",method:"Chronological rolling pregame prediction, within-player baseline versus opponent-adjusted MAE",
  distinctDates:sorted.length,observations,byMarket,
  minimumSamplesPerMarket:100,improvementThresholdMAE:.005,
  claim:"Historical stat forecast MAE only; not a prop-line hit rate, payout EV, or calibrated bet probability."};
}
module.exports={backtestContext};
