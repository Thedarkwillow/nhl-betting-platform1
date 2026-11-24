"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {extractPrizePicksFixture}=require("../src/oddspapi-prizepicks-history.cjs");
const f={fixtureId:"fixture-1",startTime:"2026-02-13T00:00:00Z"};
const def={"11":{sportId:15,playerProp:true,handicap:2.5,marketName:"Player Shots on Goal",period:"fulltime",outcomes:[{outcomeId:100,outcomeName:"Over"},{outcomeId:101,outcomeName:"Under"}]}};
const snap={bookmakers:{prizepicks:{markets:{"11":{outcomes:{"100":{players:{"789":[
  {createdAt:"2026-02-12T19:00:00Z",active:true,price:1.73},
  {createdAt:"2026-02-12T20:00:00Z",active:false,price:1.73},
  {createdAt:"2026-02-13T00:02:00Z",active:true,price:1.73}
]}}}}}}}};
test("identifies real PrizePicks lines and rejects in-game snapshots",()=>{
 const x=extractPrizePicksFixture(snap,def,f);
 assert.equal(x.rows.length,1);
 assert.equal(x.rows[0].line,2.5);
 assert.equal(x.rows[0].observations,2);
 assert.equal(x.rows[0].lastObservedAt,"2026-02-12T20:00:00Z");
 assert.equal(x.rows[0].tier,"unverified");
 assert.equal(x.rows[0].verifiedClosingLine,false);
});
test("cannot confuse another sportsbook or non-prop market with PrizePicks",()=>{
 assert.equal(extractPrizePicksFixture({bookmakers:{fanduel:snap.bookmakers.prizepicks}},def,f).rows.length,0);
 const d={"11":{...def["11"],playerProp:false}};
 assert.equal(extractPrizePicksFixture(snap,d,f).rows.length,0);
});
test("reject unknown market metadata and never treats price 1.73 as tier payout",()=>{
 const x=extractPrizePicksFixture(snap,{},f);
 assert.equal(x.rows.length,0);
 assert.ok(x.issues[0].includes("unrecognized"));
});
