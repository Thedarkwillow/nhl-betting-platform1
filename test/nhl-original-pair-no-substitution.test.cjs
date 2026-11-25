"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{select,assess}=require("../src/nhl-original-pair-no-substitution.cjs");
const row=(id,status)=>({playerId:id,gameId:1,market:"assists",line:.5,gameStartAt:"2026-11-24T20:00:00Z",outcome:{status,side:"Higher"},shadow:{variants:{champion:{status:"research_only",probabilities:{higher:.6,lower:.4}}}}});
test("pending first player retained, no result-conditioned substitution",()=>{const rows=[row(1,"pending"),row(2,"decided"),row(3,"decided")];assert.equal(select(rows)[0].x.r.playerId,1);const a=assess(rows).markets.assists;assert.equal(a.registered,1);assert.equal(a.resolved,0);assert.equal(a.pendingOrVoid,1);assert.equal(a.scored,0);});
