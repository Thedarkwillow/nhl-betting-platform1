"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {observe,dependenceSensitivity}=require("../src/lineup-count-mass-calibration-lab.cjs");
const {study}=require("../src/nfl-reconciled-kicker-lab.cjs");
const {attachNflAvailability}=require("../src/nfl-current-injury-evidence.cjs");
test("dependence stress distribution conserves total mass and expected hits",()=>{
 const a=[.1,.4,.5],b=dependenceSensitivity(a);
 assert.ok(Math.abs(b.reduce((x,y)=>x+y,0)-1)<1e-9);
 assert.ok(Math.abs(b.reduce((x,y,i)=>x+y*i,0)-1.4)<1e-9);
 assert.ok(b[0]>a[0]&&b[2]>a[2]);
});
test("first observed resolution survives a missing refresh; corrections remain quarantined",()=>{
 const r={id:"a",formatSize:"power_2",slate:"2026-11-14",mass:[.1,.4,.5],hits:2,frozenAt:"2026-11-14T18:00:00Z"};
 const a=observe([r],null,"2026-11-15T01:00:00Z");
 const b=observe([],a,"2026-11-15T03:00:00Z");
 const c=observe([r],b,"2026-11-15T04:00:00Z");
 assert.equal(c.records[0].resolvedAt,a.records[0].resolvedAt);
 const d=observe([{...r,hits:1}],c,"2026-11-15T05:00:00Z");
 assert.deepEqual(d.quarantinedIds,["a"]);
 assert.equal(observe([r],d,"2026-11-15T06:00:00Z").records.length,0);
});
test("kicker walk-forward compares matching heldout synthetic lines and ignores later games",()=>{
 const measures={fg_made:2,fg_attempts:2,pat_made:2,kicking_points:8};
 const rows=Array.from({length:10},(_,i)=>({year:2025,week:i+1,gameId:"g"+i,playerId:"p",zeroAttempt:i===8,measures:i===8?{fg_made:0,fg_attempts:0,pat_made:0,kicking_points:0}:measures}));
 const result=study(rows).byMarket.fg_made;
 assert.equal(result.evaluations,6);assert.equal(result.distinctGames,2);
 assert.ok(Number.isFinite(result.priorAllAppearanceBrier));
 assert.equal(study(rows.slice(0,8)).byMarket.fg_made.evaluations,0);
});
test("unrecognized exact injury status is quarantined, never clearance",()=>{
 const now="2026-11-14T20:00:00Z",p={historicalPlayerId:"p",team:"BUF",season:2026,week:10,eventStartsAt:"2026-11-15T18:00:00Z"};
 const report={kind:"nfl_first_party_published_game_status_v1",capturedAt:now,rows:[{gsisId:"p",team:"BUF",season:2026,week:10,modifiedAt:now,status:"bogus"}]};
 assert.equal(attachNflAvailability(p,report,now).blocksResearch,true);
});

test("known uncertain report-derived status remains labeled and is never clearance",()=>{
 const now="2026-11-14T20:00:00Z",p={historicalPlayerId:"p",team:"BUF",season:2026,week:10,eventStartsAt:"2026-11-15T18:00:00Z"};
 for(const status of ["probable","report_status_unconfirmed"]){
  const r=attachNflAvailability(p,{kind:"nflverse_official_report_derived_injuries_v1",capturedAt:now,rows:[{gsisId:"p",team:"BUF",season:2026,week:10,modifiedAt:now,status}]},now);
  assert.equal(r.status,status);assert.equal(r.blocksResearch,true);assert.equal(r.medicalClearanceVerified,false);
 }
});
