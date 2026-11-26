"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {checkDue}=require("../scripts/nfl-daily-grade-freshness.cjs");
const clock="2026-11-26T11:40:00Z";
function item(id,start,status){const p={eventStartsAt:start,line:20.5,market:"rushing_yards",selectedSide:"Higher",sourceGameId:"game"};const firstCommittedAt="2026-11-24T10:00:00Z";return [id,{p,firstCommittedAt},{id,firstGitCommittedAt:firstCommittedAt,line:p.line,market:p.market,modeledSide:p.selectedSide,sourceGameId:p.sourceGameId,status}];}
function run(...xs){return checkDue(new Map(xs.map(x=>x.slice(0,2))),xs.map(x=>x[2]),clock);}
test("Wednesday overdue final missing is visible even with successful refresh",()=>{const r=run(item("a","2026-11-26T01:00:00Z","pending_official_final"));assert.equal(r.missingFinal,1);assert.equal(r.sourceComplete,false);});
test("future and recent games do not fail",()=>{const r=run(item("a","2026-11-26T18:00:00Z","pending_official_final"),item("b","2026-11-26T06:00:00Z","pending_official_final"));assert.equal(r.due,0);assert.equal(r.sourceComplete,true);});
test("finals and missing appearances are distinct",()=>{const r=run(item("a","2026-11-26T01:00:00Z","decided"),item("b","2026-11-26T01:00:00Z","unresolved_player_appearance"));assert.equal(r.due,2);assert.equal(r.otherUnresolved,1);assert.equal(r.sourceComplete,true);});
test("missing game and immutable line mismatch fail closed",()=>{const a=item("a","2026-11-26T01:00:00Z","pending_official_game_match");assert.equal(run(a).sourceComplete,false);a[2].line=21.5;assert.throws(()=>run(a));});
