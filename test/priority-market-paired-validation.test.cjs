"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),lab=require("../src/lineup-count-mass-calibration-lab.cjs"),cal=require("../src/forward-calibration-evidence.cjs");
test("lineup release diagnostics fail closed on empty and short evidence",()=>{
 const r=lab.evaluate([]);assert.equal(r.releaseDiagnostics.additionalHeldoutSlatesRequired,30);assert.equal(r.releaseDiagnostics.beatsRawBrier,false);assert.equal(r.calibrationApproved,false);
});
test("calibration release diagnostics expose missing prior cohorts",()=>{
 const r={id:"a",market:"points",period:"full_game",tier:"Standard",side:"Higher",gameId:"g",p:.6,y:0,frozenAt:"2026-11-01T10:00:00Z",startAt:"2026-11-01T12:00:00Z",observedFinalAt:"2026-11-01T20:00:00Z"};
 const a=Object.values(cal.study({firstObserved:[r]}).byMarketTierSide)[0];
 assert.equal(a.releaseDiagnostics.enoughRows,false);assert.equal(a.releaseDiagnostics.beatsMatchedRaw,false);assert.equal(a.calibrationApproved,false);
});
