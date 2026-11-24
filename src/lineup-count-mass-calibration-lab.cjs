"use strict";
// Walk-forward whole-lineup count-mass calibration lab. One original
// scenario per format/size and slate; never treat overlapping slips as IID.
const valid=x=>Array.isArray(x)&&x.length>=3&&x.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&Math.abs(x.reduce((a,b)=>a+b,0)-1)<1e-6;
const loss=(v,y)=>-Math.log(Math.max(1e-8,v[y]));
const brier=(v,y)=>v.reduce((s,p,i)=>s+(p-Number(i===y))**2,0);
// Fixed same-mean tail mixture: a dependence stress test, not estimated correlation.
function dependenceSensitivity(mass){
 if(!valid(mass))return null;
 const n=mass.length-1,total=mass.reduce((s,p)=>s+p,0),mean=mass.reduce((s,p,i)=>s+i*p,0)/(n*total);
 return mass.map((p,i)=>.85*p/total+.15*(i===0?1-mean:i===n?mean:0));
}
function evaluate(records){
 const unique=new Map();
 for(const r of records||[]){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.slate||"")||!valid(r.mass)||!Number.isInteger(r.hits)||r.hits<0||r.hits>=r.mass.length||
    !Number.isFinite(Date.parse(r.frozenAt))||!Number.isFinite(Date.parse(r.resolvedAt))||Date.parse(r.resolvedAt)<=Date.parse(r.frozenAt))continue;
  const k=r.slate,old=unique.get(k);
  if(!old||Date.parse(r.frozenAt)<Date.parse(old.frozenAt))unique.set(k,r);
 }
 const rows=[...unique.values()].sort((a,b)=>a.slate.localeCompare(b.slate)),scored=[];
 for(let i=0;i<rows.length;i++){
  const x=rows[i],prior=rows.slice(0,i).filter(r=>Date.parse(r.resolvedAt)<Date.parse(x.frozenAt)&&r.mass.length===x.mass.length);
  if(prior.length<20)continue;
  const bins=x.mass.map(()=>1);
  for(const p of prior)bins[p.hits]++;
  const sum=bins.reduce((a,b)=>a+b,0),candidate=x.mass.map((p,k)=>.75*p+.25*bins[k]/sum);
  const stress=dependenceSensitivity(x.mass),priorRate=bins.map(v=>v/sum);
  scored.push({priorRateBrier:brier(priorRate,x.hits),priorRateLoss:loss(priorRate,x.hits),raw:brier(x.mass,x.hits),candidate:brier(candidate,x.hits),rawLoss:loss(x.mass,x.hits),candidateLoss:loss(candidate,x.hits),stressBrier:brier(stress,x.hits),stressLoss:loss(stress,x.hits)});
 }
 // Score fixed dependence stress for each possible hit-count tail on all
 // resolved first-observed slates, even before trainable calibration exists.
 const thresholds={};
 for(const x of rows){
  const stress=dependenceSensitivity(x.mass),size=x.mass.length-1;
  for(let k=Math.max(1,size-2);k<=size;k++){
   const a=thresholds[k]??={n:0,raw:0,stress:0,observed:0};
   const p=x.mass.slice(k).reduce((s,v)=>s+v,0),q=stress.slice(k).reduce((s,v)=>s+v,0),y=Number(x.hits>=k);
   a.n++;a.raw+=(p-y)**2;a.stress+=(q-y)**2;a.observed+=y;
  }
 }
 const thresholdDiagnostics=Object.fromEntries(Object.entries(thresholds).map(([k,a])=>[k,{resolvedSlates:a.n,observedAtLeastHits:a.observed,independentBrier:a.raw/a.n,tailStressBrier:a.stress/a.n}]));
 const n=scored.length,mean=k=>n?scored.reduce((a,b)=>a+b[k],0)/n:null;
 return {distinctResolvedSlates:rows.length,heldoutSlates:n,minimumTrainingSlates:20,minimumHeldoutSlates:30,
 matchedPriorSlateRateBrier:mean("priorRateBrier"),matchedPriorSlateRateLogLoss:mean("priorRateLoss"),rawBrier:mean("raw"),candidateBrier:mean("candidate"),rawLogLoss:mean("rawLoss"),candidateLogLoss:mean("candidateLoss"),
 dependenceStressResearch:{mixtureWeight:.15,preservesExpectedHits:true,brier:mean("stressBrier"),logLoss:mean("stressLoss"),correlationEstimated:false},
 thresholdDiagnostics,thresholdDiagnosticsUseNoFittedCorrelation:true,
 minimumEvidenceSizeReached:n>=30,releaseDiagnostics:{additionalHeldoutSlatesRequired:Math.max(0,30-n),minimumTrainingSlates:20,beatsRawBrier:n>=30&&mean('candidate')<mean('raw'),beatsPriorFrequencyBrier:n>=30&&mean('candidate')<mean('priorRateBrier'),beatsRawLogLoss:n>=30&&mean('candidateLoss')<mean('rawLoss'),beatsPriorFrequencyLogLoss:n>=30&&mean('candidateLoss')<mean('priorRateLoss'),requiresIndependentDependenceValidation:true,requiresAuthenticatedPayoutAndSettlement:true},calibrationApproved:false,independentJointProbabilityVerified:false,
 retrospectiveWalkForwardResearchOnly:true,platformSettlementVerified:false,modelPromoted:false};
}
function observe(records,previous,now){
 const at=Date.parse(now);if(!Number.isFinite(at))throw Error("Observation timestamp required");
 const old=new Map([...(previous?.firstObservationLedger||[]),...(previous?.records||[])].map(r=>[r.id,r])),out=[];
 const conflicts=new Set(previous?.quarantinedIds||[]),counts=new Map();
 for(const r of records||[])if(r.id)counts.set(r.id,(counts.get(r.id)||0)+1);
 for(const r of records||[]){
  const prior=old.get(r.id);
  if(counts.get(r.id)!==1||prior&&(prior.hits!==r.hits||JSON.stringify(prior.mass)!==JSON.stringify(r.mass)||prior.frozenAt!==r.frozenAt||prior.slate!==r.slate||prior.formatSize!==r.formatSize)){if(r.id)conflicts.add(r.id);continue;}
  if(conflicts.has(r.id))continue;
  if(!r.id||!r.formatSize||!valid(r.mass)||!Number.isInteger(r.hits)||r.hits<0||r.hits>=r.mass.length||
     !Number.isFinite(Date.parse(r.frozenAt))||Date.parse(r.frozenAt)>=at)continue;
  const resolvedAt=prior?.resolvedAt||now;
  if(!Number.isFinite(Date.parse(resolvedAt))||Date.parse(resolvedAt)<=Date.parse(r.frozenAt)||Date.parse(resolvedAt)>at)continue;
  const entry={...r,resolvedAt};old.set(r.id,entry);out.push(entry);
 }
 const byFormat={};
 for(const k of [...new Set(out.map(r=>r.formatSize))])byFormat[k]=evaluate(out.filter(r=>r.formatSize===k));
 return {kind:"first_observed_final_scenario_research_v1",records:out,firstObservationLedger:[...old.values()],quarantinedIds:[...conflicts].sort(),byFormat,calibrationApproved:false,modelPromoted:false};
}
module.exports={evaluate,observe,dependenceSensitivity};
