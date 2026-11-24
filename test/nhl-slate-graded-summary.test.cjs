"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit}=require("../src/nhl-slate-graded-summary.cjs");
const day="2026-11-19";
const games=[{id:101,gameDate:day,away:"MIN",home:"CGY",startTimeUTC:"2026-11-20T01:00:00Z"},
 {id:102,gameDate:day,away:"DAL",home:"VGK",startTimeUTC:"2026-11-20T03:00:00Z"}];
const stats={requestedDate:day,source:"NHL public API",sourceSchemaVersion:5,
 scheduledGames:2,completedGames:2,collectedGames:2,errors:[],
 players:games.flatMap(g=>Array.from({length:21},()=>({gameId:g.id})))};
const schedule={complete:true,games};
const base={id:"a",gameId:101,playerId:1,market:"assists",line:.5,
 tier:"Standard",selectedSide:"Higher",selectionStatus:"correct",officialResult:"Higher",
 officialGameDate:day,firstCaptureAt:"2026-11-19T14:00:00Z",
 firstResearchAt:"2026-11-19T14:00:10Z",
 firstGitCommittedAt:"2026-11-19T14:00:20Z",
 gameStartAt:"2026-11-20T01:00:00Z"};
const ledger=records=>({kind:"private_immutable_source_linked_nhl_selected_predictions",
 cohort:"explicit_original_Git_precommitted_standalone_model_directions",records});
test("All completed games including games with zero frozen props are reported",()=>{
 const r=audit({date:day,schedule,stats,ledger:ledger([base])});
 assert.equal(r.status,"all_games_official_final_original_frozen_prop_research_only");
 assert.equal(r.officialGamesTotal,2);
 assert.equal(r.games.length,2);
 assert.equal(r.all.correct,1);
 assert.equal(r.games[1].all.registered,0);
 assert.equal(r.tiers.Standard.hypotheticalAlwaysHigher,1);
 assert.equal(r.automaticBettingLineupsApproved,false);
});
test("Goblin and Demon raw wins are tracked separately with pushes and pending",()=>{
 const rows=[base,
 {...base,id:"b",gameId:102,gameStartAt:"2026-11-20T03:00:00Z",
  tier:"Goblin",selectedSide:"Higher",selectionStatus:"incorrect",officialResult:"Lower"},
 {...base,id:"c",gameId:102,gameStartAt:"2026-11-20T03:00:00Z",
  tier:"Demon",selectionStatus:"pending_official_player_stats",officialResult:null},
 {...base,id:"d",gameId:102,gameStartAt:"2026-11-20T03:00:00Z",
  tier:"Standard",selectionStatus:"push",officialResult:null}];
 const r=audit({date:day,schedule,stats,ledger:ledger(rows)});
 assert.equal(r.all.registered,4);assert.equal(r.all.decided,2);
 assert.equal(r.all.correct,1);assert.equal(r.tiers.Goblin.incorrect,1);
 assert.equal(r.tiers.Demon.pending,1);assert.equal(r.all.push,1);
});
test("Never grade from incomplete official games or postgame-first-Git records",()=>{
 assert.equal(audit({date:day,schedule,
  stats:{...stats,completedGames:1},ledger:ledger([base])}).status,"unavailable");
 assert.equal(audit({date:day,schedule,stats,
  ledger:ledger([{...base,firstGitCommittedAt:"2026-11-20T04:00:00Z"}])}).status,"unavailable");
});

test("NHL full-slate grading requires every scheduled game, not a fixed 12 or 14 count",()=>{
 const one=audit({date:day,schedule,stats,ledger:ledger([base])});
 assert.equal(one.status,"all_games_official_final_original_frozen_prop_research_only");
 assert.equal(one.officialGamesTotal,2);
 assert.equal(one.games.length,2);
 const incomplete={...stats,scheduledGames:3,completedGames:2,collectedGames:2};
 assert.equal(audit({date:day,schedule,stats:incomplete,ledger:ledger([base])}).status,"unavailable");
});
