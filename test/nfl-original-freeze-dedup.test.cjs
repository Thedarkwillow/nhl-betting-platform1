"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freeze}=require("../src/nfl-prospective-freeze.cjs");
const {firstOriginals,equivalent}=require("../src/nfl-original-freeze-identity.cjs");
const {evaluateOriginalFrozen}=require("../src/nfl-precommitted-grading.cjs");
const {diagnose}=require("../src/nfl-frozen-direction-diagnostic.cjs");
const source="2026-11-12T14:05:22Z",start="2026-11-12T23:15:00Z";
const first="2026-11-12T14:06:00Z",later="2026-11-12T14:07:00Z";
const preview={kind:"nfl_partner_past_only_boxscore_projection_preview_v1",
 sourceBoardAsOfAt:source,generatedAt:"2026-11-12T14:05:43Z",
 rows:[{sport:"NFL",player:"Example",playerSourceId:"P1",
 historicalPlayerId:"hist1",observedProviderGameId:"event1",sourceProjectionId:"offer1",
 season:2026,week:10,team:"WAS",opponent:"NYG",eventStartsAt:start,
 market:"passing_yards",tier:"Standard",side:"Lower",line:250.5,
 projection:220,baseline:230,priorGames:10,capturedAt:source}]};
const one=freeze(preview,{now:"2026-11-12T14:05:58Z"});
const two=structuredClone(one);
two.createdAt="2026-11-12T14:06:55Z";
two.selections[0].projectionRecordedAt="2026-11-12T14:06:50Z";
const snapshots=[{snapshot:one,firstCommittedAt:first,gitHistoryCount:1},
 {snapshot:two,firstCommittedAt:later,gitHistoryCount:1}];
const schedule=[{season:2026,week:10,gameday:"2026-11-12",
 game_id:"2026_10_WAS_NYG",home_team:"NYG",away_team:"WAS",
 home_score:21,away_score:24,result:-3}];
const weekly=[{season:2026,week:10,player_id:"hist1",recent_team:"WAS",
 passing_yards:249}];
const now="2026-11-13T16:00:00Z";
test("repeat morning original quote changes only projectionRecordedAt, not side or true first Git",()=>{
 assert.equal(equivalent(one.selections[0],two.selections[0]),true);
 const i=firstOriginals(snapshots);
 assert.equal(i.earliest.size,1);
 assert.equal(i.byCommit.size,2);
 assert.equal(i.exactRepeated,1);
 assert.equal(i.earliest.get(one.selections[0].id).firstCommittedAt,first);
 const g=evaluateOriginalFrozen(snapshots,weekly,schedule,{now});
 assert.equal(g.registered,1);
 assert.equal(g.decided,1);
 assert.equal(g.correct,1);
 assert.equal(g.firstGitExactDuplicateObservationsNotCounted,1);
 assert.equal(g.rows[0].firstGitCommittedAt,first);
});
test("never count repeat NFL source IDs as independent selections or change original results",()=>{
 const g=evaluateOriginalFrozen(snapshots,weekly,schedule,{now});
 const report={kind:"nfl_private_pregame_evidence_separated_outcome_audit_v1",
  nflverseFinalStatsNotPlatformSettlement:true,
  neverClaimNumericSideAsPreviouslyFrozenHigherLower:true,
  explicitFrozenDirections:g};
 const d=diagnose(report,snapshots);
 assert.equal(d.overall.registered,1);
 assert.equal(d.overall.decided,1);
 assert.equal(d.overall.correct,1);
 assert.equal(d.exactRepeatObservationsNotCounted,1);
 assert.equal(d.productionModelPromotionApproved,false);
});
test("changed duplicate market side projection and line are rejected rather than selecting the winner",()=>{
 for(const patch of [{line:250},{selectedSide:"Higher"},{historicalProjection:270},
   {market:"receiving_yards"},{historicalPlayerId:"someone-else"}]){
  const tampered=structuredClone(two);
  Object.assign(tampered.selections[0],patch);
  assert.throws(()=>firstOriginals([snapshots[0],{
   snapshot:tampered,firstCommittedAt:later,gitHistoryCount:1
  }]),/Conflicting later copy/);
 }
 assert.throws(()=>firstOriginals([{...snapshots[0],gitHistoryCount:2}]),/Unverified/);
});
test("not-final, missing weekly appearance and before-eight-hours remain pending",()=>{
 const s=structuredClone(schedule);
 const early=evaluateOriginalFrozen(snapshots,weekly,s,{now:"2026-11-13T01:00:00Z"});
 assert.equal(early.decided,0);
 assert.equal(evaluateOriginalFrozen(snapshots,[],s,{now}).pending,1);
 assert.equal(evaluateOriginalFrozen(snapshots,weekly,
  [{...s[0],home_score:null}],{now}).pending,1);
});

test("later same underlying NFL player/game/market/line but different morning source ID counts once",()=>{
 const source2="2026-11-12T17:05:22Z";
 const secondPreview={...preview,sourceBoardAsOfAt:source2,
  generatedAt:"2026-11-12T17:05:43Z",
  rows:preview.rows.map(r=>({...r,capturedAt:source2}))};
 const laterFreeze=freeze(secondPreview,{now:"2026-11-12T17:05:58Z"});
 assert.notEqual(laterFreeze.selections[0].id,one.selections[0].id);
 const inputs=[...snapshots,{snapshot:laterFreeze,firstCommittedAt:"2026-11-12T17:06:00Z",gitHistoryCount:1}];
 const report=evaluateOriginalFrozen(inputs,weekly,schedule,{now});
 assert.equal(report.registered,2);
 assert.equal(report.firstDistinctThresholdGrade.allSourceIds,2);
 assert.equal(report.firstDistinctThresholdGrade.earliestPerPlayerGameMarketAndLine.registered,1);
 assert.equal(report.firstDistinctThresholdGrade.earliestPerPlayerGameMarketAndLine.decided,1);
 assert.equal(report.firstDistinctThresholdGrade.earliestPerPlayerGameMarketAndLine.correct,1);
 assert.equal(report.firstDistinctThresholdGrade.earliestPerPlayerGameMarketAndLine.byGame["2026_10_WAS_NYG"].decided,1);
 assert.equal(report.firstDistinctThresholdGrade.earliestPerPlayerGameMarket.registered,1);
 assert.equal(report.firstDistinctThresholdGrade.excludedLaterObservationCounts.sameLineLaterObservation,1);
 const shiftedPreview={...secondPreview,
  rows:secondPreview.rows.map(r=>({...r,line:249.5}))};
 const shifted=freeze(shiftedPreview,{now:"2026-11-12T17:05:58Z"});
 const moved=evaluateOriginalFrozen([...snapshots,{snapshot:shifted,
  firstCommittedAt:"2026-11-12T17:06:00Z",gitHistoryCount:1}],
  weekly,schedule,{now});
 assert.equal(moved.firstDistinctThresholdGrade.earliestPerPlayerGameMarketAndLine.registered,2);
 assert.equal(moved.firstDistinctThresholdGrade.earliestPerPlayerGameMarket.registered,1);
 assert.equal(moved.firstDistinctThresholdGrade.releaseApproved,false);
});
