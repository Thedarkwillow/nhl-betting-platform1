"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {backtestContext}=require("../src/nhl-context-backtest.cjs");
test("chronological evaluation does not declare success with small samples",()=>{
 const players={};
 for(let i=0;i<12;i++){
  players[i]={type:"skater",name:"Player "+i,team:i<6?"NYR":"BOS",games:Array.from({length:8},(_,j)=>({
   gameId:j+1,gameDate:"2026-10-"+String(j+1).padStart(2,"0"),playerId:i,team:i<6?"NYR":"BOS",
   type:"skater",shotsOnGoal:j%3,goals:0,assists:0,points:0,blockedShots:0}))};
 }
 const report=backtestContext({players});
 assert.ok(report.byMarket.shotsOnGoal.samples>0);
 assert.equal(report.byMarket.shotsOnGoal.adjustmentPassed,false);
 assert.ok(report.claim.includes("not a prop-line hit rate"));
});
