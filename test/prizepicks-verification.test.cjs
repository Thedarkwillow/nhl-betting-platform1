"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {reconcile}=require("../scripts/verify-prizepicks-lines.cjs");
const now=new Date("2026-10-31T20:00:00Z");
const item=(source,playerId,line,at="2026-10-31T19:00:00Z")=>({source,playerId,market:"shotsOnGoal",line,capturedAt:at,playerName:"Example"});
test("PickFinder primary: matching and differing PrizePicks lines",()=>{
 const p={lines:[item("PickFinder",1,2.5),item("PickFinder",2,3.5)]};
 const v={lines:[item("PrizePicks",1,2.5),item("PrizePicks",2,4.5)]};
 const r=reconcile(p,v,{now});
 assert.equal(r.status,"compared");
 assert.equal(r.matched.length,1);
 assert.equal(r.different.length,1);
 assert.equal(r.different[0].pickFinderLine,3.5);
});
test("does not imply missing prop when verification absent",()=>{
 assert.equal(reconcile({lines:[item("PickFinder",1,2.5)]},null,{now}).status,"verification_unavailable");
});
test("rejects stale and asynchronous comparisons",()=>{
 const p={lines:[item("PickFinder",1,2.5)]};
 const v={lines:[item("PrizePicks",1,2.5,"2026-10-31T15:00:00Z")]};
 const r=reconcile(p,v,{now});
 assert.equal(r.matched.length,0);
 assert.equal(r.excluded.length,1);
});
test("does not silently resolve duplicate markets",()=>{
 const p={lines:[item("PickFinder",1,2.5),item("PickFinder",1,3.5)]};
 const v={lines:[item("PrizePicks",1,2.5)]};
 const r=reconcile(p,v,{now});
 assert.equal(r.ambiguous.length,1);
});
