"use strict";
// Outcome-blind fixed pair per game and market, previous dates only. No picks or ROI.
const {eligible}=require("./nhl-standard-forward-scoreboard.cjs");
const {pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
function assess(rows){
 const g=new Map();
 for(const r of rows){if(!eligible(r,"champion")||!Number.isInteger(r.playerId)||!Number.isInteger(r.gameId))continue;
  const q=r.shadow.variants.champion.probabilities,den=q?.higher+q?.lower,day=pacificDay(r.gameStartAt);
  if(!day||!Number.isFinite(den)||den<=0||q.higher<0||q.lower<0)continue;
  const k=JSON.stringify([r.market,r.gameId]),a=g.get(k)||[];a.push({r,day,p:q.higher/den});g.set(k,a);}
 const groups=new Map();
 for(const a of g.values()){
  if(new Set(a.map(x=>x.day)).size!==1)continue;
  // First ID pair only; no ranking, no outcome-based substitution.
  a.sort((x,y)=>x.r.playerId-y.r.playerId||x.r.line-y.r.line);
  const x=a[0],y=a.find(z=>z.r.playerId!==x.r.playerId);if(!y)continue;
  const k=x.r.market,list=groups.get(k)||[];
  list.push({day:x.day,p:x.p,q:y.p,a:Number(x.r.outcome.side==="Higher"),b:Number(y.r.outcome.side==="Higher")});groups.set(k,list);
 }
 const markets={};
 for(const [k,a] of groups){
  const result={pairs:a.length,scored:0,independentBrier:0,shrunkDependenceBrier:0};
  for(const x of a){const prior=a.filter(y=>Date.parse(y.day)<=Date.parse(x.day)-2*86400000);if(prior.length<20)continue;
   const pa=(1+prior.reduce((s,z)=>s+z.a,0))/(prior.length+2),pb=(1+prior.reduce((s,z)=>s+z.b,0))/(prior.length+2),joint=(1+prior.filter(z=>z.a&&z.b).length)/(prior.length+4);
   const independent=x.p*x.q,adjusted=clamp(independent+.25*(joint-pa*pb),Math.max(0,x.p+x.q-1),Math.min(x.p,x.q)),actual=x.a*x.b;
   result.scored++;result.independentBrier+=(independent-actual)**2;result.shrunkDependenceBrier+=(adjusted-actual)**2;
  }
  for(const field of ["independentBrier","shrunkDependenceBrier"])result[field]=result.scored?result[field]/result.scored:null;markets[k]=result;
 }
 return {kind:"nhl_original_line_pair_dependence_diagnostic_v1",markets,onePairPerGameMarket:true,selectionConditionedOnDecidedRows:true,minimumPriorGames:20,dayGap:2,firstFinalAvailabilityVerified:false,originalJointForecastFrozen:false,calibrationApproved:false,modelPromoted:false,rawRowsPublished:0,paidRequests:0};
}
module.exports={assess};
