"use strict";
// Retrospective research on original registered NHL choices. No selected sides
// changed. Historical final-stat availability timestamps are not established;
// the conservative date embargo is NOT a verified live calibration experiment.
const {rowValid}=require("./nhl-frozen-baseline-challenge.cjs");
const TIERS=["Standard","Goblin","Demon"],bounds=[0,.5,.6,.7,.8,.9,1.000001];
const date=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x));
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const clip=x=>Math.min(.999999,Math.max(.000001,x));
const bin=p=>bounds.findIndex((x,i)=>i<bounds.length-1&&p>=x&&p<bounds[i+1]);
const loss=(p,y)=>-(y*Math.log(clip(p))+(1-y)*Math.log(1-clip(p)));
function fit(prior,p){
 const b=bin(p),a=prior.filter(x=>bin(x.estimatedProbability)===b);
 if(a.length<25||new Set(a.map(x=>x.gameId)).size<10)return null;
 // Equivalent of 20 pseudo-observations at the bin's mean original confidence.
 const q=a.reduce((s,x)=>s+Number(x.selectionStatus==="correct"),0);
 const mean=a.reduce((s,x)=>s+x.estimatedProbability,0)/a.length;
 return (q+20*mean)/(a.length+20);
}
// A fixed, tier-only calibration intercept: weight each past game equally,
// shrink its average calibration residual toward zero, and preserve the
// original side. Unlike confidence bins, this can be studied in sparse bins.
function offsetFit(prior,p){
 const groups=new Map();
 for(const x of prior){
  const a=groups.get(x.gameId)||{sum:0,n:0};
  a.sum+=Number(x.selectionStatus==="correct")-x.estimatedProbability;
  a.n++;groups.set(x.gameId,a);
 }
 if(prior.length<60||groups.size<15||new Set(prior.map(x=>x.officialGameDate)).size<5)return null;
 const delta=[...groups.values()].reduce((s,g)=>s+g.sum/g.n,0)/(groups.size+20);
 return clip(p+Math.max(-.15,Math.min(.15,delta)));
}
function study(ledger){
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||!Array.isArray(ledger.records))return {status:"unverified_original_ledger",byTier:{},modelPromoted:false};
 const ids=new Map();for(const row of ledger.records){const a=ids.get(row.id)||[];a.push(row);ids.set(row.id,a);}
 const all=[...ids.values()].filter(a=>a.length===1).map(a=>a[0]).filter(x=>rowValid(x)&&Number.isFinite(x.estimatedProbability)&&x.estimatedProbability>0&&x.estimatedProbability<1);
 const byTier={},tierOffsetReplay={};
 for(const tier of TIERS){
  const cohort=all.filter(x=>x.tier===tier&&(tier==="Standard"||x.selectedSide==="Higher"));
  const final=cohort.filter(x=>["correct","incorrect","push"].includes(x.selectionStatus)&&date(x.officialGameDate));
  let n=0,raw=0,fitted=0,rawLoss=0,fittedLoss=0;const games=new Set(),dates=new Set();
  const offsets={n:0,raw:0,fit:0,rawLoss:0,fitLoss:0,games:new Set(),dates:new Set()};
  for(const x of final){
   const cutoff=dt(x.firstGitCommittedAt)-2*86400000;
   const prior=final.filter(p=>p.gameId!==x.gameId&&dt(p.officialGameDate+"T23:59:59Z")<cutoff&&dt(p.firstGitCommittedAt)<dt(x.firstGitCommittedAt));
   if(prior.length<60||new Set(prior.map(p=>p.gameId)).size<15||new Set(prior.map(p=>p.officialGameDate)).size<5)continue;
   const y=Number(x.selectionStatus==="correct"),p=offsetFit(prior,x.estimatedProbability);
   if(p!==null){offsets.n++;offsets.games.add(x.gameId);offsets.dates.add(x.officialGameDate);offsets.raw+=(x.estimatedProbability-y)**2;offsets.fit+=(p-y)**2;offsets.rawLoss+=loss(x.estimatedProbability,y);offsets.fitLoss+=loss(p,y);}
   const q=fit(prior,x.estimatedProbability);if(q===null)continue;
   n++;games.add(x.gameId);dates.add(x.officialGameDate);
   raw+=(x.estimatedProbability-y)**2;fitted+=(q-y)**2;rawLoss+=loss(x.estimatedProbability,y);fittedLoss+=loss(q,y);
  }
  tierOffsetReplay[tier]={matchedHeldout:offsets.n,distinctHeldoutGames:offsets.games.size,distinctHeldoutDates:offsets.dates.size,rawBrier:offsets.n?offsets.raw/offsets.n:null,offsetBrier:offsets.n?offsets.fit/offsets.n:null,rawLogLoss:offsets.n?offsets.rawLoss/offsets.n:null,offsetLogLoss:offsets.n?offsets.fitLoss/offsets.n:null,sampleGateReached:offsets.n>=100&&offsets.games.size>=30&&offsets.dates.size>=10,calibrationApproved:false};
  byTier[tier]={registered:cohort.length,officialFinal:final.length,matchedHeldout:n,distinctHeldoutGames:games.size,distinctHeldoutDates:dates.size,rawBrier:n?raw/n:null,fittedBrier:n?fitted/n:null,rawLogLoss:n?rawLoss/n:null,fittedLogLoss:n?fittedLoss/n:null,sampleGateReached:n>=100&&games.size>=30&&dates.size>=10,calibrationApproved:false};
 }
 return {kind:"nhl_original_selected_strict_hit_calibration_replay_v1",status:"retrospective_only",byTier,tierOffsetReplay,trainingEmbargoHours:48,target:"selected_direction_correct_vs_nonhit_including_push",actualFinalObservationTimeVerified:false,prospectiveCalibration:false,modelPromoted:false,platformSettlementVerified:false};
}
module.exports={study,fit,offsetFit};
