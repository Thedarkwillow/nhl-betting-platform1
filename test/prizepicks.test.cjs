"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizeBoard}=require("../src/prizepicks.cjs");
test("normalizes supported PrizePicks lines without confusing provider ID with NHL ID",()=>{
  const payload={data:[{id:"p1",attributes:{stat_type:"Shots On Goal",line_score:2.5},relationships:{new_player:{data:{type:"new_player",id:"abc"}}}}],
    included:[{type:"new_player",id:"abc",attributes:{name:"Test Player"}}]};
  const result=normalizeBoard(payload,"2026-10-31T20:00:00Z");
  assert.equal(result.rows[0].market,"shotsOnGoal");
  assert.equal(result.rows[0].providerPlayerId,"abc");
  assert.equal(result.rows[0].playerId,undefined);
});
test("rejects malformed board",()=>assert.throws(()=>normalizeBoard({},"2026-10-31T20:00:00Z")));
