"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {poissonCdf,estimateCountProbabilities}=require("../src/prop-probabilities.cjs");
test("Poisson lambda 2 has correct zero count",()=>assert.ok(Math.abs(poissonCdf(0,2)-Math.exp(-2))<1e-10));
test("Half-integer lines have no push",()=>{
 const p=estimateCountProbabilities(2,2.5);
 assert.equal(p.push,0);
 assert.ok(Math.abs(p.higher+p.lower-1)<0.00002);
 assert.equal(p.calibrated,false);
});
test("Integer lines account for pushes",()=>{
 const p=estimateCountProbabilities(2,2);
 assert.ok(p.push>0);
 assert.ok(Math.abs(p.higher+p.lower+p.push-1)<0.00002);
});
test("Rejects invalid projection means",()=>assert.equal(estimateCountProbabilities(-1,1.5),null));
