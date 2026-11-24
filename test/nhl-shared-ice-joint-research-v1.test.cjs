"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{mass,independent,study}=require("../src/same-game-frozen-copula-research-v1.cjs"),{goalie,shared}=require("../src/nhl-shared-ice-goalie-shadow-v2.cjs");
test("correlated mass is normalized and preserves marginal probabilities",()=>{
 const donors=Array.from({length:100},(_,i)=>({gameId:"g"+i,legs:[{p:.5,y:i%2},{p:.5,y:i%2}]}));
 const x=mass([.6,.7],donors);assert.ok(Math.abs(x.mass.reduce((a,b)=>a+b,0)-1)<1e-9);assert.ok(x.maximumMarginalError<=.01+1e-9);assert.equal(mass([.5,.5],donors.slice(0,29)),null);
 assert.deepEqual(independent([.5,.5]),[.25,.5,.25]);assert.equal(study({firstObserved:[]}).bySize[6].heldout,0);
});
test("goalie quality excludes target-day stats",()=>{
 const a=Array.from({length:120},(_,i)=>({playerId:i<10?1:2,gameId:i,type:"goalie",team:"A",gameDate:"2026-10-01",gameState:"OFF",shotsAgainst:30,saves:i<10?28:27,timeOnIceSeconds:3600}));
 const h={players:{1:{games:a}}},x=goalie(h,1,"A","2026-11-01");assert.ok(x.goalAllowedFactor<1);
 assert.deepEqual(goalie({players:{1:{games:[...a,{...a[0],gameDate:"2026-11-01",gameId:999,saves:0}]}}},1,"A","2026-11-01"),x);
});
test("uncommitted shift archives cannot contribute shared ice",()=>assert.equal(shared({players:{}},[{shiftsVerified:true,goalCreditsVerified:true,gameDate:"2026-10-01",collectedAt:"2026-10-02T00:00:00Z"}],{playerId:1,team:"A"},[2],"2026-11-01","2026-11-01T12:00:00Z"),null));
