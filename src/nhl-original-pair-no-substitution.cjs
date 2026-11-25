"use strict";
// Choose fixed identity-ordered original pairs before consulting outcomes.
// Reconstruction from original pregame rows, not original joint predictions.
const {pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
function select(rows){
 const g=new Map();
 for(const r of rows){
  const q=r.shadow?.variants?.champion?.probabilities,den=q?.higher+q?.lower,day=pacificDay(r.gameStartAt);
  if(!Number.isInteger(r.playerId)||!Number.isInteger(r.gameId)||!Number.isFinite(r.line)||!day||r.shadow?.variants?.champion?.status!=="research_only"||!Number.isFinite(den)||den<=0||q.higher<0||q.lower<0)continue;
  const k=JSON.stringify([r.market,r.gameId]);const a=g.get(k)||[];a.push({r,p:q.higher/den,day});g.set(k,a);
 }
 const out=[];
 for(const a of g.values()){
  if(new Set(a.map(x=>x.day)).size!==1)continue;
  a.sort((x,y)=>x.r.playerId-y.r.playerId||x.r.line-y.r.line);
  const x=a[0],y=a.find(z=>z.r.playerId!==x.r.playerId);if(!y)continue;
  out.push({market:x.r.market,gameId:x.r.gameId,day:x.day,x,y});
 }
 return out;
}
function assess(rows){
 const pairs=select(rows),groups=new Map(),summary={};
 for(const pair of pairs){
  const g=summary[pair.market]??={registered:0,resolved:0,pendingOrVoid:0,scored:0,independentBrier:0,shrunkBrier:0};
  g.registered++;
  if(![pair.x,pair.y].every(z=>z.r.outcome?.status==="decided"&&["Higher","Lower"].includes(z.r.outcome.side))){g.pendingOrVoid++;continue;}
  g.resolved++;
  const a=groups.get(pair.market)||[];
  a.push({day:pair.day,p:pair.x.p,q:pair.y.p,a:Number(pair.x.r.outcome.side==="Higher"),b:Number(pair.y.r.outcome.side==="Higher")});groups.set(pair.market,a);
 }
 for(const [m,a] of groups){
  const g=summary[m];
  for(const x of a){
   const prior=a.filter(y=>Date.parse(y.day)<=Date.parse(x.day)-2*86400000);if(prior.length<20)continue;
   const p=(1+prior.reduce((s,z)=>s+z.a,0))/(prior.length+2),q=(1+prior.reduce((s,z)=>s+z.b,0))/(prior.length+2),joint=(1+prior.filter(z=>z.a&&z.b).length)/(prior.length+4);
   const i=x.p*x.q,j=clamp(i+.25*(joint-p*q),Math.max(0,x.p+x.q-1),Math.min(x.p,x.q)),y=x.a*x.b;
   g.scored++;g.independentBrier+=(i-y)**2;g.shrunkBrier+=(j-y)**2;
  }
 }
 for(const g of Object.values(summary)){for(const k of ["independentBrier","shrunkBrier"])g[k]=g.scored?g[k]/g.scored:null;}
 return {kind:"nhl_original_pair_no_substitution_v1",markets:summary,selectedBeforeCheckingOutcome:true,pendingAndPushNeverReplaced:true,firstFinalAvailabilityVerified:false,originalJointForecastFrozen:false,productionApproved:false,paidRequests:0,rawRowsPublished:0};
}
module.exports={select,assess};
