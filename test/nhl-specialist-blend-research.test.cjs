"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{blend,evaluate}=require("../src/nhl-specialist-blend-research.cjs");
const p=x=>({status:"research_only",probabilities:{higher:x,lower:1-x}});
const row={market:"assists",gameId:1,playerId:2,line:.5,gameStartAt:"2026-11-24T22:00:00Z",outcome:{status:"decided",side:"Higher"},shadow:{variants:{champion:p(.4),usage:p(.8),matchup:p(.6)},decisions:{champion:{side:"Lower"},usage:{side:"Higher"},matchup:{side:"Higher"}}}};
test("fixed blend independent of outcome direction and no model promotion",()=>{const a=blend(row),b=blend({...row,outcome:{status:"decided",side:"Lower"}});assert.deepEqual(a,b);assert.ok(Math.abs(a.adjusted-.55)<1e-8);const r=evaluate([row]);assert.equal(r.markets.assists.matched,1);assert.equal(r.markets.assists.blendCorrect,1);assert.equal(r.modelPromoted,false);assert.equal(r.blendItselfOriginallyFrozen,false);});
test("missing specialist abstains",()=>assert.equal(blend({...row,shadow:{variants:{champion:p(.4)},decisions:{champion:{side:"Lower"}}}}),null));
