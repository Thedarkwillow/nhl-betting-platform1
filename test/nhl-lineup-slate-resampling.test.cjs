"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {review}=require("../src/nhl-lineup-slate-resampling.cjs");
function sample(n=12){
 return Array.from({length:n},(_,i)=>({
  slate:new Date(Date.UTC(2026,10,i+1)).toISOString().slice(0,10),
  modelGross:i%2?3:0,lowerGross:i%2?1:0,higherGross:i%2?0:2
 }));
}
test("first registered paired slate gross must not be interpreted as actual EV",()=>{
 const x=review(sample(),{replicates:300});
 assert.equal(x.pairedDistinctSlates,12);
 assert.ok(x.modelVsLowerSlateBootstrap95);
 assert.equal(x.modelVsLowerSlateBootstrap95.direction,"original_model_minus_always_lower");
 assert.equal(x.sampleGateMet,false);
 assert.equal(x.formatApproval,false);
 assert.equal(x.verifiedPayoutROI,null);
 assert.equal(x.modelBetterThanAlwaysLowerProspectivelyProven,false);
 assert.deepEqual(x,review(sample(),{replicates:300}));
});
test("incomplete or repeated paper slates cannot be relabeled as independent",()=>{
 assert.equal(review([]).status,"no_resolved_original_paper_slate");
 const repeated=sample();repeated[1].slate=repeated[0].slate;
 assert.equal(review(repeated).status,"duplicate_or_unverified_paired_slate");
 assert.equal(review(sample(4)).modelVsLowerSlateBootstrap95,null);
 assert.equal(review(sample(4)).sampleGateMet,false);
});
