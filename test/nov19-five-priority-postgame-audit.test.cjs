"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {reviewNhl,reviewNfl,monitorFuture,futureGate,NONAPPEARANCE_EVIDENCE}=require("../src/nov19-five-priority-postgame-audit.cjs");
const DAY="2026-11-19",gameIds=Array.from({length:12},(_,i)=>2026020347+i);
const start="2026-11-20T03:00:00Z";
const schedule={complete:true,games:gameIds.map(id=>({id,gameDate:DAY,away:"AAA",home:"BBB",startTimeUTC:start}))};
const stats=()=>({requestedDate:DAY,source:"NHL public API",sourceSchemaVersion:5,
 scheduledGames:12,completedGames:12,collectedGames:12,errors:[],
 players:gameIds.flatMap(id=>Array.from({length:25},(_,i)=>({gameId:id,playerId:900000+i})) )});
const record=(id,gameId,playerId,tier,market,side,status,officialResult=null)=>({
 id,gameId,playerId,market,line:.5,tier,selectedSide:side,
 estimatedProbability:.62,selectionStatus:status,officialResult,
 officialGameDate:status==="correct"||status==="incorrect"?DAY:null,
 firstCaptureAt:"2026-11-19T14:00:00Z",
 firstResearchAt:"2026-11-19T14:00:10Z",
 firstGitCommittedAt:"2026-11-19T14:00:20Z",gameStartAt:start
});
const fixed=[
 record("a",2026020350,8481582,"Standard","shotsOnGoal","Lower","pending_official_player_stats"),
 record("b",2026020350,8481582,"Goblin","shotsOnGoal","Higher","pending_official_player_stats"),
 record("c",2026020352,8480829,"Demon","points","Higher","pending_official_player_stats"),
 record("d",2026020353,8484144,"Standard","points","Higher","pending_official_player_stats"),
 record("e",2026020348,900000,"Standard","assists","Lower","incorrect","Higher"),
 record("f",2026020356,900001,"Standard","shotsOnGoal","Higher","correct","Higher")
];
const ledger=records=>({kind:"private_immutable_source_linked_nhl_selected_predictions",
 cohort:"explicit_original_Git_precommitted_standalone_model_directions",records});
test("Exact four nonappearances classified without changing frozen grading denominators",()=>{
 const out=reviewNhl({ledger:ledger(fixed),stats:stats(),schedule});
 assert.equal(out.confirmedNonappearances,4);
 assert.equal(out.stillUnresolved,0);
 assert.equal(out.decidedSelections,2);
 assert.equal(out.preservedWins,1);
 assert.equal(out.preservedLosses,1);
 assert.equal(out.standard.byMarket.assists.losses,1);
 assert.equal(out.standard.worstGameFocus["2026020356"].wins,1);
 assert.equal(out.nonappearances.filter(x=>x.player==="Nicholas Robertson").length,2);
 assert.ok(out.nonappearances.every(x=>x.platformVoidOrRefundVerified===false));
});
test("Fail closed if a missing NHL player actually has an official game row",()=>{
 const s=stats();s.players.push({gameId:2026020353,playerId:8484144});
 assert.throws(()=>reviewNhl({ledger:ledger(fixed),stats:s,schedule}),/Cannot call/);
});
test("Fail closed on new unmatched pending selections or incomplete official final",()=>{
 const extra=record("g",2026020354,999999,"Standard","points","Higher","pending_official_player_stats");
 assert.throws(()=>reviewNhl({ledger:ledger([...fixed,extra]),stats:stats(),schedule}),/unsupported|DNP/);
 const s=stats();s.completedGames=11;
 assert.throws(()=>reviewNhl({ledger:ledger(fixed),stats:s,schedule}),/verified full/);
});
test("NFL result compares only original 271, ignores pushes and cannot authorize side flips",()=>{
 const rows=Array.from({length:271},(_,i)=>({
  id:"nfl-"+i,officialScheduleGameId:"2026_11_IND_HOU",market:i%2?"rushing_yards":"passing_yards",
  originalSelectedSide:i<140?"Higher":"Lower",
  offeredSide:i<140?"Higher":"Lower",
  status:i>=269?"push":"decided",
  selectedSideResult:i<145?"correct":i<269?"incorrect":null,
  actualSide:i<269?(i<145?(i<140?"Higher":"Lower"):(i<140?"Lower":"Higher")):"Push"
 }));
 const result=reviewNfl({kind:"nfl_original_frozen_direction_diagnostic_v1",
  originalDirectionsCanNeverBeRevised:true,rows});
 assert.equal(result.overall.decided,269);
 assert.equal(result.overall.wins,145);
 assert.equal(result.overall.losses,124);
 assert.equal(result.overall.push,2);
 assert.equal(result.productionSideFlipsAuthorized,false);
});
test("Future gate refuses Nov 19 tuning, retrospective frames, or missing settlement",()=>{
 const good={firstChallengerGitAt:"2026-11-21T01:00:00Z",
  originalGitVerified:true,allFirstGitBeforeGame:true,holdoutNeverUsedForTuning:true,
  nhlDistinctFutureSlates:20,nhlDistinctFutureGames:60,nhlStandardMarketDecisions:200,
  nflDistinctFutureGames:30,originalHigherAndLowerBothVerified:true,
  calibrationPastOnly:true,pairedClusterLower95VsBestBaseline:.01,
  authenticatedOriginalOfferMatch:true,settledPaperReturnVerified:true};
 assert.equal(futureGate(good).evidenceReadyForHumanReview,true);
 assert.equal(futureGate(good).automaticWagers,false);
 assert.equal(futureGate({...good,firstChallengerGitAt:"2026-11-19T14:00:00Z"}).evidenceReadyForHumanReview,false);
 assert.equal(futureGate({...good,settledPaperReturnVerified:false}).evidenceReadyForHumanReview,false);
 assert.equal(futureGate({...good,pairedClusterLower95VsBestBaseline:-.01}).evidenceReadyForHumanReview,false);
 assert.equal(NONAPPEARANCE_EVIDENCE.length,3);
});

test("Only newly first-Git-frozen future games advance prospective monitoring",()=>{
 const orig=record("future1",2026020399,900102,"Standard","shotsOnGoal","Lower","correct","Lower");
 const frozen={...orig,firstGitCommittedAt:"2026-11-21T01:00:00Z",
  gameStartAt:"2026-11-22T03:00:00Z"};
 const nflRows=[{firstGitCommittedAt:"2026-11-21T01:00:00Z",
  originalSelectedSide:"Lower",offeredSide:"Lower",
  status:"decided",officialScheduleGameId:"2026_12_TEAM_A_TEAM_B"}];
 const source={kind:"nfl_original_frozen_direction_diagnostic_v1",
  originalDirectionsCanNeverBeRevised:true,rows:nflRows};
 const a=monitorFuture({ledger:ledger([...fixed,frozen]),nflDiagnostic:source});
 assert.equal(a.nhl.registered,1);assert.equal(a.nhl.decided,1);
 assert.equal(a.nhl.distinctFinalGames,1);
 assert.equal(a.nhl.distinctPacificSlateDates,1);
 assert.equal(a.nfl.registered,1);assert.equal(a.nfl.decided,1);
 assert.equal(a.releaseApproved,false);
 const b=monitorFuture({ledger:ledger(fixed),nflDiagnostic:source});
 assert.equal(b.nhl.decided,0);
 assert.throws(()=>monitorFuture({ledger:ledger([...fixed,{...frozen,gameStartAt:"2026-11-20T01:00:00Z"}]),
  nflDiagnostic:source}),/Invalid future NHL/);
});
