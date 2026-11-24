"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit}=require("../src/underdog-source-player-collision.cjs");
const row=(line,id,name="Elias Pettersson",team="VAN")=>({
 line_id:line,player:{id,name,team}});
test("source player collision and split name-team identity are fully quarantined",()=>{
 const a=audit({data:[row("A","one"),row("B","one","Elias Pettersson","BOS"),
  row("C","two"),row("D","three","Other Player","TOR")]});
 assert.deepEqual([...a.rejectedOfferIds].sort(),["A","B","C"]);
 assert.equal(a.rejectedCount,3);
 assert.equal(a.reasons.sourceIdCollision,1);
 assert.equal(a.reasons.identitySplit,1);
 assert.equal(a.productionEligible,false);
});
test("legitimate two-market provider ID reuse is allowed for offline matching",()=>{
 const a=audit({data:[row("A",123),row("B",123)]});
 assert.equal(a.rejectedCount,0);
 assert.equal(a.sourceIdentityAuthenticated,false);
});
test("blank provider player IDs and unknown teams are not trusted",()=>{
 const a=audit({data:[row("A",null),row("B","x","Elias Pettersson","")]});
 assert.equal(a.rejectedCount,2);
});
