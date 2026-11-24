"use strict";
const t=require("node:test"),a=require("node:assert/strict"),{correction,evaluate}=require("../src/nhl-standard-market-residual-v1.cjs");
t("correction requires distinct prior games and shrinks small samples",()=>{const r=Array.from({length:30},(_,i)=>({market:"shotsOnGoal",gameId:i,p:.6,y:0}));a.equal(correction(r.slice(0,29),"shotsOnGoal",.6),null);a.ok(correction(r,"shotsOnGoal",.6)<.6);a.equal(correction(r,"points",.6),null);});
t("empty history does not approve or fabricate outcomes",()=>{const x=evaluate([],{players:{}});a.equal(x.inputRows,0);a.equal(x.modelPromoted,false);a.deepEqual(x.groups,{});});
