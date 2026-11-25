"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{countMass}=require("../src/esports-lol-count-challenger.cjs");
test("Poisson and integer push preserve probability mass",()=>{const p=countMass(Array(20).fill(2),2);assert.ok(Math.abs(p.push-2*Math.exp(-2))<1e-10);assert.ok(Math.abs(p.higher+p.lower+p.push-1)<1e-10);assert.equal(p.distribution,"poisson");assert.equal(countMass(Array(20).fill(2),2.5).push,0);});
test("overdispersion and missing history",()=>{const p=countMass(Array.from({length:20},(_,i)=>i%2?0:20),10.5);assert.equal(p.distribution,"negative_binomial");assert.ok(p.higher>=0&&p.higher<=1);assert.equal(countMass([1,2],2),null);assert.deepEqual(countMass(Array(12).fill(0),0),{higher:0,lower:0,push:1,distribution:"point_mass"});});
