"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {compareCandidates,estimates,MODELS}=require("../src/nhl-temporal-model-comparison.cjs");
const games=Array.from({length:8},(_,i)=>({gameId:2025020001+i,
  gameDate:"2026-01-"+String(i+1).padStart(2,"0"),
  shotsOnGoal:i%2?2:3}));
const row={playerId:1,gameId:2025020007,season:"2025-26",
  market:"shotsOnGoal",line:2.5,actual:games[6].shotsOnGoal,
  outcome:games[6].shotsOnGoal>2.5?"Higher":"Lower"};
test("candidate formula estimates only use prior available game observations",()=>{
 const e=estimates([1,2,3,4,5,6]);
 assert.equal(e["last-5"],4);assert.equal(e["prior-mean"],3.5);
 assert.ok(e["weighted-form-v1"]>e["prior-mean"]);
});
test("historical candidate comparison is strictly chronological and not deployed",()=>{
 const r=compareCandidates([row],{"1":games});
 assert.equal(r.eligibleArchivedLines,1);
 assert.equal(r.bySeason["2025-26"]["weighted-form-v1"].decisions,1);
 assert.equal(r.temporalHoldout.trainingSeason,"2025-26");
 assert.equal(r.temporalHoldout.holdoutSeason,"2026-27");
 assert.equal(r.temporalHoldout.eligibleToDeploy,false);
 assert.equal(r.calibrated,false);
 assert.equal(MODELS.length,6);
 assert.ok(Number.isFinite(r.bySeason["2025-26"]["stable-shrink-v2"].brierScore));
});
test("no outcome or no prior stats cannot leak into a model score",()=>{
 const missing=compareCandidates([{...row,actual:999}],{"1":games});
 assert.equal(missing.eligibleArchivedLines,0);
 assert.equal(missing.excluded.official_result_missing_or_mismatched,1);
});

test("archived-line challenger is past-only and cannot acquire platform-verified status",()=>{
 const r=compareCandidates([row],{"1":games});
 assert.equal(r.temporalHoldout.eligibleToDeploy,false);
 assert.equal(r.prospectivelyValidated,undefined);
 assert.equal(r.retrospective,true);
 const prediction=r.bySeason["2025-26"]["stable-shrink-v2"];
 assert.equal(prediction.decisions,1);
 assert.ok(prediction.hitRate>=0&&prediction.hitRate<=1);
});

test("sparse prior-season archive cannot silently crown a holdout winner",()=>{
 const r=compareCandidates([row],{"1":games});
 assert.equal(r.temporalHoldout.trainingSelectionGatePassed,false);
 assert.equal(r.temporalHoldout.chosenOnTrainingOnly,null);
 assert.equal(r.temporalHoldout.heldOutHitRate,null);
 assert.equal(r.temporalHoldout.outperformAlwaysLower,null);
 assert.equal(r.temporalHoldout.minimumDistinctTrainingGames,20);
 assert.equal(r.temporalHoldout.exploratoryTrainingLeader!==null,true);
});
test("reject archived outcome inconsistent with official NHL count, including push",()=>{
 const bad=compareCandidates([{...row,outcome:"Lower"}],{"1":games});
 assert.equal(bad.eligibleArchivedLines,0);
 assert.equal(bad.excluded.archived_outcome_conflicts_with_official_boxscore,1);
 const invalid=compareCandidates([{...row,line:-2}],{"1":games});
 assert.equal(invalid.excluded.invalid_original_line,1);
});

test("repeat closing quotes cannot inflate apparent independent model accuracy",()=>{
 const r=compareCandidates([row,{...row},{...row}],{"1":games});
 assert.equal(r.eligibleArchivedLines,1);
 assert.equal(r.excluded.duplicate_same_line_outcome_not_independent,2);
 assert.equal(r.correlatedQuoteObservationsDeduplicated,true);
});
test("known source observations after puck drop and unknown seasons are excluded",()=>{
 const after=compareCandidates([{...row,sourceObservedAt:"2026-01-07T02:00:00Z",
  gameStartAt:"2026-01-07T01:00:00Z"}],{"1":games});
 assert.equal(after.eligibleArchivedLines,0);
 assert.equal(after.excluded.quote_timing_invalid_or_not_pregame,1);
 const good=compareCandidates([{...row,sourceObservedAt:"2026-01-06T23:00:00Z",
  gameStartAt:"2026-01-07T01:00:00Z"}],{"1":games});
 assert.equal(good.eligibleArchivedLines,1);
 assert.equal(good.independentlyTimedOriginalPlatformQuotesVerified,false);
 const wrong=compareCandidates([{...row,season:"2027-28"}],{"1":games});
 assert.equal(wrong.excluded.unsupported_training_or_holdout_season,1);
});
