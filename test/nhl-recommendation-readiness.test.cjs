"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessNhlRecommendations}=require("../src/nhl-recommendation-readiness.cjs");
test("Current data cannot become an approved betting recommendation",()=>{
 const audit=assessNhlRecommendations({});
 assert.equal(audit.approvedBettingRecommendations,false);
 assert.equal(audit.readyForIndependentHumanReview,false);
 assert.ok(audit.blockers.length>=7);
});
test("Even fully claimed evidence needs an explicit separate release authorization",()=>{
 const audit=assessNhlRecommendations({
  validation:{kind:"private_nhl_prospective_probability_validation_v1",calibrated:true,releaseBlockers:[]},
  modelRelease:{modelPromotionAllowed:true,bettingEdgeEstablished:true},
  platform:{actualOriginalOfferAuthenticated:true,originalSettlementRulesReconciled:true},
  source:{completeSourceAtActualCapture:true,originalOfferStillAvailableNow:true,gameNotStarted:true},
  market:{specificMarketBacktested:true,historicalCoverageSufficient:true},
  role:{injuryAvailabilityVerified:true,isGoalie:true,startingGoalieConfirmed:true},
  pricing:{lineSpecificPayoutVerified:true,settlementAdjustedExpectedValueVerified:true,expectedValueAfterCosts:0.02},
  correlations:{lineupRestrictionsChecked:true,dependencyModelValidated:true}});
 assert.equal(audit.readyForIndependentHumanReview,true);
 assert.equal(audit.approvedBettingRecommendations,false);
 assert.equal(audit.submittedWagers,0);
});
