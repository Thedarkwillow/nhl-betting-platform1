(function(root,factory){
 const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.PropEvidenceGate=api;
})(typeof globalThis==="object"?globalThis:this,function(){
 "use strict";
 const finite=p=>typeof p==="number"&&Number.isFinite(p)&&p>=0&&p<=1;
 function probability(data,p){
  const v=data?.probabilityValidation;
  if(v?.estimatedProbabilitiesValidated!==true||v?.bettingRecommendationsApproved!==true||!Array.isArray(v.approvedGroups)||!p||typeof p.period!=="string"||!p.period||typeof p.market!=="string"||!p.market||!["Standard","Goblin","Demon"].includes(p.tier)||!["Higher","Lower"].includes(p.lean)||p.researchEligibility==="watchlist")return null;
  const approvals=v.approvedGroups.filter(g=>g?.approved===true&&typeof g.policyId==="string"&&g.policyId.length>0&&g.policyId===p.calibrationPolicyId&&g.market===p.market&&g.tier===p.tier&&g.period===p.period&&g.side===p.lean);
  return approvals.length===1&&finite(p.calibratedProbability)?p.calibratedProbability:null;
 }
 function lineup(data){
  const v=data?.probabilityValidation;
  return v?.estimatedProbabilitiesValidated===true&&v?.bettingRecommendationsApproved===true&&v?.actualPlatformSettlementsVerified===true&&v?.payoutAdjustedEVVerified===true&&data?.researchQuality?.lineupJointProbabilityVerified===true&&v?.lineupRecommendationsApproved===true;
 }
 function historySummary(rows,line,n){
  if(!Array.isArray(rows)||typeof line!=="number"||!Number.isFinite(line)||!Number.isInteger(n)||n<1)return null;
  const a=rows.slice(-n);
  if(a.length<n||a.some(x=>!x||typeof x.value!=="number"||!Number.isFinite(x.value)))return null;
  const above=a.filter(x=>x.value>line).length,below=a.filter(x=>x.value<line).length;
  return {games:n,above,below,push:n-above-below,average:a.reduce((t,x)=>t+x.value,0)/n};
 }
 return {probability,lineup,historySummary};
});
