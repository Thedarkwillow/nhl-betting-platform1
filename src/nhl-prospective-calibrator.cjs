"use strict";
/**
 * Fixed-form monotone logistic shrinkage challenger.
 * FIT only on outcomes settled BEFORE a separate prospective policy cutoff.
 * Parameters are private research diagnostics, NOT an approved probability model.
 */
const sigmoid=z=>1/(1+Math.exp(-Math.max(-20,Math.min(20,z))));
const logit=p=>Math.log(Math.max(0.0001,Math.min(0.9999,p))/
 (1-Math.max(0.0001,Math.min(0.9999,p))));
const valid=r=>Number.isFinite(r?.estimatedProbability)&&
 r.estimatedProbability>0&&r.estimatedProbability<1&&typeof r?.win==="boolean";
function fitTrainingOnly(rows,{minimumTrainingDecisions=200,minimumTrainingGames=30,
 steps=600,learningRate=0.2,l2=0.05}={}){
 if(!Array.isArray(rows)||rows.some(x=>!valid(x)))throw Error("Invalid original training decisions");
 const uniqueGames=new Set(rows.map(r=>r.gameId)).size;
 if(rows.length<minimumTrainingDecisions||uniqueGames<minimumTrainingGames)
  return {status:"insufficient_original_prepolicy_training",trainingRows:rows.length,
   trainingGames:uniqueGames,parameters:null,modelPromoted:false};
 // The fixed regularizer shrinks toward the original forecast (a=0, b=1).
 let a=0,b=1;
 for(let it=0;it<steps;it++){
  let da=0,db=0;
  for(const r of rows){
   const x=logit(r.estimatedProbability),err=sigmoid(a+b*x)-Number(r.win);
   da+=err;db+=err*x;
  }
  a=Math.max(-3,Math.min(3,a-learningRate*(da/rows.length+l2*a)));
  b=Math.max(0,Math.min(3,b-learningRate*(db/rows.length+l2*(b-1))));
 }
 return {status:"research_only_training_fitted",trainingRows:rows.length,
  trainingGames:uniqueGames,parameters:{intercept:a,slope:b},
  formula:"monotone_logistic_private_challenger",modelPromoted:false,
  trainingOnly:true,requiresOriginalPrePolicyCutoff:true};
}
function evaluateChallenger(fit,rows){
 if(!Array.isArray(rows)||rows.some(x=>!valid(x)))throw Error("Invalid future heldout outcome rows");
 if(fit?.status!=="research_only_training_fitted"||!fit.parameters)
  return {status:"no_frozen_training_candidate",decisions:rows.length,rawBrier:null,
   challengerBrier:null,rawLogLoss:null,challengerLogLoss:null};
 if(!rows.length)return {status:"future_holdout_pending",decisions:0,rawBrier:null,
   challengerBrier:null,rawLogLoss:null,challengerLogLoss:null};
 const {intercept,slope}=fit.parameters;
 const rates=rows.map(r=>({original:r.estimatedProbability,
  challenger:sigmoid(intercept+slope*logit(r.estimatedProbability)),
  win:Number(r.win)}));
 const mean=fn=>rates.reduce((s,x)=>s+fn(x),0)/rates.length;
 const brier=k=>mean(x=>(x[k]-x.win)**2);
 const loss=k=>mean(x=>-(x.win?Math.log(x[k]):Math.log(1-x[k])));
 return {status:"prospective_holdout_diagnostics_only",decisions:rates.length,
  rawBrier:brier("original"),challengerBrier:brier("challenger"),
  rawLogLoss:loss("original"),challengerLogLoss:loss("challenger"),
  improvedOnThisSample:brier("challenger")<brier("original"),
  independentlyApproved:false,gameClusterUncertaintyVerified:false,
  modelPromoted:false};
}
module.exports={fitTrainingOnly,evaluateChallenger};
