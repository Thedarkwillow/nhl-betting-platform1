"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {split,windows,h2hShadow,leagueRank}=require("../src/prop-matchup-evidence-v1.cjs");
const {asWindow}=require("../src/nhl-multifactor-position-matchup-v1.cjs");
test("H2H exact threshold includes pushes and no fabricated missing history",()=>{
 assert.deepEqual(split([0,2,3,NaN],2),{games:3,average:5/3,higher:1,lower:1,push:1,higherRate:1/3,lowerRate:1/3,values:[0,2,3]});
 assert.equal(split([],1.5).higherRate,null);
 assert.equal(windows([1,2,3,4,5,6],3.5).last5.games,5);
});
test("sparse matchup cannot change shadow; substantial sample is bounded",()=>{
 const prior=split(Array(16).fill(2),1.5);
 assert.equal(h2hShadow(2,prior,split([5,6],1.5)),null);
 const x=h2hShadow(2,prior,split([5,6,7,8],1.5));
 assert.ok(x.adjustment<=.4);assert.equal(x.calibrated,false);
});
test("league ranks withheld without comparable coverage and clearly oriented",()=>{
 const rows=Array.from({length:32},(_,i)=>({team:"t"+i,games:10,rate:i}));
 assert.equal(leagueRank(rows,"t31").rankMostAllowed,1);
 assert.equal(leagueRank(rows.slice(1),"t31"),null);
 assert.equal(leagueRank(rows.map((x,i)=>i===0?{...x,games:9}:x),"t31"),null);
});
test("canonical per60 schema is accepted but conflicting aliases fail",()=>{
 assert.equal(asWindow({games:10,per60:2,allowedPerAppearance:1}).allowedPer60,2);
 assert.equal(asWindow({games:10,per60:2,allowedPer60:3,allowedPerAppearance:1}),null);
});
