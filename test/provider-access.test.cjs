"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {injuries}=require("../scripts/probe-approved-provider-access.cjs");
test("RotoWire injury normalization preserves vendor identity and never assumes availability",()=>{
 const a=injuries({Players:[{Id:"42",Team:{Code:"BOS"},Injury:{Status:"GTD"}},{Id:"43",Team:{Code:"BOS"},Injury:{Status:"unknown"}}]},"NHL","2026-11-14T18:00:00Z");
 assert.equal(a.records.length,1);assert.equal(a.records[0].officialPlayerId,null);assert.equal(a.records[0].status,"GAME_TIME_DECISION");
 assert.equal(a.modelEligible,false);assert.equal(a.missingPlayerNotHealthy,true);
});
test("duplicate provider identity and malformed payload rejected",()=>{
 const p={Id:"42",Team:{Code:"BOS"},Injury:{Status:"OUT"}};
 assert.throws(()=>injuries({Players:[p,p]},"NHL","2026-11-14T18:00:00Z"));
 assert.throws(()=>injuries({},"NFL","2026-11-14T18:00:00Z"));
});
