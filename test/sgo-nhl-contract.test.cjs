"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {NHL_STAT_TO_MARKET,marketForStatID,bookmakerCloseLine,HISTORICAL_BOOK_FIELDS}
 =require("../src/sgo-nhl-contract.cjs");
test("documented NHL mappings do not confuse goals with points",()=>{
 assert.equal(marketForStatID("points"),"goals");
 assert.equal(marketForStatID("goals+assists"),"points");
 assert.equal(marketForStatID("shots_onGoal"),"shotsOnGoal");
 assert.equal(marketForStatID("goalie_saves"),"saves");
 assert.equal(marketForStatID("blocks"),"blockedShots");
 assert.equal(marketForStatID("assists"),"assists");
});
test("unknown and undocumented stat aliases cannot silently pollute past results",()=>{
 for(const s of ["goals","saves","shotsOnGoal","rebounds","",undefined])assert.equal(marketForStatID(s),null);
 assert.equal(Object.keys(NHL_STAT_TO_MARKET).length,6);
});
test("completed-game last in-play overUnder cannot substitute for closeOverUnder",()=>{
 assert.equal(HISTORICAL_BOOK_FIELDS.closeLine,"closeOverUnder");
 assert.equal(bookmakerCloseLine({overUnder:"3.5",closeOverUnder:"2.5"}),2.5);
 assert.equal(bookmakerCloseLine({overUnder:"3.5"}),null);
 assert.equal(bookmakerCloseLine({closeOverUnder:""}),null);
 assert.equal(bookmakerCloseLine({closeOverUnder:"NaN"}),null);
 assert.equal(bookmakerCloseLine({closeOverUnder:"-1"}),null);
});
