"use strict";
// Fixed prospective trial design. A new freeze begins a new trial, not a
// retrospective relabeling of old outcomes. No automatic model promotion.
const {bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const TRIAL=Object.freeze({id:"hierarchical-and-period-v1",start:"2026-11-15T08:00:00Z",end:"2027-02-01T08:00:00Z",minGames:30,minDates:10,minRows:100,alpha:.05,primaryMetric:"strict_hit_brier",candidateFamilies:["nhl_hierarchical_calibration","nfl_hierarchical_calibration","nhl_period_distribution","original_pair_dependence"],selectionRule:"fixed-before-trial; no early stopping or post-hoc winner promotion"});
// Holm on *valid predeclared* group p-values only; missing primary tests
// count as p=1, preserving the planned family. Not computed from Brier
// differences by pretending rows are independent.
function holm(planned,tests){
 if(!Array.isArray(planned)||!planned.length||new Set(planned).size!==planned.length)return null;
 const a=planned.map(id=>{const v=tests?.[id];return {id,p:Number.isFinite(v)&&v>=0&&v<=1?v:1};}).sort((x,y)=>x.p-y.p||x.id.localeCompare(y.id));
 let stop=false,prev=0;return Object.fromEntries(a.map((x,i)=>{const p=Math.min(1,Math.max(prev,x.p*(a.length-i)));prev=p;if(p>TRIAL.alpha)stop=true;return [x.id,{adjustedP:p,passes:!stop}];}));
}
function releaseReview({now,matchedRows=0,distinctGames=0,distinctDates=0,clusterP=null,trialId,evidenceAuthenticated=false,independentReview=false}={}){
 const complete=Number.isFinite(Date.parse(now))&&Date.parse(now)>=Date.parse(TRIAL.end);
 return {trial:TRIAL,trialComplete:complete,enoughEvidence:matchedRows>=TRIAL.minRows&&distinctGames>=TRIAL.minGames&&distinctDates>=TRIAL.minDates,trialIdMatches:trialId===TRIAL.id,validClusterTestProvided:Number.isFinite(clusterP)&&clusterP>=0&&clusterP<=1,independentReview,evidenceAuthenticated,productionPromotionApproved:false};
}
module.exports={TRIAL,holm,releaseReview};
