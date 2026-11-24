"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),h=require("../src/nhl-goal-credit-shared-ice-v1.cjs"),n=require("../src/nfl-expected-receiving-components-v2.cjs"),s=require("../src/priority-game-scenarios-v1.cjs");
test("NHL component model rejects future rows and missing credits",()=>{
 const past=Array.from({length:12},(_,i)=>({gameId:i,gameDate:"2026-10-01",team:"A",goals:1,assists:1,points:2,shotsOnGoal:4,timeOnIceSeconds:1200}));
 const a=h.features(past,[],1,"A","2026-11-01");
 assert.equal(a.split,null);assert.ok(a.shootingRate<.25);
 assert.deepEqual(h.features([...past,{...past[0],gameDate:"2026-11-01",points:99}],[],1,"A","2026-11-01"),a);
 assert.equal(h.extract({id:1,gameState:"OFF"},{id:2,gameState:"OFF"},[]),null);
});
test("Expected target projection ignores current week",()=>{
 const a=Array.from({length:5},(_,i)=>({id:"x",team:"A",y:2025,w:i+1,cpTargets:5,expectedCatches:3,expectedYards:40}));
 const r=n.features(a,"x","A",2025,6,5);assert.equal(r.projection,40);assert.equal(r.routeParticipationVerified,false);
 assert.deepEqual(n.features([...a,{...a[0],w:6,expectedYards:1000}],"x","A",2025,6,5),r);
});
test("Paired game scenario preserves source bounds and does not assert calibration",()=>{
 const a=Array(8).fill({regulationScrimmagePlays:60,dropbacks:30,designedPlays:60,attemptsPerDropback:.9});
 const r=s.qbScenarios(a,a,1,0);assert.equal(r.mean,27);assert.equal(r.calibrated,false);assert.equal(s.qbScenarios(a,a,2,0),null);
});
