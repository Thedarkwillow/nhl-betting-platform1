"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {diffFreeBoards}=require("../src/nhl-free-line-movement.cjs");
test("reports line increases and decreases but does not claim confirmed removals",()=>{
 const a={generatedAt:"2026-11-01T19:00:00Z",rows:[
  {projectionId:"1",tier:"Standard",side:"Higher",player:"A",team:"NYR",market:"Goals",line:.5,eventStartsAt:"2026-11-02T01:00:00Z"},
  {projectionId:"2",tier:"Standard",side:"Lower",player:"B",team:"NYR",market:"Goals",line:1.5,eventStartsAt:"2026-11-02T01:00:00Z"}]};
 const b={generatedAt:"2026-11-01T20:00:00Z",rows:[{...a.rows[0],line:1.5}]};
 const d=diffFreeBoards(a,b);
 assert.equal(d.summary.increased,1);assert.equal(d.summary.notSeenUnverified,1);
 assert.equal(d.removalsVerified,false);
 assert.ok(d.changes.some(x=>x.type==="not_seen_unverified"));
});
