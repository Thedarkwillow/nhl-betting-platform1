"use strict";
// Historical synthetic lines only; compare earlier observed reconciled appearances
// including verified zero attempts to the attempt-conditional sample.
// No actual-line performance, settlement or unconditional playing probability.
const LINES={fg_made:[.5,1.5,2.5],fg_attempts:[.5,1.5,2.5],pat_made:[.5,1.5,2.5],kicking_points:[4.5,6.5,8.5]};
const mass=(a,line)=>{const hits=a.filter(v=>v>line).length;return (hits+1)/(a.length+2);};
const loss=(p,y)=>-(y?Math.log(p):Math.log1p(-p));
function study(rows){
 const groups=new Map(),keys=new Map();
 for(const r of rows||[]){
  if(!r.playerId||!r.gameId||!Number.isInteger(r.year)||!Number.isInteger(r.week)||typeof r.zeroAttempt!=="boolean"||
   !Object.keys(LINES).every(k=>Number.isFinite(r.measures?.[k])&&r.measures[k]>=0)||
   r.zeroAttempt&&Object.keys(LINES).some(k=>r.measures[k]!==0))continue;
  const k=JSON.stringify([r.playerId,r.year,r.week]);const a=keys.get(k)||[];a.push(r);keys.set(k,a);
 }
 for(const a of keys.values())if(a.length===1){const r=a[0],v=groups.get(r.playerId)||[];v.push(r);groups.set(r.playerId,v);}
 const byMarket={};
 for(const [market,lines] of Object.entries(LINES)){
  let n=0,withZeros=0,conditional=0,withZerosLoss=0,conditionalLoss=0;const games=new Set(),weeks=new Set();
  for(const a of groups.values()){
   const sorted=[...a].sort((x,y)=>x.year-y.year||x.week-y.week);
   for(const r of sorted){
    if(r.year<2025)continue;
    const prior=sorted.filter(p=>p.year<r.year||p.year===r.year&&p.week<r.week).slice(-20);
    const attempts=prior.filter(p=>!p.zeroAttempt);
    if(prior.length<8||attempts.length<8)continue;
    for(const line of lines){const y=Number(r.measures[market]>line),p=mass(prior.map(x=>x.measures[market]),line),q=mass(attempts.map(x=>x.measures[market]),line);
     n++;withZeros+=(p-y)**2;conditional+=(q-y)**2;withZerosLoss+=loss(p,y);conditionalLoss+=loss(q,y);games.add(r.gameId);weeks.add(r.year+"-"+r.week);}
   }
  }
  byMarket[market]={syntheticLines:lines,evaluations:n,distinctGames:games.size,distinctWeeks:weeks.size,
   priorAllAppearanceBrier:n?withZeros/n:null,priorAttemptConditionalBrier:n?conditional/n:null,
   priorAllAppearanceLogLoss:n?withZerosLoss/n:null,priorAttemptConditionalLogLoss:n?conditionalLoss/n:null};
 }
 return {kind:"nfl_reconciled_kicker_walk_forward_synthetic_v1",byMarket,conditionalOnObservedAppearance:true,actualPlatformLines:false,productionEligible:false};
}
module.exports={study};
