"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {mass,candidate}=require("../src/nhl-recent-rate-forward-v1.cjs");
const nfl=require("../src/nfl-offense-defense-ablation.cjs");
const {evaluate}=require("../src/lineup-count-mass-calibration-lab.cjs");
test("integer threshold adds push mass and half-line tails remain coherent",()=>{
 const values=[0,1,2,3,4,5,6,7,8,9],a=mass(values,5,4),b=mass(values,5,4.5);
 assert.ok(a.push>0);assert.equal(b.push,0);assert.ok(Math.abs(a.higher+a.lower+a.push-1)<1e-9);
 assert.ok(mass(values,5,3.5).higher>=mass(values,5,6.5).higher);
 assert.equal(mass([1],1,1),null);
});
test("fixed NHL usage challenger does not require opponent for SOG but does for saves",()=>{
 const rows=Array.from({length:10},(_,i)=>({gameDate:"2026-10-"+String(i+1).padStart(2,"0"),gameId:i,playerId:1,type:"skater",timeOnIceSeconds:900,shotsOnGoal:2}));
 const c={byPlayer:new Map([[1,rows]]),team:{},league:{saves:[]}};
 assert.equal(candidate({market:"shotsOnGoal",playerId:1,line:2.5},c).estimate,2);
 assert.equal(candidate({market:"saves",playerId:1,line:24.5},c),null);
});
test("NFL matched context requires real offensive and defensive history",()=>{
 const rows=Array.from({length:10},()=>({passing_yards:200,attempts:25}));
 const teams=Array.from({length:30},(_,i)=>({team:i<5?"A":"C",opponent_team:i>=5&&i<10?"B":"D",passing_yards:i>=5&&i<10?250:200}));
 const p={market:"passing_yards",team:"A",opponent:"B"};
 const a=nfl.candidate(p,rows,teams);assert.equal(a.base,200);assert.equal(a.usageMean,200);assert.ok(a.context>a.base);
 assert.equal(nfl.candidate(p,rows,[]),null);
});
test("lineup tail stress provides descriptive all-hit diagnostics even in sparse samples",()=>{
 const a=evaluate([{slate:"2026-11-01",mass:[.25,.5,.25],hits:2,frozenAt:"2026-11-01T12:00:00Z",resolvedAt:"2026-11-02T09:00:00Z"}]);
 assert.equal(a.heldoutSlates,0);assert.equal(a.thresholdDiagnostics[2].observedAtLeastHits,1);assert.equal(a.thresholdDiagnostics[2].independentBrier,.5625);assert.equal(a.calibrationApproved,false);
});
