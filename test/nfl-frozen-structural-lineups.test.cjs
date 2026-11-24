"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildStructuralLineups}=require("../src/nfl-frozen-structural-lineups.cjs");
const source="2026-11-09T17:22:17Z",created="2026-11-09T17:26:51Z",
 commit="2026-11-09T17:26:51Z",now="2026-11-09T18:00:00Z";
const pick=(id,game,player)=>({id,sourceGameId:game,historicalPlayerId:player,
 market:"receiving_yards",line:48.5,tier:"Standard",selectedSide:"Higher",
 offeredSide:"Higher",autoPickEligible:false,probability:null,
 authenticatedPrizePicksAppQuote:false,eventStartsAt:"2026-11-10T01:15:00Z"});
const snapshot={kind:"nfl_independent_partner_standard_directional_original_research_v1",
 sourceBoardAsOfAt:source,createdAt:created,
 selections:[pick("a","G1","P1"),pick("b","G1","P2"),pick("c","G2","P3"),
  pick("d","G3","P4"),pick("e","G4","P5")]};
test("only original Git precommitted full-game Standard directions yield structural candidates",()=>{
 const r=buildStructuralLineups(snapshot,{firstCommittedAt:commit,now});
 assert.equal(r.originalCommitChronologyVerified,true);
 assert.equal(r.eligibleResearchSelections,5);
 assert.equal(r.eligibleDistinctGameCount,4);
 assert.equal(r.bySize[4].selectionIds.length,4);
 assert.equal(r.bySize[5].status,"insufficient_independent_games");
 assert.equal(r.bySize[6].candidates,0);
 assert.equal(r.expectedValue,null);
 assert.equal(r.calibratedJointHitProbability,null);
 assert.equal(r.autoWagersPlaced,0);
});
test("no late or invalid, unoffered direction and no false EV or platform eligibility",()=>{
 const bad={...snapshot,selections:[pick("a","G1","P1"),{...pick("b","G2","P2"),offeredSide:"Lower"},
  {...pick("c","G3","P3"),eventStartsAt:"2026-11-09T18:05:00Z"}]};
 const r=buildStructuralLineups(bad,{firstCommittedAt:commit,now});
 assert.equal(r.eligibleResearchSelections,1);
 assert.equal(r.bySize[2].candidates,0);
 assert.equal(r.bySize[2].platformRestrictionsVerified,false);
 const unproved=buildStructuralLineups(snapshot,{firstCommittedAt:"2026-11-10T01:14:30Z",now});
 assert.equal(unproved.originalCommitChronologyVerified,false);
 assert.equal(unproved.bySize[2].candidates,0);
});
