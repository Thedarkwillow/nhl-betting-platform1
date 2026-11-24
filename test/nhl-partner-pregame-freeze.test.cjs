"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildPartnerPregameFreeze}=require("../src/nhl-partner-pregame-freeze.cjs");
const now="2026-11-08T16:00:00Z";
const board={provider:"partner-api.prizepicks.com",snapshotMode:"direct_live_board",
 sourceStatus:"fresh",completePagination:true,sourceScope:"full_provider_board",
 originalModelSelectionGitFrozen:false,boardAsOfAt:"2026-11-08T15:58:00Z"};
const projection={builtAt:"2026-11-08T14:00:00Z",players:{1:{}}};
const history={players:{}};
const schedule={complete:true,games:[
 {id:2026020001,away:"BOS",home:"FLA",startTimeUTC:"2026-11-08T21:00:00Z"}]};
function build(){
 const row={player:"Test",playerId:1,team:"BOS",opponent:"FLA",matchup:"BOS vs FLA | 2026-11-08T21:00:00Z",
  market:"shotsOnGoal",line:2.5,tier:"Standard",lean:"Higher",projection:3.2,probability:0.7,
  probabilities:{higher:0.7,lower:0.3},observations:10,model:"weighted-form-v1",
  capturedAt:"2026-11-08T15:58:00Z",observedAt:"2026-11-07T12:00:00Z",
  verifiedThirdPartyBoardMembershipAt:"2026-11-08T15:58:00Z",
  eventStartsAt:"2026-11-08T21:00:00Z",researchEligibility:"research_only",roleEvidence:{eligibleForResearchLineup:true}};
 return {boardFresh:true,projectionsFresh:true,source:"partner-api.prizepicks.com",
  generatedAt:now,boardCoverageComplete:true,rankedProps:[row],lineups:{}};
}
test("Freeze only exact official future identity and original selection",()=>{
 const x=buildPartnerPregameFreeze(board,projection,schedule,history,now,build);
 assert.equal(x.snapshot.individualPropSelections.length,1);
 assert.equal(x.snapshot.individualPropSelections[0].gameId,2026020001);
 assert.equal(x.snapshot.simplePregameBenchmarks.originalStandardSelections,1);
 assert.equal(x.snapshot.standardTripleChallenger.originalStandardSelectionCount,1);
 assert.equal(x.snapshot.standardTripleChallenger.rows[0].calibrated,false);
 assert.equal(x.snapshot.officialProspectiveGradingEligible,false);
});
test("Stale board, missing game and started event refuse freeze",()=>{
 assert.throws(()=>buildPartnerPregameFreeze({...board,boardAsOfAt:"2026-11-08T15:00:00Z"},
  projection,schedule,history,now,build));
 assert.throws(()=>buildPartnerPregameFreeze(board,projection,{complete:true,games:[]},
  history,now,build));
 assert.throws(()=>buildPartnerPregameFreeze(board,projection,
  {complete:true,games:[{...schedule.games[0],startTimeUTC:"2026-11-08T16:02:00Z"}]},
  history,now,build));
});
