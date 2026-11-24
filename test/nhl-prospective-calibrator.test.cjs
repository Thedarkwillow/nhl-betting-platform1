"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fitTrainingOnly,evaluateChallenger}=require("../src/nhl-prospective-calibrator.cjs");
test("Training set below strict threshold never fits",()=>{
 assert.equal(fitTrainingOnly([{estimatedProbability:.6,win:true,gameId:1}]).parameters,null);
});
test("Monotone bounded fit uses only supplied historical training labels",()=>{
 const training=Array.from({length:240},(_,i)=>({estimatedProbability:.55+(i%4)*.1,
  win:i%4>1,gameId:1+Math.floor(i/4)}));
 const fit=fitTrainingOnly(training);
 assert.equal(fit.trainingOnly,true);
 assert.ok(fit.parameters.slope>=0);
 const future=[{estimatedProbability:.6,win:false},{estimatedProbability:.8,win:true}];
 const result=evaluateChallenger(fit,future);
 assert.equal(result.decisions,2);
 assert.ok(Number.isFinite(result.challengerBrier));
 assert.equal(result.independentlyApproved,false);
});
test("A fitted challenger never fabricates missing future game outcomes",()=>{
 const fit=fitTrainingOnly(Array.from({length:240},(_,i)=>({
  estimatedProbability:.6,win:i%3===0,gameId:Math.floor(i/4)+1})));
 assert.equal(evaluateChallenger(fit,[]).status,"future_holdout_pending");
 assert.throws(()=>evaluateChallenger(fit,[{estimatedProbability:.6}]));
});
