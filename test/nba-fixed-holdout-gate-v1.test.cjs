"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assess}=require("../src/nba-fixed-holdout-gate-v1.cjs");
function rows(hold=false,bad=false){
 return Array.from({length:120},(_,i)=>{const y=i%2;return {id:(hold?"h":"d")+i,market:"player_points",playerId:"other",gameId:(hold?"hg":"dg")+i,date:(hold?"2026-02-":"2026-01-")+String(1+i%15).padStart(2,"0"),y,old:y?.58:.42,marketP:y?.6:.4,minutesP:(y!==Number(bad))?.8:.2,roleP:hold?(y?.9:.1):.5};});
}
test("holdout can reject but not swap a development-locked challenger",()=>{
 const a=assess([...rows(),...rows(true,true)]).markets.player_points;
 assert.equal(a.lockedCandidate,"minutesP");assert.equal(a.status,"locked_candidate_rejected");
 const b=assess([...rows(),...rows(true)]).markets.player_points;
 assert.equal(b.lockedCandidate,"minutesP");assert.equal(b.status,"retrospective_candidate_supported");assert.equal(b.productionApproval,false);
});
test("missing and tiny holdouts remain blocked; pilot excluded",()=>{
 const a=assess(rows().map(r=>({...r,playerId:"3112335",date:"2025-11-21"})));
 assert.equal(a.markets.player_points.developmentRows,0);assert.equal(a.markets.player_points.status,"insufficient_holdout");assert.equal(a.productionFreezeReady,false);
 assert.throws(()=>assess([rows()[0],rows()[0]]));
});
