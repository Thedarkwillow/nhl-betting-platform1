"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validate,publicBrief}=require("../src/nhl-prospective-validation.cjs");
const base={id:"a",gameId:1,playerId:100,selectedSide:"Higher",tier:"Standard",
 estimatedProbability:0.7,firstCaptureAt:"2026-11-08T15:00:00Z",
 firstResearchAt:"2026-11-08T15:00:20Z",firstGitCommittedAt:"2026-11-08T15:00:25Z",
 gameStartAt:"2026-11-08T21:00:00Z",officialGameDate:"2026-11-08",
 officialResult:"Higher",selectionStatus:"correct"};
const ledger=(records)=>({kind:"private_immutable_source_linked_nhl_selected_predictions",
 cohort:"explicit_original_Git_precommitted_standalone_model_directions",
 records,counts:{registered:records.length,
 correct:records.filter(x=>x.selectionStatus==="correct").length,
 incorrect:records.filter(x=>x.selectionStatus==="incorrect").length,
 push:records.filter(x=>x.selectionStatus==="push").length,
 pending:records.filter(x=>x.selectionStatus==="pending_official_player_stats").length}});
test("Honest original selected Standard accuracy and no automatic recommendation",()=>{
 const o=validate(ledger([base]),{policyFirstCommittedAt:"2026-11-08T16:00:00Z"});
 assert.equal(o.allStandardDescriptive.decided,1);
 assert.ok(Math.abs(o.allStandardDescriptive.brier-0.09)<1e-9);
 assert.equal(o.futureHoldout.decided,0);
 assert.equal(o.calibrated,false);
 assert.equal(o.productionRecommendationsApproved,false);
 assert.equal(publicBrief(o).bettingRecommendationsApproved,false);
});
test("Future holdout must have first Git commit after locked policy",()=>{
 const old={...base,id:"old",gameId:2,firstGitCommittedAt:"2026-11-07T15:00:25Z",
  firstResearchAt:"2026-11-07T15:00:20Z",firstCaptureAt:"2026-11-07T15:00:00Z",
  gameStartAt:"2026-11-07T21:00:00Z",officialGameDate:"2026-11-07"};
 const later={...base,id:"future",gameId:3,firstGitCommittedAt:"2026-11-09T15:00:25Z",
  firstResearchAt:"2026-11-09T15:00:20Z",firstCaptureAt:"2026-11-09T15:00:00Z",
  gameStartAt:"2026-11-09T21:00:00Z",officialGameDate:"2026-11-09"};
 const o=validate(ledger([old,later]),{policyFirstCommittedAt:"2026-11-08T17:00:00Z"});
 assert.equal(o.training.decided,1);
 assert.equal(o.futureHoldout.decided,1);
 assert.equal(o.futureHoldout.distinctGames,1);
 assert.equal(o.productionRecommendationsApproved,false);
});
test("Refuse tampered result, duplicate, postgame and mismatched counts",()=>{
 const time="2026-11-08T22:00:00Z";
 for(const bad of [
  ledger([base,{...base}]),
  ledger([{...base,firstGitCommittedAt:time}]),
  ledger([{...base,selectionStatus:"incorrect"}]),
  {...ledger([base]),counts:{registered:2,correct:1,incorrect:0,push:0,pending:0}}
 ])assert.equal(validate(bad).status,"unavailable");
});
test("Push and pending must not inflate decided denominators",()=>{
 const p=ledger([base,{...base,id:"p",gameId:2,selectionStatus:"push",officialResult:null},
 {...base,id:"n",gameId:3,selectionStatus:"pending_official_player_stats",officialResult:null}]);
 const o=validate(p,{policyFirstCommittedAt:"2026-11-08T16:00:00Z"});
 assert.equal(o.counts.registered,3);
 assert.equal(o.allStandardDescriptive.decided,1);
 assert.equal(o.excluded.push,1);
 assert.equal(o.excluded.pending,1);
});
