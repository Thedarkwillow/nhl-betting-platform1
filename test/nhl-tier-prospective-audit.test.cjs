"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit}=require("../src/nhl-tier-prospective-audit.cjs");
const base={id:"one",gameId:10,playerId:100,market:"shotsOnGoal",tier:"Standard",
  selectedSide:"Higher",estimatedProbability:.8,
  firstCaptureAt:"2026-11-09T10:00:00Z",
  firstResearchAt:"2026-11-09T10:00:10Z",
  firstGitCommittedAt:"2026-11-09T10:00:20Z",
  gameStartAt:"2026-11-09T22:00:00Z",
  officialGameDate:"2026-11-09",officialResult:"Lower",selectionStatus:"incorrect"};
const ledger=records=>({kind:"private_immutable_source_linked_nhl_selected_predictions",
  cohort:"explicit_original_Git_precommitted_standalone_model_directions",records});
const policy="2026-11-08T00:00:00Z";
test("Standard losing to hypothetical always-Lower is flagged without model approval",()=>{
  const result=audit(ledger([base]),policy);
  assert.equal(result.status,"strict_future_research_only");
  assert.equal(result.standardBelowBestSimpleBaselineOnThisSample,true);
  assert.equal(result.tiers.Standard.relativeToBestHypotheticalBaseline,-1);
  assert.equal(result.tiers.Standard.rawBrier,.64);
  assert.equal(result.calibrationApproved,false);
  assert.equal(result.payoutEVVerified,false);
});
test("Goblin and Demon have separate cohort and market diagnostics without fictional offered-side comparator",()=>{
  const records=[{...base,id:"g",tier:"Goblin",selectionStatus:"correct",officialResult:"Higher"},
    {...base,id:"d",tier:"Demon",market:"points",selectionStatus:"incorrect",officialResult:"Lower"}];
  const r=audit(ledger(records),policy);
  assert.equal(r.tiers.Goblin.decisions,1);
  assert.equal(r.tiers.Goblin.winCount,1);
  assert.equal(r.tiers.Goblin.byMarket.shotsOnGoal.rawCalibrationGap,-.2);
  assert.equal(r.tiers.Demon.byMarket.points.decisions,1);
  assert.equal(r.tiers.Goblin.hypotheticalAlwaysLowerHitRate,null);
});
test("Strict future policy excludes pre-policy, pushes, and pending",()=>{
 const records=[{...base,id:"old",firstCaptureAt:"2026-11-06T10:00:00Z",
   firstResearchAt:"2026-11-06T10:00:10Z",firstGitCommittedAt:"2026-11-06T10:00:20Z",
   gameStartAt:"2026-11-06T22:00:00Z",officialGameDate:"2026-11-06"},
   {...base,id:"push",selectionStatus:"push",officialResult:null},
   {...base,id:"pending",selectionStatus:"pending_official_player_stats",officialResult:null}];
 const r=audit(ledger(records),policy);
 assert.equal(r.tiers.Standard.decisions,0);
 assert.deepEqual(r.excluded,{pushes:1,pending:1,prePolicy:1});
});
test("Reject invalid duplicate or post-start claims",()=>{
 assert.equal(audit(ledger([base,{...base}]),policy).status,"unavailable");
 assert.equal(audit(ledger([{...base,firstGitCommittedAt:"2026-11-09T23:00:00Z"}]),policy).status,"unavailable");
});
