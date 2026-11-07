"use strict";
const assert=require("node:assert/strict");
const status=require("../assets/research-status.js");
const at=Date.parse("2026-11-06T21:00:00Z");
const boardAt="2026-11-06T20:58:00Z";
const base={boardAt,researchAt:boardAt,researchFreshAtBuild:true,
 boardCoverage:{apiPaginationComplete:true},performance:{decidedProspectivePicks:12},
 prospectiveCohort:{cohortVerified:true,decided:12}};
const view=status.summarize(base,at);
assert.equal(view.cards.length,7);
assert.equal(view.recent,true);
assert.equal(view.verifiedCohort,true);
assert.ok(view.cards[0][1].includes("recent"));
assert.ok(view.cards[6][1].includes("Underdog unavailable"));
assert.equal(view.originalAppVerified,false);
for(const item of view.cards)assert.equal(item.length,3);
const quality={
 kind:"public_nhl_seven_workstream_brief_v1",sourceCapturedAt:boardAt,
 sourcePaginationComplete:true,sourceOfferedSideRows:2399,
 prospectiveDecided:12,descriptiveWilson95:{lower:.4,upper:.8},
 underdogStatus:"underdog_current_comparison_unavailable"};
const withQuality=status.summarize({...base,researchQuality:quality},at);
assert.ok(withQuality.cards[2][2].includes("40–80%"));
assert.ok(withQuality.cards[0][2].includes("2399"));
assert.equal(withQuality.cards[6][1],"Underdog unavailable");
const unavailable=status.summarize({...base,boardAt:"2026-11-05T21:00:00Z",
 researchAt:"2026-11-05T21:00:00Z",researchQuality:{
 ...quality,sourceCapturedAt:"2026-11-05T21:00:00Z",
 underdogStatus:"fresh_authorized_derived_comparisons"}},at);
assert.equal(unavailable.recent,false);
assert.equal(unavailable.cards[6][1],"Underdog unavailable");
const noEvidence=status.summarize({props:[],performance:{}},at);
assert.equal(noEvidence.verifiedCohort,false);
assert.equal(noEvidence.recent,false);
assert.equal(noEvidence.cards[3][1],"Research tools available");
console.log("Seven-area research quality view uses only sanitized, age-checked evidence");
