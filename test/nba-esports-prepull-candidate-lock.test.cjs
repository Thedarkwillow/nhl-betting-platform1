"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{window,required,pin}=require("../scripts/nba-esports-prepull-candidate-lock.cjs");
test("both Pacific morning windows including DST; never backdate or certify late run",()=>{
 assert.deepEqual(window("2026-11-25T13:15:00Z","06:00"),{day:"2026-11-25",slot:"06:00",minutesBeforePull:45});
 assert.deepEqual(window("2026-11-25T16:30:00Z","09:00"),{day:"2026-11-25",slot:"09:00",minutesBeforePull:30});
 assert.equal(window("2026-11-25T13:46:00Z","06:00"),null);
 assert.equal(window("2026-11-25T14:00:00Z","06:00"),null);
 assert.equal(window("2026-11-25T16:15:00Z","06:00"),null);
 assert.equal(window("2027-07-01T12:15:00Z","06:00").minutesBeforePull,45);
});
test("explicitly covers NBA and every supported esport; revision immutable",()=>{assert.deepEqual(required,["NBA","CS2","VALORANT","LOL","DOTA2","COD"]);assert.match(pin,/^[0-9a-f]{40}$/);});
