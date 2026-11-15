(function(root,factory){
 const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.PropEvidenceGate=api;
})(typeof globalThis==="object"?globalThis:this,function(){
 "use strict";
 const finite=p=>typeof p==="number"&&Number.isFinite(p)&&p>=0&&p<=1;
 function probability(data,p){
  const v=data?.probabilityValidation;
  if(v?.estimatedProbabilitiesValidated!==true||v?.bettingRecommendationsApproved!==true||!Array.isArray(v.approvedGroups)||!p||p.researchEligibility==="watchlist")return null;
  const approvals=v.approvedGroups.filter(g=>g.approved===true&&typeof g.policyId==="string"&&g.policyId.length>0&&g.policyId===p.calibrationPolicyId&&g.market===p.market&&g.tier===p.tier&&g.period===p.period&&g.side===p.lean);
  return approvals.length===1&&finite(p.calibratedProbability)?p.calibratedProbability:null;
 }
 function lineup(data){
  const v=data?.probabilityValidation;
  return v?.estimatedProbabilitiesValidated===true&&v?.bettingRecommendationsApproved===true&&v?.actualPlatformSettlementsVerified===true&&v?.payoutAdjustedEVVerified===true&&data?.researchQuality?.lineupJointProbabilityVerified===true&&v?.lineupRecommendationsApproved===true;
 }
 return {probability,lineup};
});
