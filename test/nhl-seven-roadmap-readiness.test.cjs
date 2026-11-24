"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {wilson,buildNhlSevenReadiness}=require("../src/nhl-seven-roadmap-readiness.cjs");
const at="2026-11-06T22:10:00Z";
function fixture(){
 return {now:at,
  board:{generatedAt:"2026-11-06T22:02:00Z",boardAsOfAt:"2026-11-06T22:01:55Z",
   provider:"prizepicksapi.com",sourceStatus:"fresh",
   totalOffers:200,completePagination:true,rows:Array.from({length:230},()=>({})),
   quotaUnit:"requests",creditsRemaining:null},
  grading:{individualPropAudit:{explicitProspective:{decided:20,alwaysLowerBaseline:0.55,
   alwaysHigherBaseline:0.45}}},
  ledger:{kind:"private_immutable_source_linked_nhl_selected_predictions",
   counts:{registered:35,correct:12,incorrect:8,push:2,pending:13}},
  shadow:{kind:"nhl_money_puck_dfo_prospective_shadow_scorecard",
   grade:{overall:{n:40,distinctGames:6,brier:{champion:.24,shadow:.235}}},
   modelDeploymentApproved:false},
  research:{lineups:{
   2:{picks:[{playerId:1,gameId:10},{playerId:2,gameId:11}]},
   5:{picks:[{playerId:1,gameId:10},{playerId:2,gameId:10},
     {playerId:3,gameId:11},{playerId:4,gameId:12},{playerId:5,gameId:13}]}
  },rankedProps:[
   {market:"saves",researchEligibility:"watchlist",
    roleEvidence:{reasons:["STARTING_GOALIE_NOT_CONFIRMED"]}},
   {market:"shotsOnGoal",researchEligibility:"research_only",
    roleEvidence:{reasons:["PREGAME_INJURY_STATUS_UNVERIFIED"]}}
  ]},
  platform:{kind:"nhl_cross_platform_line_shop_research_v1",
   generatedAt:"2026-11-06T22:02:00Z",underdogConnected:false,
   underdogPublicDerivedDisplayAuthorized:false,standardSideMatches:3},
  movement:{removalsVerified:false,summary:{increased:1,decreased:2,
   newOffers:4,notSeenUnverified:3}},
  site:{builtAt:"2026-11-06T22:05:00Z"},
  watchdog:{kind:"nhl_morning_board_watchdog_v1",six:{complete:true},
   nine:{complete:false},validSameDayDelta:false}};
}
test("read-only report cleanly separates seven tasks and never invents availability",()=>{
 const r=buildNhlSevenReadiness(fixture());
 assert.equal(r.kind,"private_nhl_seven_workstream_readiness_v1");
 assert.equal(r.operations.status,"fresh_independent_archive");
 assert.equal(r.operations.morningActualSixComplete,true);
 assert.equal(r.operations.morningActualNineComplete,false);
 assert.equal(r.operations.archivedLastKnownCreditBalance,null);
 assert.equal(r.model.status,"offline_candidate_comparison_only");
 assert.equal(r.model.alternateCandidatePromoted,false);
 assert.equal(r.grading.decided,20);
 assert.equal(r.grading.pending,13);
 assert.equal(r.grading.originalFantasyPlatformSettlementVerified,false);
 assert.equal(r.lineups.byPickCount[5].sameGamePairs,1);
 assert.equal(r.lineups.byPickCount[2].sameGamePairs,0);
 assert.equal(r.lineups.byPickCount[6].status,"unavailable");
 assert.equal(r.goalie.goalieNeedsReview,1);
 assert.equal(r.crossPlatform.status,"underdog_current_comparison_unavailable");
 assert.equal(r.crossPlatform.matchedStandardSides,0);
 assert.equal(r.lifecycle.originalAppRemovalsVerified,false);
 assert.equal(r.providerApiCallsByAudit,0);
 assert.equal(r.wagersPlaced,0);
});
test("contradictory outcome registry is never advertised as hit-rate evidence",()=>{
 const f=fixture();f.ledger.counts.correct=30;
 const r=buildNhlSevenReadiness(f);
 assert.equal(r.grading.status,"unverified_or_inconsistent_ledger");
 assert.equal(r.grading.decided,0);
 assert.equal(r.grading.observedStatDirectionRate,null);
 assert.equal(r.grading.wilson95,null);
});
test("small samples, archival staleness and unlicensed source all fail safely",()=>{
 const f=fixture();f.now="2026-11-07T04:00:00Z";f.ledger.counts={registered:3,correct:1,incorrect:1,push:0,pending:1};
 f.platform.underdogConnected=true;
 const r=buildNhlSevenReadiness(f);
 assert.equal(r.operations.status,"archived_not_current");
 assert.equal(r.grading.status,"awaiting_more_official_results");
 assert.equal(r.grading.observedStatDirectionRate,null);
 assert.equal(r.crossPlatform.status,"underdog_current_comparison_unavailable");
 assert.equal(r.website.status,"published_data_old_or_missing");
 assert.ok(r.alerts.includes("independent_nhl_source_not_fresh_for_live_display"));
});
test("even authorized source comparison never claims original platform authenticity",()=>{
 const f=fixture();f.platform.underdogConnected=true;
 f.platform.underdogPublicDerivedDisplayAuthorized=true;
 const r=buildNhlSevenReadiness(f);
 assert.equal(r.crossPlatform.status,"fresh_authorized_derived_comparisons");
 assert.equal(r.crossPlatform.matchedStandardSides,3);
 assert.equal(r.crossPlatform.authenticTierMultipliersVerified,false);
 assert.equal(r.operations.originalPrizePicksOfferAuthenticated,false);
});
test("Wilson descriptive interval bounds and same-game uncertainty",()=>{
 const ci=wilson(12,20);
 assert.ok(ci.lower<0.6&&ci.upper>0.6);
 assert.ok(ci.lower>=0&&ci.upper<=1);
 assert.equal(wilson(0,0),null);
 assert.equal(wilson(11,10),null);
 assert.match(ci.method,/unclustered/);
});
test("report is deterministic for fixed inputs without external requests",()=>{
 const fixture1=fixture();
 assert.deepEqual(buildNhlSevenReadiness(fixture1),buildNhlSevenReadiness(fixture1));
 assert.throws(()=>buildNhlSevenReadiness({now:"not-a-date"}),/Invalid/);
});
