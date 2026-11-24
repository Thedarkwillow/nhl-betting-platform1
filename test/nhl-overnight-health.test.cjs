"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {auditOvernight}=require("../scripts/report-nhl-overnight-health.cjs");
const at="2026-11-03T09:15:00Z";
const basic={at,stats:{requestedDate:"2026-11-02",scheduledGames:4,completedGames:4,
 collectedGames:4,errors:[]},grading:{
 individualPropAudit:{kind:"nhl_frozen_individual_prop_preference_audit_v1",
  explicitProspective:{uniqueSelections:19,decided:12,correct:7,pending:7},
  legacyRetrospective:{uniqueSelections:348,decided:147,correct:71}},
 summary:{decisions:706}},
 research:{generatedAt:"2026-11-03T04:25:00Z"},
 approvedScorecard:{counts:{gradedRows:0,pendingRows:424}}};
test("nightly audit keeps original selected props and post-hoc reconstructed props separate",()=>{
 const r=auditOvernight(basic);
 assert.equal(r.officialGameStats.complete,true);
 assert.equal(r.archivedIndividualProps.precommittedObservedRate,7/12);
 assert.equal(r.archivedIndividualProps.historicalReconstructedDecided,147);
 assert.equal(r.archivedIndividualProps.sourceRawOfferSideDecisions,706);
 assert.equal(r.archivedIndividualProps.rawOfferSidesAreModelPicks,false);
 assert.equal(r.controls.newPaidApiRequests,0);
 assert.equal(r.controls.wagersPlaced,0);
});
test("unfinished official games never treated as settled losses",()=>{
 const r=auditOvernight({...basic,stats:{...basic.stats,completedGames:2,collectedGames:2}});
 assert.equal(r.officialGameStats.complete,false);
 assert.match(r.checklist[0],/catch-up/);
});
test("no explicit prospective selected props means null hit rate regardless of legacy performance",()=>{
 const r=auditOvernight({...basic,grading:{...basic.grading,
  individualPropAudit:{...basic.grading.individualPropAudit,
   explicitProspective:{uniqueSelections:0,decided:0,correct:0,pending:0}}}});
 assert.equal(r.archivedIndividualProps.precommittedObservedRate,null);
 assert.equal(r.archivedIndividualProps.historicalReconstructedNotProspective,true);
 assert.equal(r.controls.officialFantasyPlatformSettlementsVerified,false);
});

test("nightly health reports stale source, mismatched research lineage and last archived quota",()=>{
 const board={generatedAt:"2026-11-03T08:30:00Z",totalOffers:3100,normalizedRows:3112,
  completePagination:true,sourceStatus:"fresh",quotaUnit:"credits",creditsRemaining:70};
 const r=auditOvernight({...basic,board,research:{...basic.research,boardGeneratedAt:board.generatedAt}});
 assert.equal(r.source.boardCompletePagination,true);
 assert.equal(r.source.boardAgeMinutes,45);
 assert.equal(r.source.confirmedFreshBoardAtAudit,false);
 assert.equal(r.source.boardMatchesResearch,true);
 assert.equal(r.source.lastKnownCreditsRemaining,70);
 assert.equal(r.controls.newPaidApiRequests,0);
 const mismatch=auditOvernight({...basic,board,research:basic.research});
 assert.equal(mismatch.source.boardMatchesResearch,false);
});
test("new board health stays unverified with no pagination proof or credit headers",()=>{
 const r=auditOvernight({...basic,board:{generatedAt:at,sourceStatus:"fresh"}});
 assert.equal(r.source.boardCompletePagination,false);
 assert.equal(r.source.confirmedFreshBoardAtAudit,false);
 assert.equal(r.source.lastKnownCreditsRemaining,null);
 assert.equal(r.source.latestRunSuccessFromGitHubActionsVerified,false);
});
