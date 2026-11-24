"use strict";
const test=require("node:test"),a=require("node:assert/strict"),{referenceBounds,stressReferenceScenario}=require("../src/lineup-reference-payout-bounds.cjs");
test("Power exact all-hit bounds and Flex 3-6 only",()=>{const x=referenceBounds([.8,.7],"power");a.ok(Math.abs(x.referenceGrossLower-1.5)<1e-9);a.ok(Math.abs(x.referenceGrossUpper-2.1)<1e-9);a.equal(referenceBounds([.8,.7],"flex"),null);for(let n=2;n<=6;n++)for(const f of n===2?["power"]:["power","flex"]){const y=referenceBounds(Array.from({length:n},(_,i)=>.55+i*.05),f);a.ok(y.referenceGrossLower<=y.independentReferenceGross+1e-9);a.ok(y.independentReferenceGross<=y.referenceGrossUpper+1e-9);a.equal(y.verifiedExpectedValue,null);}});

test("all nine legal standard Power/Flex research formats disclose 5/10pp downside without asserted payouts",()=>{
 for(const f of ["power","flex"])for(let n=f==="power"?2:3;n<=6;n++){
  const ps=Array.from({length:n},(_,i)=>.8-.025*i),q=stressReferenceScenario(ps,f);
  a.equal(q.cases.length,3);a.equal(q.size,n);
  a.equal(q.automaticRecommendationEligible,false);
  a.equal(q.verifiedExpectedValue,null);
  a.equal(q.originalPlatformEligibilityUnverified,true);
  a.ok(q.cases[0].independentGrossReference>=q.cases[1].independentGrossReference-1e-9);
  a.ok(q.cases[1].independentGrossReference>=q.cases[2].independentGrossReference-1e-9);
  for(const z of q.cases)a.ok(z.arbitraryDependenceGrossLower<=z.independentGrossReference+1e-9&&z.independentGrossReference<=z.arbitraryDependenceGrossUpper+1e-9);
 }
 a.equal(stressReferenceScenario([.8,.8],"flex"),null);
 a.equal(stressReferenceScenario([.8,.8],"power",{haircuts:[.05,.05,.10]}),null);
});
