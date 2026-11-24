"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {projectPlayer}=require("../src/projections.cjs");
function player(shots){
  return {playerId:1,name:"Example",team:"BOS",type:"skater",
    games:shots.map((v,i)=>({gameId:i+1,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
      shotsOnGoal:v,goals:0,assists:0,points:0,blockedShots:1}))};
}
test("withholds projections with fewer than five games",()=>{
  const p=projectPlayer(player([1,2,3,4]));
  assert.equal(p.projections.shotsOnGoal.estimate,null);
  assert.equal(p.projections.shotsOnGoal.ready,false);
});
test("computes weighted projection with five games",()=>{
  const p=projectPlayer(player([1,2,3,4,5]));
  assert.equal(p.projections.shotsOnGoal.estimate,3);
  assert.equal(p.projections.shotsOnGoal.ready,true);
});
test("ignores missing stats",()=>{
  const p=projectPlayer(player([null,1,2,3,4]));
  assert.equal(p.projections.shotsOnGoal.ready,false);
});
