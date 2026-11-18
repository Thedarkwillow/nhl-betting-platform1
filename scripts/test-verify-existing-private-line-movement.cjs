"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {verifyPayload}=require("./verify-existing-private-line-movement.cjs");
const counts={firstObserved:909,secondObserved:993,newSourceOfferIDs:132,
 noLongerSeenSourceIDsUnverified:48,existingLineChanged:1,
 existingTierChanged:0,existingSideAvailabilityChanged:4,
 existingStartChanged:0,unchanged:856};
const nfl={firstObserved:5131,secondObserved:5219,newSourceOfferIDs:382,
 noLongerSeenSourceIDsUnverified:294,existingLineChanged:273,
 existingTierChanged:0,existingSideAvailabilityChanged:33,
 existingStartChanged:0,unchanged:4537};
const pair={kind:"private_partner_actual_time_two_observations_v1",
 earlierCaptureAt:"2026-11-18T14:05:32.124Z",
 laterCaptureAt:"2026-11-18T17:05:41.121Z",
 exactSixToNineComparisonVerified:true,bySport:{NHL:counts,NFL:nfl}};
const before="outputs/manual-board-captures/2026-11-18/20261118T140532Z";
const after="outputs/manual-board-captures/2026-11-18/20261118T170541Z";
const context={baselineRel:before,currentRel:after,
 baselineDay:"2026-11-18",currentDay:"2026-11-18",
 baselineSlot:"06:00",currentSlot:"09:00"};
const report={...pair,baselineArchive:before,currentArchive:after,
 comparisonKind:"genuine_same_day_six_to_nine",
 sixToNineVerified:true,crossDayLineComparisonVerified:false,
 priorCapturePacificDay:"2026-11-18",currentCapturePacificDay:"2026-11-18",
 originalPlatformLineRemovalVerified:false,
 originalPlatformAvailabilityVerified:false,
 noFrozenDirectionsRewritten:true,
 sourceOfferDisappearanceDoesNotVerifyAppRemoval:true};
test("Nov 18 original 6:05 vs 9:05 source changes safely republish as certified source counts",()=>{
 const v=verifyPayload(report,pair,context);
 assert.deepEqual(v,{verified:true,reason:"certified_original_source_pair_and_counts_matched"});
 assert.equal(report.bySport.NHL.existingLineChanged,1);
 assert.equal(report.bySport.NFL.existingLineChanged,273);
});
test("wrong source id, ratio, changed count, unverifiable removal or false comparison fails closed",()=>{
 const invalid=[
  [{...report,baselineArchive:"output-other"},pair,context],
  [{...report,bySport:{...report.bySport,NHL:{...counts,existingLineChanged:2}}},pair,context],
  [{...report,originalPlatformAvailabilityVerified:true},pair,context],
  [{...report,noFrozenDirectionsRewritten:false},pair,context],
  [{...report,crossDayLineComparisonVerified:true},pair,context],
  [{...report,comparisonKind:"cross_day_previous_full_source"},pair,context],
  [report,{...pair,laterCaptureAt:"2026-11-18T17:00:00Z"},context],
  [report,pair,{...context,baselineDay:"2026-11-17"}]
 ];
 for(const [a,b,c] of invalid)
  assert.equal(verifyPayload(a,b,c).verified,false);
});
