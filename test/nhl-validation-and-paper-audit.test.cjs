"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{fit,group,calibration}=require("../src/nhl-market-error-and-calibration-audit.cjs"),{paper}=require("../src/nhl-paper-first-registered-formats.cjs");
test("calibrator requires independent games and enough observations",()=>{const rs=Array.from({length:60},(_,i)=>({gameId:Math.floor(i/4),p:.8,y:0}));const v=fit(rs);assert.ok(v.intercept<0);assert.equal(fit(rs.map(x=>({...x,gameId:1}))),null);assert.equal(fit(rs.slice(0,59)),null);assert.notEqual(group({market:"points",tier:"Goblin",side:"Higher"}),group({market:"points",tier:"Demon",side:"Higher"}));});
test("missing first-observation evidence cannot train confidence",()=>{const x=calibration(null,{records:[]},"2026-11-15T00:00:00Z");assert.equal(x.fittedGroups,0);assert.equal(x.approval,false);});
test("all nine paper formats exist even with no authentic entry evidence",()=>{const x=paper([],{},{},"2026-11-15T00:00:00Z");assert.equal(Object.keys(x.formats).length,9);assert.equal(x.formats.flex_2,undefined);assert.equal(x.formats.power_6.hypotheticalReferenceROI,null);assert.equal(x.formats.power_6.independentSlateReview.remainingToMinimum,50);assert.equal(x.formats.power_6.independentSlateReview.approval,false);assert.equal(x.realWagers,0);assert.equal(x.approved,false);});

test("market calibrators abstain when 60 correlated offers act like only a few games",()=>{
 const concentrated=Array.from({length:100},(_,i)=>({
  gameId:i<81?1:i-80,p:.75,y:i%2
 }));
 assert.equal(fit(concentrated),null);
 const independent=Array.from({length:100},(_,i)=>({
  gameId:1+Math.floor(i/4),p:.75,y:i%2
 }));
 const f=fit(independent);
 assert.ok(f);
 assert.equal(f.trainingGames,25);
 assert.ok(f.effectiveIndependentGames>=20);
});
