"use strict";const {test}=require("node:test"),assert=require("node:assert/strict");
const {assessment,freeze}=require("../src/nfl-directional-v2-prospective.cjs");
const now="2026-11-20T12:00:00Z",start="2026-11-22T18:00:00Z";
const p={id:"nfl-1",tier:"Standard",offeredSide:"Higher",selectedSide:"Higher",autoPickEligible:false,probability:null,
 sourceGameId:"g",historicalPlayerId:"00-999",team:"GB",opponent:"CHI",season:2026,week:11,
 historicalProjection:120,line:100,last5Baseline:130,priorRecordedGames:12,eventStartsAt:start};
test("abstain even with huge projection when healthy/current active roster not proven",()=>{
 assert.equal(assessment(p,{now}).status,"directional_candidate_research_only");
 const injuries={kind:"nfl_first_party_published_game_status_v1",capturedAt:now,rows:[{gsisId:"00-999",team:"GB",season:2026,week:11,modifiedAt:now,status:"questionable"}]};
 assert.equal(assessment(p,{now,injuries}).reason,"injury_or_active_status_unverified");
 assert.equal(assessment({...p,priorRecordedGames:3},{now}).reason,"insufficient_prior_player_games");
 assert.equal(assessment({...p,historicalProjection:105},{now}).reason,"direction_margin_too_small");
 assert.equal(assessment({...p,last5Baseline:95},{now}).reason,"last_five_baseline_disagrees_with_selected_direction");
});
test("future-only v2 never converts a frozen side into a different side",()=>{
 const s={kind:"nfl_independent_partner_standard_directional_original_research_v1",sourceBoardAsOfAt:"2026-11-20T11:55:00Z",createdAt:"2026-11-20T11:56:00Z",selections:[p]};
 const v=freeze(s,{firstGitCommittedAt:"2026-11-20T11:56:01Z",now});
 assert.equal(v.originalSidesUnchanged,true);assert.equal(v.rows[0].originalSide,"Higher");
 assert.equal(v.rows[0].status,"directional_candidate_research_only");assert.equal(v.summary.directionalCandidates,1);
 assert.equal(v.approvedForProduction,false);
 assert.throws(()=>freeze(s,{firstGitCommittedAt:"2026-11-20T11:56:01Z",now:"2026-11-26T12:00:00Z"}));
});

test("new NFL market-specific selective shadow is frozen only after its separate first Git policy",()=>{
 const valid={...p,market:"receiving_yards",line:40.5,historicalProjection:58,
  last5Baseline:55,priorRecordedGames:20,sourceObservedAt:"2026-11-20T11:55:00Z"};
 const original={kind:"nfl_independent_partner_standard_directional_original_research_v1",
  sourceBoardAsOfAt:"2026-11-20T11:55:00Z",createdAt:"2026-11-20T11:56:00Z",selections:[valid]};
 const earlier=freeze(original,{firstGitCommittedAt:"2026-11-20T11:56:01Z",now,
  selectivePolicyFirstGitAt:"2026-11-20T11:54:00Z"});
 assert.equal(earlier.rows[0].originalSide,"Higher");
 assert.equal(earlier.rows[0].selectiveFuture.status,"selective_future_research_candidate_only");
 assert.equal(earlier.rows[0].selectiveFuture.bettingEligible,false);
 assert.equal(earlier.calibratedProbabilities,false);
 const after=freeze(original,{firstGitCommittedAt:"2026-11-20T11:56:01Z",now,
  selectivePolicyFirstGitAt:"2026-11-21T00:00:00Z"});
 assert.equal(after.rows[0].selectiveFuture,undefined);
 assert.equal(after.selectiveMarketPolicy,null);
});
