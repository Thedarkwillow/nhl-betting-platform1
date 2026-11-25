"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{assess}=require("../src/nhl-prior-market-direction-research.cjs");
test("no fitted claims without sufficient earlier dates",()=>{const r={market:"shotsOnGoal",line:2.5,gameStartAt:"2026-11-24T20:00:00Z",outcome:{status:"decided",side:"Lower"},shadow:{variants:{champion:{status:"research_only",probabilities:{higher:.6,lower:.4}}},decisions:{champion:{side:"Higher"}}}};assert.deepEqual(assess(Array(200).fill(r)).groups,{});assert.equal(assess([r]).modelPromoted,false);});
