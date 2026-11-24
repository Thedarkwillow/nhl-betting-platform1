"use strict";
// Reference payouts only. Arbitrary-dependence bounds from fixed marginal
// probabilities; no fitted joint probability, push/void treatment, or EV.
const {STANDARD}=require("./prizepicks-payouts.cjs"),{scenario}=require("./nhl-lineup-format-scenario.cjs");
const clip=x=>Math.max(0,Math.min(1,x)),sum=a=>a.reduce((s,x)=>s+x,0);
function upperTail(ps,k){const n=ps.length,a=[...ps].sort((x,y)=>x-y);let upper=1;for(let m=n-k+1;m<=n;m++)upper=Math.min(upper,sum(a.slice(0,m))/(k-n+m));return clip(upper);}
function referenceBounds(ps,format){
 if(!Array.isArray(ps)||ps.length<2||ps.length>6||ps.some(p=>!Number.isFinite(p)||p<0||p>1)||!["power","flex"].includes(format)||format==="flex"&&ps.length===2)return null;
 const n=ps.length,table=STANDARD[format][n],tails=[];let lower=0,upper=0,last=0;
 for(let k=1;k<=n;k++){
  const lo=clip(1-upperTail(ps.map(p=>1-p),n-k+1)),hi=upperTail(ps,k),payout=table[k]||0,delta=payout-last;
  if(delta<0||lo>hi+1e-9)throw Error("Nonmonotonic table or inconsistent bounds");
  tails.push({hitsAtLeast:k,lower:lo,upper:hi});lower+=delta*lo;upper+=delta*hi;last=payout;
 }
 const independent=scenario(ps,format);
 return {format,size:n,allHit:tails.at(-1),tails,referenceGrossLower:lower,referenceGrossUpper:upper,independentReferenceGross:independent.hypotheticalGrossWeight,researchOnly:true,calibratedJointProbability:null,verifiedExpectedValue:null,platformPayoutVerified:false,assumesNoPushOrVoid:true};
}
// A marginal sensitivity range, not a confidence interval or fitted joint model.
// Shocks never become approved EV, and exact lineup payouts require independent proof.
function stressReferenceScenario(ps,format,{haircuts=[0,.05,.10]}={}){
 if(!Array.isArray(haircuts)||haircuts.length!==3||
  haircuts.some((v,i)=>!Number.isFinite(v)||v<0||v>.30||
   (i>0&&v<=haircuts[i-1])))return null;
 const base=referenceBounds(ps,format);if(!base)return null;
 const cases=haircuts.map(h=>{
  const shifted=ps.map(p=>Math.max(0,p-h));
  const bounds=referenceBounds(shifted,format);
  return {haircut:h,independentGrossReference:bounds.independentReferenceGross,
   arbitraryDependenceGrossLower:bounds.referenceGrossLower,
   arbitraryDependenceGrossUpper:bounds.referenceGrossUpper,
   allHitIndependent:shifted.reduce((x,p)=>x*p,1)};
 });
 if(cases.some((x,i)=>i>0&&(x.independentGrossReference>cases[i-1].independentGrossReference+1e-9||
  x.arbitraryDependenceGrossLower>cases[i-1].arbitraryDependenceGrossLower+1e-9)))
  throw Error("Incoherent lineup marginal stress ordering");
 return {kind:"lineup_reference_marginal_stress_v1",format,size:ps.length,cases,
  independentOutcomesAreOnlyAScenario:true,correlationUnestimated:true,
  pushesVoidsAndRebootsUnverified:true,requiresExactLineupSpecificPayoutQuote:true,
  originalPlatformEligibilityUnverified:true,modelProbabilitiesCalibrated:false,
  verifiedExpectedValue:null,automaticRecommendationEligible:false,researchOnly:true};
}
module.exports={upperTail,referenceBounds,stressReferenceScenario};
