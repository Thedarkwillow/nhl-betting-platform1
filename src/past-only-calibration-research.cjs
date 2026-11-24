"use strict";
/** Platt/beta calibration research fitted only to genuinely frozen,
 * separately committed already-decided observations. Not a release gate.
 * Every held-out forecast must be later than the immutable fit freeze.
 */
const time=x=>typeof x==="string"?Date.parse(x):NaN;
const finite=Number.isFinite,clip=x=>Math.min(.995,Math.max(.005,x));
const sigmoid=z=>1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));
const MIN_GAMES=30,MIN_SLATES=20,MIN_TRAIN=150;
function eligible(r,fitAt,before){
 if(!r||r.originalFirstGitVerified!==true||r.sideUnchanged!==true||
   r.officialStatVerified!==true||![0,1].includes(r.higherOutcome)||
   !finite(r.originalHigher)||r.originalHigher<0||r.originalHigher>1||
   typeof r.gameId!=="string"||!r.gameId||
   !["NHL","NFL","NBA","MLB","CS2","Valorant","LoL"].includes(r.sport)||
   !["Standard","Goblin","Demon"].includes(r.tier)||
   typeof r.market!=="string"||!r.market||
   typeof r.originalOfferKey!=="string"||!r.originalOfferKey||
   typeof r.slate!=="string"||!r.slate||
   ![time(r.originalSourceAt),time(r.originalFirstGitAt),
     time(r.gameStartsAt),time(r.officialFinalAt),time(fitAt)].every(finite)||
   time(r.originalSourceAt)>time(r.originalFirstGitAt)||
   time(r.originalFirstGitAt)>=time(r.gameStartsAt)-15*60000||
   time(r.officialFinalAt)<=time(r.gameStartsAt))return false;
 return before?time(r.officialFinalAt)<time(fitAt):
   time(r.originalSourceAt)>time(fitAt)&&
   time(r.originalFirstGitAt)>time(fitAt);
}
function features(p,kind){
 const q=clip(p);
 return kind==="platt"?[1,Math.log(q/(1-q))]:
   [1,Math.log(q),Math.log(1-q)];
}
function make(rows,kind){
 const grouped=new Map();
 for(const r of rows){const a=grouped.get(r.gameId)||[];a.push(r);grouped.set(r.gameId,a);}
 // Each final game contributes equal gradient mass, not each correlated prop.
 const data=[...grouped.values()].flatMap(a=>a.map(r=>({r,w:1/grouped.size/a.length})));
 let coef=kind==="platt"?[0,1]:[0,1,-1],base=coef.slice();
 for(let t=0;t<350;t++){
  const grad=Array(coef.length).fill(0);
  for(const {r,w} of data){
   const x=features(r.originalHigher,kind),p=sigmoid(coef.reduce((a,z,i)=>a+z*x[i],0));
   for(let i=0;i<grad.length;i++)grad[i]+=w*(p-r.higherOutcome)*x[i];
  }
  for(let i=0;i<grad.length;i++)coef[i]-=.045*(grad[i]+.2*(coef[i]-base[i]));
  if(coef.some(z=>!finite(z)||Math.abs(z)>15))throw Error("Unstable calibrator");
 }
 return coef;
}
function score(rows,kind,coef){
 if(!rows.length)return null;
 let brier=0,loss=0;
 for(const r of rows){
  const q=kind==="raw"?clip(r.originalHigher):sigmoid(coef.reduce(
    (a,v,i)=>a+v*features(r.originalHigher,kind)[i],0));
  brier+=(q-r.higherOutcome)**2;
  loss-=r.higherOutcome?Math.log(Math.max(1e-6,q)):
    Math.log(Math.max(1e-6,1-q));
 }
 return {n:rows.length,brier:brier/rows.length,logLoss:loss/rows.length};
}
function audit(rows,{fitAt}={}){
 const empty={kind:"past_only_nhl_nfl_calibration_challenger_v1",
  status:"blocked_insufficient_independent_frozen_training",
  fittedModels:[],training:{decisions:0,games:0,slates:0},
  future:{decisions:0,games:0,slates:0},
  calibratedProbabilityApproved:false,modelPromoted:false,
  platformSettlementVerified:false,verifiedROI:null,placedWagers:0};
 if(!finite(time(fitAt)))return {...empty,status:"missing_fit_freeze_timestamp"};
 const submitted=Array.isArray(rows)?rows:[];
 const groupNames=new Set(submitted.filter(x=>x&&x.sport&&x.tier&&x.market)
  .map(x=>[x.sport,x.market,x.tier].join("|")));
 if(groupNames.size>1)return {...empty,status:"mixed_sport_market_or_tier_must_fit_separately"};
 const valid=submitted.filter(x=>eligible(x,fitAt,true)),
  byKey=new Set(),train=valid.filter(x=>{
   const k=[x.gameId,x.market,x.originalOfferKey].join("|");
   if(byKey.has(k))return false;byKey.add(k);return true;
  });
 const games=new Set(train.map(x=>x.gameId)),slates=new Set(train.map(x=>x.slate));
 const futureUsed=new Set(),future=submitted.filter(x=>eligible(x,fitAt,false))
  .filter(x=>{const k=[x.gameId,x.market,x.originalOfferKey].join("|");
   if(futureUsed.has(k))return false;futureUsed.add(k);return true;});
 const fGames=new Set(future.map(x=>x.gameId)),fSlates=new Set(future.map(x=>x.slate));
 const report={...empty,training:{decisions:train.length,games:games.size,slates:slates.size},
  future:{decisions:future.length,games:fGames.size,slates:fSlates.size}};
 if(train.length<MIN_TRAIN||games.size<MIN_GAMES||slates.size<MIN_SLATES)
  return report;
 const calibrated={};
 for(const kind of ["platt","beta"]){
  const weights=make(train,kind);
  calibrated[kind]={status:"research_candidate_only",
   // All improvements must be measured on future observations unseen in fit.
   train:score(train,kind,weights),future:score(future,kind,weights)};
 }
 const baseline={train:score(train,"raw"),future:score(future,"raw")};
 return {...report,status:"research_calibrators_fitted_from_past_only",
  fittedModels:["platt","beta"],baseline,calibrated,
  // Never declare calibrated merely because training error improved.
  futureIndependentEvaluationFloorMet:fGames.size>=MIN_GAMES&&
   fSlates.size>=MIN_SLATES,calibratedProbabilityApproved:false};
}
module.exports={eligible,audit,features,MIN_GAMES,MIN_SLATES,MIN_TRAIN};
