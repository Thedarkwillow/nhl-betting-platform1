"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {summarizeGraded}=require("../src/nhl-graded-summary.cjs");
test("confirmed wins, losses and pushes are separate",()=>{
 const a=summarizeGraded([
  {gameId:1,market:"goals",tier:"Standard",lean:"Higher",correct:true},
  {gameId:2,market:"goals",tier:"Standard",lean:"Lower",correct:false},
  {gameId:2,market:"goals",tier:"Goblin",lean:"Higher",correct:null}]);
 assert.equal(a.byMarket.goals.decisions,2);
 assert.equal(a.byMarket.goals.hitRate,.5);
 assert.equal(a.byTier.Goblin.pushes,1);
 assert.equal(a.distinctGames,2);
});