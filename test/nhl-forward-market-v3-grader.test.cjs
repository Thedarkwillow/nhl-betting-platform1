"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {evaluateForwardMarketV3}=require("../src/nhl-forward-market-v3-grader.cjs");
const start="2026-11-08T01:00:00Z",asOf="2026-11-07T17:00:00Z";
const official={complete:true,games:[{id:2026020300,startTimeUTC:start,
 home:"BOS",away:"NYR"}]};
const history={players:{"11":{games:[{gameId:2026020300,gameDate:"2026-11-07",
 shotsOnGoal:3,points:1}]}}};
const quote={playerId:11,gameId:2026020300,eventStartsAt:start,gameStartAt:start,
 sourceCapturedAt:"2026-11-07T16:59:00Z",sourceObservedAt:"2026-11-07T16:58:00Z",
 originalModel:"weighted-form-v1",market:"shotsOnGoal",line:2.5,
 tier:"Standard",selectedSide:"Higher",originalHigher:0.6,
 marketTrainedV3:{model:"nhl-market-trained-v3-shadow",policyId:"2024-only-test",
 higher:0.7}};
const frame=(rows,commit="2026-11-07T17:01:00Z")=>({snapshot:{
 kind:"nhl_live_distribution_shadow_unconfirmed_git_archive",generatedAt:asOf,
 rows},firstCommittedAt:commit,gitHistoryCount:1});
test("grades the same original pregame line using official game and player IDs",()=>{
 const result=evaluateForwardMarketV3([frame([quote])],history,official);
 assert.equal(result.summary.decisions,1);
 assert.equal(result.summary.championBrier,0.16);
 assert.equal(result.summary.shadowBrier,0.09);
 assert.equal(result.summary.championMinusShadowBrier,0.07);
 assert.equal(result.byMarket.shotsOnGoal.decisions,1);
 assert.equal(result.summary.gameCluster95,null);
 assert.equal(result.shadowAutoPromotionAllowed,false);
 assert.equal(result.originalPlatformSettlementVerified,false);
 assert.equal(result.summary.modelSelectedPickHitRate,null);
});
test("offered Higher and Lower are not independent, repeated frozen lines cannot multiply performance",()=>{
 const reverse={...quote,selectedSide:"Lower",originalHigher:0.6};
 const next=frame([quote,reverse]);
 const result=evaluateForwardMarketV3([next,next],history,official);
 assert.equal(result.summary.decisions,1);
 assert.equal(result.excluded.duplicate_exact_line_not_independent,3);
 assert.equal(result.rawOfferedSidesNotIndependentSelections,true);
});
test("reject tampered Git history, after-start commits and fake official game time",()=>{
 const changed={...frame([quote]),gitHistoryCount:2};
 const late=frame([quote],"2026-11-08T01:01:00Z");
 const mismatch=evaluateForwardMarketV3([frame([quote])],history,
  {complete:true,games:[{id:2026020300,startTimeUTC:"2026-11-08T06:00:00Z"}]});
 assert.equal(evaluateForwardMarketV3([changed,late],history,official).summary.decisions,0);
 assert.equal(mismatch.summary.decisions,0);
 assert.equal(mismatch.excluded.unverified_pregame_game_source_or_probability,1);
});
test("unavailable final stats stay pending and exact integer pushes never score as losses",()=>{
 const pending=evaluateForwardMarketV3([frame([quote])],{players:{}},official);
 assert.equal(pending.pending,1);
 assert.equal(pending.summary.decisions,0);
 const pushed=evaluateForwardMarketV3([frame([{...quote,line:3}])],history,official);
 assert.equal(pushed.pushes,1);
 assert.equal(pushed.summary.decisions,0);
});
test("no new v3 field in earlier frozen archives means zero apparent improvements",()=>{
 const r=evaluateForwardMarketV3([frame([{...quote,marketTrainedV3:null}])],history,official);
 assert.equal(r.summary.decisions,0);
 assert.equal(r.summary.championMinusShadowBrier,null);
 assert.equal(r.rowsReviewed,0);
});
