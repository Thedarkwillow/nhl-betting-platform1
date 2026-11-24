"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {compare,sameName}=require("../src/nhl-market-comparison.cjs");
test("matches abbreviated NHL names only with identical surname and initial",()=>{
 assert.equal(sameName("C. McDavid","Connor McDavid"),true);
 assert.equal(sameName("C. McDavid","Leon Draisaitl"),false);
});
test("strict matching includes teams, exact line, event time and tier",()=>{
 const now="2026-11-01T22:00:00Z";
 const p={player:"C. McDavid",playerId:1,team:"EDM",market:"shotsOnGoal",line:2.5,tier:"Demon",matchup:"@ NYR",capturedAt:"2026-11-01T21:00:00Z",probabilities:{higher:.4,lower:.6}};
 const q={player:"Connor McDavid",book:"DraftKings",market:"shotsOnGoal",line:2.5,overOdds:-110,underOdds:-110,eventId:"x",homeTeam:"New York Rangers",awayTeam:"Edmonton Oilers",commenceTime:"2026-11-01T23:00:00Z",capturedAt:"2026-11-01T21:30:00Z"};
 const good=compare([p],[q],now);
 assert.equal(good.counts.matched,1);
 assert.equal(good.comparisons[0].tier,"Demon");
 assert.equal(good.comparisons[0].sportsbookHigher,.5);
 assert.equal(compare([p],[{...q,line:3.5}],now).counts.matched,0);
 assert.equal(compare([p],[{...q,homeTeam:"Boston Bruins"}],now).counts.matched,0);
 assert.equal(compare([p],[{...q,commenceTime:"2026-11-01T21:00:00Z"}],now).counts.matched,0);
});
