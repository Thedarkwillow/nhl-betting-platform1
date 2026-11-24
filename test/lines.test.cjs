"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {compareLines}=require("../src/lines.cjs");
const now=new Date("2026-10-31T20:00:00Z");
const projections={players:{"42":{name:"Example",team:"BOS",projections:{shotsOnGoal:{ready:true,estimate:3.5,observations:10}}}}};
function line(changes={}) {return {source:"PrizePicks",playerId:42,playerName:"Example",market:"shotsOnGoal",line:2.5,capturedAt:"2026-10-31T19:00:00Z",...changes};}
test("matches verified player ID and market",()=>{
  const r=compareLines({lines:[line()]},projections,now);
  assert.equal(r.candidates[0].delta,1);
  assert.equal(r.candidates[0].direction,"higher");
});
test("rejects stale lines and unknown players",()=>{
  const r=compareLines({lines:[line({capturedAt:"2026-10-30T00:00:00Z"}),line({playerId:999})]},projections,now);
  assert.equal(r.candidates.length,0);
  assert.equal(r.skipped.length,2);
});
test("rejects player-name mismatch and duplicates",()=>{
  const r=compareLines({lines:[line(),line(),line({playerName:"Wrong"})]},projections,now);
  assert.equal(r.candidates.length,1);
  assert.equal(r.skipped.length,2);
});
