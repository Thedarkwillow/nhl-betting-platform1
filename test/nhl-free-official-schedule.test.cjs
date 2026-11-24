"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {resolveSchedule}=require("../scripts/build-free-nhl-research.cjs");
test("UTC evening start resolves through prior local NHL calendar date",async()=>{
 const original=global.fetch,called=[];
 global.fetch=async url=>{
  called.push(String(url));
  return {ok:true,json:async()=>({gameWeek:String(url).endsWith("2026-11-02")?[{
   date:"2026-11-02",games:[{id:2026020230,gameState:"FUT",
    startTimeUTC:"2026-11-03T00:00:00Z",awayTeam:{abbrev:"VGK"},homeTeam:{abbrev:"BOS"}}]}]:[]})};
 };
 try{
  const output={rankedProps:[{player:"J. Test",team:"VGK",opponent:"BOS",
   matchup:"BOS vs VGK | 2026-11-03T00:00:00.000Z",
   capturedAt:"2026-11-02T02:00:00Z",eventStartsAt:"2026-11-03T00:00:00Z"}]};
  await resolveSchedule(output);
  assert.equal(output.gameIdentityResolved,1);
  assert.equal(output.rankedProps[0].gameId,2026020230);
  assert.ok(called.some(x=>x.endsWith("2026-11-02")));
  assert.ok(called.some(x=>x.endsWith("2026-11-03")));
 }finally{global.fetch=original;}
});
