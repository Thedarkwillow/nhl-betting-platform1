"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sourceReadiness,frozenSelectionReadiness}=require("../src/nhl-prospective-freeze-readiness.cjs");
const {POLICY}=require("../src/nhl-frozen-individual-props.cjs");
const now="2026-11-04T17:25:00Z",start="2026-11-05T00:30:00Z";
const schedule={complete:true,games:Array.from({length:600},(_,i)=>({
 id:2026020001+i,home:"BUF",away:"OTT",
 startTimeUTC:i===0?start:"2026-01-01T00:00:00Z"
}))};
const history={players:{"1":{}},sourceFiles:["2026-11-02"]},
 projections={model:"weighted-form-v1",players:{"1":{playerId:1}}};
test("safe, no-credit source readiness requires NHL schedule and historical projections",()=>{
 const r=sourceReadiness({schedule,history,projections,now});
 const filenameVersion=sourceReadiness({schedule,history:{...history,sourceFiles:["2026-11-02.json"]},projections,now});
 assert.equal(filenameVersion.ready,true);
 assert.equal(filenameVersion.lastOfficialStatsDate,"2026-11-02");
 assert.equal(r.ready,true);
 assert.equal(r.upcomingOfficialGames,1);
 assert.equal(r.providerRequests,0);
 assert.equal(r.originalSelectionPolicy,POLICY);
});
test("missing official fixtures or stale history blocks provider request",()=>{
 const d=sourceReadiness({schedule:{...schedule,complete:false},
  history:{...history,sourceFiles:["2026-10-12"]},projections,now});
 assert.equal(d.ready,false);
 assert.ok(d.reasons.includes("historical_official_stats_unavailable_or_too_old"));
 assert.ok(d.reasons.includes("official_season_schedule_not_complete"));
});
const pick={gameId:2026020001,gameStartAt:start,playerId:1,team:"BUF",opponent:"OTT",
 market:"shotsOnGoal",line:2.5,tier:"Standard",lean:"Higher",probability:.63,
 capturedAt:"2026-11-04T17:24:00Z",eventStartsAt:start};
const research={generatedAt:"2026-11-04T17:25:00Z",boardCoverageComplete:true,boardFresh:true,
 individualPropSelectionPolicy:POLICY,individualPropSelections:[pick]};
test("explicit selection must exist before puck drop and still requires Git archival proof",()=>{
 const r=frozenSelectionReadiness({research,now:"2026-11-04T17:27:00Z"});
 assert.equal(r.ready,true);
 assert.equal(r.selectedIndividualProps,1);
 assert.equal(r.requiresGitCommitBeforeEveryPuckDrop,true);
 assert.equal(r.precommitmentEstablishedByLocalFileAlone,false);
});
test("empty selection, changed policy, wrong game or too-late selections fail closed",()=>{
 const blank=frozenSelectionReadiness({research:{...research,individualPropSelections:[]},now});
 assert.equal(blank.ready,false);
 assert.ok(blank.reasons.includes("no_eligible_explicit_individual_model_preferences"));
 const tooLate=frozenSelectionReadiness({research:{...research,
  individualPropSelections:[{...pick,eventStartsAt:"2026-11-04T17:30:00Z",
   gameStartAt:"2026-11-04T17:30:00Z"}]},now});
 assert.equal(tooLate.ready,false);
 const invalid=frozenSelectionReadiness({research:{...research,individualPropSelectionPolicy:"uncommitted-later-rule",
  individualPropSelections:[{...pick,gameId:null}]},now});
 assert.equal(invalid.ready,false);
 assert.ok(invalid.reasons.includes("selection_policy_not_precommitted"));
 assert.ok(invalid.reasons.includes("invalid_or_too_late_selection_identity_or_chronology"));
});

test("verified limited NHL event subset can freeze honest prospective picks without full board claim",()=>{
 const scoped={...research,boardCoverageComplete:false,sourceScope:"verified_selected_events",
  captureScopeComplete:true};
 const ready=frozenSelectionReadiness({research:scoped,now:"2026-11-04T17:27:00Z"});
 assert.equal(ready.ready,true);
 const incomplete=frozenSelectionReadiness({research:{...scoped,captureScopeComplete:false},now:"2026-11-04T17:27:00Z"});
 assert.equal(incomplete.ready,false);
 assert.ok(incomplete.reasons.includes("source_board_incomplete_or_stale"));
 const invented=frozenSelectionReadiness({research:{...scoped,sourceScope:"unknown"},
  now:"2026-11-04T17:27:00Z"});
 assert.equal(invented.ready,false);
});
