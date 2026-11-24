"use strict";const {test}=require("node:test"),assert=require("node:assert/strict"),{study}=require("../src/forward-calibration-evidence.cjs");test("game-weighted calibration treats a large same-game cohort as one game",()=>{const rows=[];for(let g=1;g<=16;g++)for(let i=0;i<4;i++)rows.push({id:g+"-"+i,gameId:g,market:"points",period:"full_game",tier:"Standard",side:"Higher",p:.7,y:1,frozenAt:"2026-10-01T00:00:00Z",startAt:"2026-10-01T01:00:00Z",observedFinalAt:"2026-10-02T00:00:00Z"});for(const [gameId,n,y] of [[17,4,1],[18,1,0]])for(let i=0;i<n;i++)rows.push({id:gameId+"-"+i,gameId,market:"points",period:"full_game",tier:"Standard",side:"Higher",p:.7,y,frozenAt:"2026-10-03T00:00:00Z",startAt:"2026-10-03T01:00:00Z",observedFinalAt:"2026-10-04T00:00:00Z"});const r=study({firstObserved:rows}).byMarketTierSide['["points","full_game","Standard","Higher"]'];assert.equal(r.matchedHeldout,5);assert.equal(r.distinctGames,2);assert.ok(Math.abs(r.gameEqualRawBrier-.29)<1e-10);assert.ok(Math.abs(r.rawBrier-.17)<1e-10);assert.equal(r.calibrationApproved,false);assert.equal(r.matchedPriorMarketRateBaseline.n,5);assert.equal(r.matchedPriorMarketRateBaseline.distinctGames,2);assert.ok(Math.abs(r.observedSelectedRate-.8)<1e-10);assert.ok(Math.abs(r.rawSignedCalibrationGap+.1)<1e-10);});

test("NHL calibration dates must use Pacific slate day instead of UTC rollover",()=>{
 const {pacificDay}=require("../src/forward-calibration-evidence.cjs");
 assert.equal(pacificDay("2026-11-22T23:30:00Z"),"2026-11-22");
 assert.equal(pacificDay("2026-11-23T00:30:00Z"),"2026-11-22");
 assert.equal(pacificDay("2026-11-23T08:30:00Z"),"2026-11-23");
 assert.equal(pacificDay("invalid"),null);
});
