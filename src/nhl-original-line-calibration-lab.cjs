"use strict";
// Actual original selected thresholds, half-lines only. Earlier observed
// official finals (not merely earlier scheduled games) may train. No picks.
const {rowValid}=require("./nhl-frozen-baseline-challenge.cjs");
const dt=x=>typeof x==="string"?Date.parse(x):NaN,num=x=>typeof x==="number"&&Number.isFinite(x),clip=p=>Math.max(.000001,Math.min(.999999,p)),logit=p=>Math.log(clip(p)/(1-clip(p))),sigmoid=x=>1/(1+Math.exp(-x));
const half=x=>num(x)&&Math.abs(x-Math.floor(x)-.5)<1e-8;
const key=(...x)=>JSON.stringify(x);
function join(ledger,state){
 const rows=new Map(),counts=new Map(),observed=new Map(),duplicates=new Set(),blocked=new Set(state?.quarantined||[]);
 for(const r of ledger?.records||[]){counts.set(r.id,(counts.get(r.id)||0)+1);rows.set(r.id,r);}
 for(const s of state?.firstObserved||[]){if(observed.has(s.id))duplicates.add(s.id);observed.set(s.id,s);}
 const out=[];
 for(const [id,r] of rows){
  const s=observed.get(id);
  if(counts.get(id)!==1||duplicates.has(id)||blocked.has(id)||!s||!rowValid(r)||r.tier!=="Standard"||!half(r.line)||!["correct","incorrect"].includes(r.selectionStatus)||!num(r.estimatedProbability)||r.estimatedProbability<=0||r.estimatedProbability>=1||s.gameId!==r.gameId||s.market!==r.market||s.tier!==r.tier||s.side!==r.selectedSide||s.p!==r.estimatedProbability||s.y!==Number(r.selectionStatus==="correct")||s.frozenAt!==r.firstGitCommittedAt||s.startAt!==r.gameStartAt||!(dt(s.startAt)<dt(s.observedFinalAt)))continue;
  out.push({id,gameId:r.gameId,market:r.market,side:r.selectedSide,p:r.estimatedProbability,y:s.y,frozenAt:s.frozenAt,observedAt:s.observedFinalAt});
 }
 return out;
}
function estimate(prior,target){
 const a=prior.filter(r=>r.gameId!==target.gameId&&dt(r.observedAt)<dt(target.frozenAt)&&r.side===target.side);
 const b=a.filter(r=>r.market===target.market),games=new Set(a.map(r=>r.gameId));
 if(a.length<60||games.size<15)return null;
 // Equal-game weighting and a ridge-regularized intercept only, with
 // confidence shrinkage. Fixed alternative, not fitted to latest misses.
 function offset(rows,anchor,weight){
  const g=new Map();for(const r of rows){const z=g.get(r.gameId)||[];z.push(r);g.set(r.gameId,z);}
  let v=anchor;
  for(let i=0;i<20;i++){
   let gradient=weight*(v-anchor),hessian=weight;
   for(const q of g.values())for(const r of q){const p=sigmoid(.75*logit(r.p)+v);gradient+=(p-r.y)/q.length;hessian+=p*(1-p)/q.length;}
   v=Math.max(-1,Math.min(1,v-gradient/hessian));
  }
  return v;
 }
 const side=offset(a,0,10),market=offset(b,side,8);
 return {p:sigmoid(.75*logit(target.p)+market),trainingRows:a.length,trainingGames:games.size,marketRows:b.length};
}
function study(ledger,state){
 const a=join(ledger,state),groups={};
 for(const r of a){const f=estimate(a,r),k=key(r.market,r.side),v=groups[k]??={n:0,sumP:0,hits:0,rawBrier:0,neutralBrier:0,shrinkBrier:0,matched:0,matchedRaw:0,adjusted:0,matchedRawLoss:0,adjustedLoss:0,games:new Set(),matchedGames:new Set()};
  v.n++;v.games.add(r.gameId);v.sumP+=r.p;v.hits+=r.y;v.rawBrier+=(r.p-r.y)**2;v.neutralBrier+=(.5-r.y)**2;v.shrinkBrier+=(sigmoid(.75*logit(r.p))-r.y)**2;
  if(f){v.matched++;v.matchedGames.add(r.gameId);v.matchedRaw+=(r.p-r.y)**2;v.adjusted+=(f.p-r.y)**2;v.matchedRawLoss-=Math.log(clip(r.y?r.p:1-r.p));v.adjustedLoss-=Math.log(clip(r.y?f.p:1-f.p));}
 }
 return {kind:"nhl_original_half_line_calibration_lab_v1",validatedOriginalRows:a.length,byMarketSide:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{observed:v.n,distinctGames:v.games.size,meanEstimatedProbability:v.sumP/v.n,observedHitRate:v.hits/v.n,rawBrier:v.rawBrier/v.n,neutralBrier:v.neutralBrier/v.n,fixedShrinkSensitivityBrier:v.shrinkBrier/v.n,matchedEarlierFinalRows:v.matched,matchedGames:v.matchedGames.size,matchedChampionBrier:v.matched?v.matchedRaw/v.matched:null,adjustedBrier:v.matched?v.adjusted/v.matched:null,matchedChampionLogLoss:v.matched?v.matchedRawLoss/v.matched:null,adjustedLogLoss:v.matched?v.adjustedLoss/v.matched:null}])),fixedShrinkSensitivityRetrospective:true,firstObservedTrainingOnly:true,actualPlatformSettlementVerified:false,calibrationApproved:false,modelPromoted:false};
}
module.exports={join,estimate,study};
