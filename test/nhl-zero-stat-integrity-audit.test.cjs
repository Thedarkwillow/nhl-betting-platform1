"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit}=require("../src/nhl-zero-stat-integrity-audit.cjs");
function game({missing=false,partial=false,duplicate=false,invalid=false}={}){
 const history={players:{}};
 for(let team=0;team<2;team++)for(let n=0;n<(partial&&team===1?17:18);n++){
  const id=100+team*20+n;
  const x={gameId:202602001,playerId:id,gameDate:"2026-02-02",
   gameState:"FINAL",type:"skater",team:team===0?"AAA":"BBB",
   timeOnIceSeconds:950,position:n<6?"D":"C",
   shotsOnGoal:n===0?0:2,goals:0,assists:0,points:0,
   blockedShots:0,hits:1,shotAttempts:n===0?0:3};
  if(missing&&team===1&&n===0)delete x.shotsOnGoal;
  if(invalid&&team===1&&n===0)x.shotAttempts=-1;
  history.players[id]={games:[x]};
 }
 if(duplicate)history.players[100].games.push({...history.players[100].games[0]});
 return history;
}
test("official full-game zero-shot and zero-block appearances stay in the denominator",()=>{
 const a=audit(game());
 assert.equal(a.completeGames,1);
 assert.equal(a.completeSkaterAppearances,36);
 assert.equal(a.byMarket.shotsOnGoal.zeroStatAppearances,2);
 assert.equal(a.byMarket.blockedShots.zeroStatAppearances,36);
 assert.ok(a.byMarket.shotsOnGoal.allNonzeroMean>a.byMarket.shotsOnGoal.allAppearanceMean);
 assert.equal(a.fullRosterZeroStatPopulationVerified,true);
 assert.equal(a.modelPromoted,false);
});
test("partial event-only populations cannot be reinterpreted as active zero-stat skaters",()=>{
 const a=audit(game({partial:true}));
 assert.equal(a.completeGames,0);
 assert.equal(a.incompleteGames,1);
 assert.equal(a.byMarket.shotsOnGoal.zeroStatAppearances,0);
 assert.equal(a.fullRosterZeroStatPopulationVerified,false);
});
test("missing or invalid official fields are never implicitly zero",()=>{
 const a=audit(game({missing:true}));
 assert.equal(a.byMarket.shotsOnGoal.missingOrInvalid,1);
 assert.equal(a.byMarket.shotsOnGoal.zeroStatAppearances,1);
 assert.equal(a.noMissingStatConvertedToZero,true);
 assert.equal(a.fullRosterZeroStatPopulationVerified,false);
});
test("duplicate player games and contradictory shot attempts invalidate audit",()=>{
 assert.equal(audit(game({duplicate:true})).fullRosterZeroStatPopulationVerified,false);
 const a=audit(game({invalid:true}));
 assert.equal(a.invalidAttemptRows,1);
 assert.equal(a.fullRosterZeroStatPopulationVerified,false);
});
test("invalid empty history is never turned into verification",()=>{
 assert.equal(audit({players:{}}).fullRosterZeroStatPopulationVerified,false);
 assert.throws(()=>audit(null),/required/);
});


test("private-only exception inventory identifies genuine scorer contradictions",()=>{
 const {privateExceptions}=require("../src/nhl-zero-stat-integrity-audit.cjs");
 const h=game();
 h.players[100].games[0].goals=3;
 h.players[100].games[0].points=3;
 const d=privateExceptions(h);
 assert.equal(d.countsByReason.goals_exceed_official_shots,1);
 assert.equal(d.exceptionCount,1);
 assert.equal(d.exceptions[0].playerId,100);
 assert.equal(d.sourceCorrectionVerified,false);
 assert.equal(d.publishOriginalRows,false);
 assert.equal(d.modelPromoted,false);
 const partial=privateExceptions(game({partial:true}));
 assert.equal(partial.countsByReason.incomplete_or_duplicate_roster,1);
 assert.equal(partial.exceptions[0].teamAppearances.BBB,17);
});
