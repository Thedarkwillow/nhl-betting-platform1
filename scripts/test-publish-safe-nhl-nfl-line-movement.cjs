"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),
 {build}=require("./publish-safe-nhl-nfl-line-movement.cjs");
const group={firstObserved:3,secondObserved:4,newSourceOfferIDs:2,
 noLongerSeenSourceIDsUnverified:1,existingLineChanged:1,
 existingTierChanged:0,existingSideAvailabilityChanged:1,
 existingStartChanged:0,unchanged:1};
const base={kind:"private_partner_actual_time_two_observations_v1",
 earlierCaptureAt:"2026-11-09T17:22:17Z",
 laterCaptureAt:"2026-11-10T14:20:19Z",
 comparisonKind:"cross_day_previous_full_source",
 sourceOfferDisappearanceDoesNotVerifyAppRemoval:true,
 originalPlatformLineRemovalVerified:false,
 originalPlatformAvailabilityVerified:false,
 noFrozenDirectionsRewritten:true,
 sixToNineVerified:false,exactSixToNineComparisonVerified:false,
 crossDayLineComparisonVerified:true,
 priorCapturePacificDay:"2026-11-09",currentCapturePacificDay:"2026-11-10",
 bySport:{NHL:group,NFL:group,privatePlayerRecord:{player:"private-do-not-publish"}}};
test("counts-only across-days source report hides all original private player/offer data",()=>{
 const x=build(base,{generatedAt:"2026-11-10T14:26:00Z"});
 assert.equal(x.sports.NHL.existingLineChanged,1);
 assert.equal(x.sports.NFL.existingSideAvailabilityChanged,1);
 assert.equal(x.genuineSixToNineComparison,false);
 assert.equal(x.crossDayComparison,true);
 assert.equal(x.privateOfferIDsPublished,0);
 assert.equal(x.rawLinesPublished,0);
 assert.equal(JSON.stringify(x).includes("private-do-not-publish"),false);
 assert.equal(JSON.stringify(x).includes("privatePlayerRecord"),false);
 assert.equal(x.previouslyFrozenDirectionsRetained,true);
 assert.equal(x.removedOfferNotProvenByMissingSourceID,true);
});
test("real same day six to nine requires truthfully authenticated original source scope",()=>{
 const a={...base,earlierCaptureAt:"2026-11-10T14:20:19Z",
  laterCaptureAt:"2026-11-10T17:25:19Z",
  comparisonKind:"genuine_same_day_six_to_nine",
  sixToNineVerified:true,exactSixToNineComparisonVerified:true,
  crossDayLineComparisonVerified:false,priorCapturePacificDay:"2026-11-10"};
 const x=build(a);
 assert.equal(x.genuineSixToNineComparison,true);
 assert.equal(x.crossDayComparison,false);
 assert.throws(()=>build({...a,priorCapturePacificDay:"2026-11-09"}),/authenticity/);
 assert.throws(()=>build({...base,comparisonKind:"genuine_same_day_six_to_nine"}),/authenticity/);
});
test("spoofed results, over-counted lines, unverified platform removal fail closed",()=>{
 const cases=[
  {...base,originalPlatformLineRemovalVerified:true},
  {...base,sourceOfferDisappearanceDoesNotVerifyAppRemoval:false},
  {...base,bySport:{...base.bySport,NHL:{...group,newSourceOfferIDs:99}}},
  {...base,bySport:{...base.bySport,NFL:{...group,unchanged:-1}}},
  {...base,earlierCaptureAt:base.laterCaptureAt}
 ];
 for(const bad of cases)assert.throws(()=>build(bad));
});
