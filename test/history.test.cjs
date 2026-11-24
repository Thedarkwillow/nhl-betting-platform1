"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {buildHistory} = require("../src/history.cjs");

function game(id,date,shots) {
  return {gameId:id,gameDate:date,playerId:42,name:"Example",
    team:"BOS",type:"skater",goals:0,assists:1,points:1,
    shotsOnGoal:shots,blockedShots:0};
}
test("deduplicates and sorts player games",()=>{
  const a=game(1,"2026-10-01",1),b=game(2,"2026-10-02",5);
  const h=buildHistory([{players:[b,a,a],errors:[]}]);
  assert.equal(h.gamePlayerRecords,2);
  assert.equal(h.players["42"].rolling.last5.shotsOnGoal,3);
  assert.equal(h.players["42"].games[0].gameId,1);
});
test("rejects incomplete reports",()=>{
  assert.throws(()=>buildHistory([{players:[],errors:[{gameId:1}]}]));
});
test("does not count missing stats as zero",()=>{
  const h=buildHistory([{players:[game(1,"2026-10-01",null)]}]);
  assert.equal(h.players["42"].rolling.all.shotsOnGoal,null);
});
