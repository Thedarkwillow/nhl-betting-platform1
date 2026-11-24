"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {compare}=require("../src/nhl-market-comparison.cjs");
test("sportsbook comparison requires exact line teams, time and fresh two-sided book",()=>{
 const now="2026-11-02T18:00:00Z",game="2026-11-03T00:00:00Z";
 const prop={player:"J. Peterka",team:"BOS",opponent:"VGK",matchup:"BOS vs VGK | "+game,
  playerId:123,market:"shotsOnGoal",line:2.5,tier:"Standard",capturedAt:now,
  eventStartsAt:game,probabilities:{higher:.62,lower:.38}};
 const quote={player:"John Peterka",homeTeam:"Boston Bruins",awayTeam:"Vegas Golden Knights",
  book:"FanDuel",market:"shotsOnGoal",line:2.5,eventId:"a",overOdds:-110,underOdds:-110,
  capturedAt:now,marketUpdatedAt:now,commenceTime:game};
 assert.equal(compare([prop],[quote],now).counts.matched,1);
 assert.equal(compare([prop],[{...quote,line:3.5}],now).counts.matched,0);
 assert.equal(compare([prop],[{...quote,commenceTime:"2026-11-04T00:00:00Z"}],now).counts.matched,0);
 assert.equal(compare([prop],[{...quote,awayTeam:"New York Rangers"}],now).counts.matched,0);
});
