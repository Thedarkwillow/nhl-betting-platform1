"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {diffFreeBoards}=require("../src/nhl-free-line-movement.cjs");
const at="2026-11-08T01:00:00Z";
function row(tier,id="pp_1",line=2.5){return {projectionId:id,tier,side:"Higher",
 player:"Example",team:"NYR",market:"Shots On Goal",period:"Full game",
 line,eventStartsAt:at,capturedAt:"2026-11-07T17:05:00Z"};}
const a={generatedAt:"2026-11-07T16:00:00Z",rows:[row("Standard")]};
test("one-to-one stable provider identity exposes observed tier change only",()=>{
 const b={generatedAt:"2026-11-07T17:00:00Z",rows:[row("Demon")]};
 const r=diffFreeBoards(a,b);
 assert.equal(r.summary.tierChangesObserved,1);
 assert.equal(r.summary.newOffers,0);
 assert.equal(r.summary.notSeenUnverified,0);
 assert.equal(r.changes.length,1);
 assert.equal(r.changes[0].previousTier,"Standard");
 assert.equal(r.changes[0].tier,"Demon");
 assert.equal(r.changes[0].originalAppTierChangeVerified,false);
 assert.equal(r.removalsVerified,false);
});
test("changed provider ID is never mistaken for a verified tier reclassification",()=>{
 const r=diffFreeBoards(a,{generatedAt:"2026-11-07T17:00:00Z",
 rows:[row("Demon","pp_2")]});
 assert.equal(r.summary.tierChangesObserved,0);
 assert.equal(r.summary.newOffers,1);
 assert.equal(r.summary.notSeenUnverified,1);
});
test("line changes are not tier changes",()=>{
 const r=diffFreeBoards(a,{generatedAt:"2026-11-07T17:00:00Z",
 rows:[row("Standard","pp_1",3.5)]});
 assert.equal(r.summary.increased,1);
 assert.equal(r.summary.tierChangesObserved,0);
});
test("ambiguous duplicates must not look like an isolated provider tier transition",()=>{
 const r=diffFreeBoards(a,{generatedAt:"2026-11-07T17:00:00Z",
 rows:[row("Demon"),row("Goblin")]});
 assert.equal(r.summary.tierChangesObserved,0);
});
