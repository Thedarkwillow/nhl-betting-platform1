"use strict";
// Independent-outcome scenario only. No live payout quote, calibrated joint
// probabilities, platform settlement, expected-value or recommendation claim.
const {STANDARD}=require("./prizepicks-payouts.cjs");
function eligibleVector(p){
 const v=p?.probabilities,side=String(p?.lean||"").toLowerCase();
 return ["higher","lower"].includes(side)&&
   [v?.higher,v?.lower,v?.push].every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&
   Math.abs(v.higher+v.lower+v.push-1)<=1e-6&&v.push===0&&
   Number.isFinite(p.probability)&&p.probability>0.5&&p.probability<1&&
   Math.abs(v[side]-p.probability)<=1e-6;
}
function scenario(probabilities,format){
 if(!Array.isArray(probabilities)||probabilities.length<2||probabilities.length>6||
    !["power","flex"].includes(format)||(format==="flex"&&probabilities.length===2)||
    probabilities.some(p=>!Number.isFinite(p)||p<0||p>1))return null;
 const n=probabilities.length,payout=STANDARD[format][n],mass=Array(n+1).fill(0);
 mass[0]=1;
 for(let i=0;i<n;i++){
  const p=probabilities[i];
  for(let k=i+1;k>=0;k--)mass[k]=(mass[k]||0)*(1-p)+(k?mass[k-1]*p:0);
 }
 return {format,allCorrect:mass[n],
  modeledCountMass:mass,
  hypotheticalGrossWeight:mass.reduce((s,v,k)=>s+v*(payout[k]||0),0),
  researchOnly:true,assumesIndependentBinaryOutcomes:true,
  pushesAndVoidsExcluded:true,standardReferenceTableOnly:true,
  calibratedJointProbability:null,verifiedExpectedValue:null,
  payoutQuoteVerified:false,productionEligible:false};
}
module.exports={eligibleVector,scenario};
