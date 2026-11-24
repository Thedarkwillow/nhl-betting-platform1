"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizePickFinder}=require("../src/pickfinder.cjs");
test("normalizes known NHL PickFinder prop fields",()=>{
  const r=normalizePickFinder({items:[{player_name:"Test",player_id:"pf42",market:"shots on goal",line:2.5}]},"2026-10-31T00:00:00Z");
  assert.equal(r.rows[0].market,"shotsOnGoal");
  assert.equal(r.rows[0].providerPlayerId,"pf42");
});
test("fails closed on unknown response format",()=>assert.throws(()=>normalizePickFinder({data:[]},new Date().toISOString())));
