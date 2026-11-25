"use strict";
// Retrospective rolling calibration of frozen champion probabilities.
// Not an original pregame challenger; never promote or replace live predictions.
const {eligible}=require("./nhl-standard-forward-scoreboard.cjs");
const {pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
const clamp=p=>Math.max(1e-6,Math.min(1-1e-6,p));
function evaluate(rows,{minimumDayGap=1}={}){
 if(![1,2].includes(minimumDayGap))throw Error('invalid day gap');
 const days=new Map(),history=new Map(),byMarket={};
 for(const r of rows){
  if(!eligible(r,"champion"))continue;
  const q=r.shadow.variants.champion.probabilities,den=q?.higher+q?.lower;
  const day=pacificDay(r.gameStartAt);
  if(!Number.isFinite(den)||den<=0||!day)continue;
  const p=clamp(q.higher/den),y=Number(r.outcome.side==="Higher"),bin=Math.min(4,Math.floor(p*5));
  if(!days.has(day))days.set(day,[]);
  days.get(day).push({market:r.market,p,y,bin,day});
 }
 const pending=[];
 const hist=m=>{if(!history.has(m))history.set(m,{n:0,yes:0,days:new Set(),bins:Array.from({length:5},()=>({n:0,yes:0}))});return history.get(m)};
 for(const day of [...days.keys()].sort()){
  const batch=days.get(day);
  const cutoff=Date.parse(day+'T00:00:00Z')-minimumDayGap*86400000;
  while(pending.length&&Date.parse(pending[0].day+'T00:00:00Z')<=cutoff){
   for(const r of pending.shift().batch){const h=hist(r.market);h.n++;h.yes+=r.y;h.days.add(r.day);h.bins[r.bin].n++;h.bins[r.bin].yes+=r.y;}
  }
  for(const r of batch){
   const h=hist(r.market),b=h.bins[r.bin];
   if(h.n<100||h.days.size<5||b.n<10)continue;
   const base=(h.yes+10)/(h.n+20),p=clamp((b.yes+30*base)/(b.n+30)),y=r.y;
   const q=byMarket[r.market]??={n:0,days:new Set(),championBrierSum:0,calibratedBrierSum:0,baseBrierSum:0,shrunkBrierSum:0,championLogLoss:0,calibratedLogLoss:0,baseLogLoss:0,shrunkLogLoss:0,championCorrect:0,calibratedCorrect:0,baseCorrect:0,shrunkCorrect:0,alwaysHigher:0,alwaysLower:0};
   const shrunk=clamp((p+base)/2),loss=x=>y?-Math.log(x):-Math.log1p(-x);
   q.baseBrierSum+=(base-y)**2;q.shrunkBrierSum+=(shrunk-y)**2;q.championLogLoss+=loss(r.p);q.calibratedLogLoss+=loss(p);q.baseLogLoss+=loss(base);q.shrunkLogLoss+=loss(shrunk);q.baseCorrect+=Number((base>=.5)===Boolean(y));q.shrunkCorrect+=Number((shrunk>=.5)===Boolean(y));
   q.n++;q.days.add(day);q.championBrierSum+=(r.p-y)**2;q.calibratedBrierSum+=(p-y)**2;q.championCorrect+=Number((r.p>=.5)===Boolean(y));q.calibratedCorrect+=Number((p>=.5)===Boolean(y));q.alwaysHigher+=y;q.alwaysLower+=1-y;
  }
  pending.push({day,batch});
 }
 return {kind:"nhl_rolling_calibration_research_v1",priorDatesOnly:true,minimumDayGap,finalAvailabilityTimestampVerified:false,originalForecastFrozen:false,productionEligible:false,markets:Object.fromEntries(Object.entries(byMarket).map(([m,q])=>[m,{n:q.n,dates:q.days.size,championBrier:q.championBrierSum/q.n,calibratedBrier:q.calibratedBrierSum/q.n,neutralBrier:.25,marketPriorBrier:q.baseBrierSum/q.n,halfShrinkBrier:q.shrunkBrierSum/q.n,championLogLoss:q.championLogLoss/q.n,calibratedLogLoss:q.calibratedLogLoss/q.n,marketPriorLogLoss:q.baseLogLoss/q.n,halfShrinkLogLoss:q.shrunkLogLoss/q.n,marketPriorCorrect:q.baseCorrect,halfShrinkCorrect:q.shrunkCorrect,championCorrect:q.championCorrect,calibratedCorrect:q.calibratedCorrect,alwaysHigher:q.alwaysHigher,alwaysLower:q.alwaysLower}])),modelPromoted:false};
}
module.exports={evaluate};
