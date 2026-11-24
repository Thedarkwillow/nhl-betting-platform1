"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freeze}=require("../src/nfl-prospective-freeze.cjs");
const {evaluateOriginalFrozen,evaluatePriorNumericPreviews}=require("../src/nfl-precommitted-grading.cjs");
const source="2026-11-08T23:42:26Z",generated="2026-11-08T23:42:29Z",
 firstGit="2026-11-08T23:42:31Z",start="2026-11-09T01:20:00Z";
const preview={kind:"nfl_partner_past_only_boxscore_projection_preview_v1",
 sourceBoardAsOfAt:source,generatedAt:generated,
 rows:[{sport:"NFL",player:"Example",playerSourceId:"u1",historicalPlayerId:"p1",
  observedProviderGameId:"event1",sourceProjectionId:"o1",
  season:2026,week:9,team:"AAA",opponent:"BBB",eventStartsAt:start,
  market:"passing_yards",tier:"Standard",side:"Lower",line:250.5,
  projection:220,baseline:230,priorGames:10,capturedAt:source}]};
const schedule=[{season:2026,week:9,gameday:"2026-11-08",game_id:"2026_09_BBB_AAA",
  home_team:"BBB",away_team:"AAA",home_score:24,away_score:13,result:11}];
const weekly=[{season:2026,week:9,player_id:"p1",recent_team:"AAA",passing_yards:199}];
test("real pregame numeric forecast is gradeable without claiming a frozen side",()=>{
 const a=evaluatePriorNumericPreviews([{path:"f",firstCommittedAt:firstGit,
  gitHistoryCount:1,preview}],weekly,schedule,{now:"2026-11-09T13:00:00Z"});
 assert.equal(a.registered,1);assert.equal(a.decided,1);
 assert.equal(a.meanAbsoluteError,21);
 assert.equal(a.retrospectiveDerivedSideCorrect,1);
 assert.equal(a.retrospectivelyDerivedSideNotOriginalFrozen,true);
});
test("official final verification and player identity block invented outcomes",()=>{
 const data=[{path:"f",firstCommittedAt:firstGit,gitHistoryCount:1,preview}];
 const early=evaluatePriorNumericPreviews(data,weekly,schedule,{now:"2026-11-09T03:00:00Z"});
 assert.equal(early.decided,0);
 const missing=evaluatePriorNumericPreviews(data,[],schedule,{now:"2026-11-09T13:00:00Z"});
 assert.equal(missing.decided,0);
 const noScore=evaluatePriorNumericPreviews(data,weekly,[{...schedule[0],result:null}],
 {now:"2026-11-09T13:00:00Z"});
 assert.equal(noScore.decided,0);
});
test("genuinely first-Git-frozen Standard selection grades separately from derived diagnostics",()=>{
 const snapshot=freeze(preview,{now:"2026-11-08T23:42:30Z"});
 const inputs=[{snapshot,firstCommittedAt:firstGit,gitHistoryCount:1}];
 const a=evaluateOriginalFrozen(inputs,weekly,schedule,{now:"2026-11-09T13:00:00Z"});
 assert.equal(a.registered,1);assert.equal(a.decided,1);
 assert.equal(a.correct,1);assert.equal(a.alwaysHigherOnExactSameSelectedLines,0);
 const rewritten=evaluateOriginalFrozen([{snapshot,firstCommittedAt:firstGit,
  gitHistoryCount:2}],weekly,schedule,{now:"2026-11-09T13:00:00Z"});
 assert.equal(rewritten.registered,0);
 assert.equal(rewritten.decided,0);
});
