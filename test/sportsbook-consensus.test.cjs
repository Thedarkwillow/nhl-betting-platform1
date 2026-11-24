"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {impliedProbability,removeVig,consensus}=require("../src/sportsbook-consensus.cjs");
test("American odds implied probability",()=>{
 assert.equal(impliedProbability(-150),0.6);
 assert.equal(impliedProbability(150),0.4);
 assert.equal(impliedProbability(0),null);
});
test("no-vig probabilities sum to one",()=>{
 const x=removeVig(-110,-110);
 assert.ok(Math.abs(x.higher-.5)<1e-10);
 assert.ok(Math.abs(x.higher+x.lower-1)<1e-10);
 assert.ok(x.overround>0);
});
test("consensus rejects mismatched markets and lines",()=>{
 const a={book:"A",playerId:12,gameId:44,market:"shotsOnGoal",line:2.5,overOdds:-120,underOdds:100};
 assert.equal(consensus([a,{...a,book:"B",line:3.5}]),null);
 assert.equal(consensus([a,{...a,book:"B",gameId:45}]),null);
 assert.equal(consensus([a,{...a,book:"B",market:"goals"}]),null);
 assert.equal(consensus([a,{...a,book:"B",playerId:13}]),null);
 assert.equal(consensus([a,{...a,book:"B"}]).books,2);
});
