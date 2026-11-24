"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {auditProviderQuality,classifyBoard}=require("../src/nhl-provider-quality-manifest.cjs");
const now="2026-11-05T18:00:00Z",captured="2026-11-05T17:55:00Z",observed="2026-11-05T17:54:00Z";
const row={player:"Example",team:"BOS",market:"Shots On Goal",side:"Higher",
  tier:"Standard",line:2.5,capturedAt:captured,observedAt:observed,
  eventStartsAt:"2026-11-05T20:00:00Z"};
const primary={provider:"prizepicksapi.com",sourceStatus:"fresh",
 generatedAt:captured,completePagination:true,rows:[row],creditsRemaining:75};
const backup={provider:"The Odds API",sourceScope:"verified_selected_events",
 generatedAt:captured,completePagination:true,
 coverage:{scopeComplete:true},fullNhlBoardCoverageVerified:false,
 rows:[row],remainingProviderCredits:900};
const grades={individualPropAudit:{explicitProspective:
 {uniqueSelections:1,graded:0,decided:0}}};
test("primary and backup report independent scopes and do not certify original platform availability",()=>{
 const d=auditProviderQuality({primary,backup,grading:grades,
  officialStats:{requestedDate:"2026-11-04",scheduledGames:4,completedGames:4,collectedGames:4,errors:[]},now});
 assert.equal(d.providers.primary.freshForResearch,true);
 assert.equal(d.providers.backup.freshForResearch,true);
 assert.equal(d.providers.primary.fullLeagueBoardClaimSupported,true);
 assert.equal(d.providers.backup.fullLeagueBoardClaimSupported,false);
 assert.equal(d.providers.backup.scope,"at_most_two_verified_NHL_events");
 assert.equal(d.providers.backup.originalPlatformTierAuthenticated,false);
 assert.equal(d.prospective.prospectiveRateEstablished,false);
 assert.equal(d.providerApiRequests,0);
 assert.equal(d.paidApiCreditsSpentByAudit,0);
 assert.deepEqual(d.actionNeeded,["no_graded_precommitted_predictions_yet"]);
});
test("old or missing source data cannot masquerade as a live board",()=>{
 const d=auditProviderQuality({primary:{...primary,generatedAt:"2026-11-05T16:00:00Z"},
  backup:null,grading:grades,now});
 assert.equal(d.providers.primary.freshForResearch,false);
 assert.equal(d.providers.backup.configured,false);
 assert.equal(d.providers.backup.freshForResearch,false);
 assert.ok(d.actionNeeded.includes("primary_current_board_not_verified"));
 assert.ok(d.actionNeeded.includes("backup_current_event_subset_not_verified"));
 assert.equal(d.providers.primary.quotaIsLive,false);
});
test("source chronology issues are counted, not silently repaired",()=>{
 const bad={...primary,rows:[{...row,observedAt:"2026-11-05T17:56:00Z"},
   {...row,observedAt:"2026-11-05T16:00:00Z",
     capturedAt:"2026-11-05T17:55:00Z",eventStartsAt:"2026-11-05T15:00:00Z"}]};
 const d=classifyBoard(bad,"primary",now);
 assert.equal(d.freshForResearch,false);
 assert.equal(d.issues.invalidCaptureChronology,1);
 assert.equal(d.issues.notPregame,1);
 assert.equal(d.issues.staleObservedAtCapture,1);
});
test("completed outcomes don't prove fantasy settlements or verified betting edge",()=>{
 const d=auditProviderQuality({primary,backup,
  grading:{individualPropAudit:{explicitProspective:
    {uniqueSelections:10,graded:8,decided:7}}},now});
 assert.equal(d.prospective.decided,7);
 assert.equal(d.prospective.prospectiveRateEstablished,true);
 assert.equal(d.prospective.independentlyVerifiedOriginalPlatformSettlement,false);
 assert.equal(d.prospective.profitabilityVerified,false);
});
test("invalid audit clock fails closed",()=>{
 assert.throws(()=>auditProviderQuality({now:"what time is it"}),/Invalid/);
});
