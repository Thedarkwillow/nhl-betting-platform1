"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildOpponentContext,adjustProjection,canonical}=require("../src/nhl-opponent-context.cjs");
test("opponent context needs complete games and limits corrections",()=>{
 const players={};let id=1;
 for(let date=1;date<=6;date++){
  for(const [team,shots] of [["NYR",4],["BOS",1]]){
   for(let i=0;i<12;i++){
    players[id++]={games:[{gameId:date,gameDate:"2026-10-"+String(date).padStart(2,"0"),team,type:"skater",shotsOnGoal:shots,goals:0,assists:0,points:0,blockedShots:1}]};
   }
  }
 }
 const c=buildOpponentContext({players},{beforeDate:"2026-10-07"});
 assert.ok(c.factors.BOS.shotsOnGoal.multiplier>1);
 assert.ok(c.factors.NYR.shotsOnGoal.multiplier<1);
 assert.ok(c.factors.BOS.shotsOnGoal.multiplier<=1.1);
 assert.ok(adjustProjection(2,"shotsOnGoal","BOS",c).estimate>2);
 assert.equal(canonical("SJ"),"SJS");
});
test("no future games or injury assumptions are used",()=>{
 const context=buildOpponentContext({players:{"1":{games:[{gameId:1,gameDate:"2026-11-03",team:"NYR",type:"skater",shotsOnGoal:100}]}}},{beforeDate:"2026-11-03"});
 assert.equal(context.teams,0);
 assert.equal(context.injuryDataAvailable,false);
 assert.equal(adjustProjection(2,"shotsOnGoal","BOS",context).estimate,2);
});
