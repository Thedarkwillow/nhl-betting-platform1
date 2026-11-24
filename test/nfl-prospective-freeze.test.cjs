"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freeze,verifyCommitChronology}=require("../src/nfl-prospective-freeze.cjs");
const asOf="2026-11-08T23:42:26Z",now="2026-11-08T23:42:29Z",kickoff="2026-11-09T01:20:00Z";
const sample={
 kind:"nfl_partner_past_only_boxscore_projection_preview_v1",
 sourceBoardAsOfAt:asOf,generatedAt:now,
 rows:[{sport:"NFL",player:"Example Player",playerSourceId:"p1",
 historicalPlayerId:"hist1",observedProviderGameId:"game1",sourceProjectionId:"offer1",
 season:2026,week:9,team:"ABC",opponent:"XYZ",eventStartsAt:kickoff,
 market:"passing_yards",tier:"Standard",side:"Lower",line:249.5,
 projection:222,baseline:230,priorGames:11,capturedAt:asOf}]
};
test("NFL research selections are explicitly frozen from original supported offered Standard direction",()=>{
 const s=freeze(sample,{now:"2026-11-08T23:42:32Z"});
 assert.equal(s.selections.length,1);
 assert.equal(s.selections[0].selectedSide,"Lower");
 assert.equal(s.selections[0].line,249.5);
 assert.equal(s.selections[0].historicalProjection,222);
 assert.equal(s.selections[0].authenticatedPrizePicksAppQuote,false);
 assert.equal(s.selections[0].probability,null);
 assert.equal(s.calibratedProbabilities,false);
 assert.equal(s.status,"pending_independent_first_git_commit_proof");
});
test("never infer an unavailable direction, a special tier, an unsupported market, or a late offer",()=>{
 const notOffered=freeze({...sample,rows:[{...sample.rows[0],side:"Higher"}]},{now});
 assert.equal(notOffered.selections.length,0);
 assert.equal(notOffered.exclusions.projected_direction_not_offered,1);
 const special=freeze({...sample,rows:[{...sample.rows[0],tier:"Demon"}]},{now});
 assert.equal(special.selections.length,0);
 const latest={...sample,sourceBoardAsOfAt:"2026-11-09T01:10:00Z",rows:[{...sample.rows[0],capturedAt:"2026-11-09T01:10:00Z"}]};
 const late=freeze(latest,{now:"2026-11-09T01:10:01Z",minimumLeadMinutes:15});
 assert.equal(late.selections.length,0);
 const unsupported=freeze({...sample,rows:[{...sample.rows[0],market:"first_down_of_game"}]},{now});
 assert.equal(unsupported.selections.length,0);
});
test("stale partner preview never becomes new pregame research and no duplicate sides",()=>{
 assert.throws(()=>freeze(sample,{now:"2026-11-09T00:30:00Z"}),/stale/);
 const two=freeze({...sample,rows:[sample.rows[0],{...sample.rows[0]}]},{now});
 assert.equal(two.selections.length,1);
});
test("first Git commit requires source, original forecast and 15-minute kickoff lead",()=>{
 const s=freeze(sample,{now:"2026-11-08T23:42:32.600Z"});
 assert.equal(verifyCommitChronology(s,"2026-11-08T23:42:33Z").verified,true);
 assert.equal(verifyCommitChronology(s,"2026-11-08T23:42:31Z").verified,false);
 assert.equal(verifyCommitChronology(s,"2026-11-09T01:10:00Z").verified,false);
});
