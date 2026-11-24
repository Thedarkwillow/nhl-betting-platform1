"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {SEASON_START,SEASON_END,MAX_DATES,historicalDates,
 nextMissingSeasonDates,officialHistoricalSource,partitionLeagueSeasonGames}=
 require("../scripts/backfill-nhl-prior-season-periods.cjs");
test("prior season period source dates are strictly capped to 2025-26",()=>{
 const all=historicalDates();
 assert.equal(all[0],SEASON_START);
 assert.equal(all.at(-1),SEASON_END);
 assert.equal(all.length>200,true);
 assert.equal(new Set(all).size,all.length);
 assert.deepEqual(historicalDates("2025-10-07","2025-10-09"),
  ["2025-10-07","2025-10-08","2025-10-09"]);
 for(const [start,end] of [
  ["2025-10-06","2025-10-08"],
  ["2025-10-08","2026-06-25"],
  ["2025-10-09","2025-10-07"],
  ["not-a-date","2026-05-01"]
 ])assert.throws(()=>historicalDates(start,end),/date bounds/);
});
test("backfill selects only missing historical dates, includes weekend/empty schedule checks",()=>{
 assert.equal(MAX_DATES,5);
 const next=nextMissingSeasonDates({
  existingDates:["2025-10-07","2025-10-09"],
  emptyDates:["2025-10-08"],max:4});
 assert.deepEqual(next,["2025-10-10","2025-10-11","2025-10-12","2025-10-13"]);
 assert.equal(nextMissingSeasonDates({max:3}).length,3);
 assert.throws(()=>nextMissingSeasonDates({max:8}),/1–7/);
});
test("prior season collector will not fetch current 2026-27 sources",async()=>{
 await assert.rejects(()=>officialHistoricalSource("2026-11-06",{
  client:async()=>{throw Error("Network must never be invoked");}}),
  /Not a 2025/);
});


test("shared API pacing avoids burst traffic across historical NHL endpoints",async()=>{
 let clock=0;const waits=[],observed=[];
 const {makePacedClient}=require("../scripts/backfill-nhl-prior-season-periods.cjs");
 const paced=makePacedClient(async(url)=>{observed.push({url,time:clock});return {ok:true};},
  {minimumGapMs:1200,now:()=>clock,
   sleepFn:async ms=>{waits.push(ms);clock+=ms;}});
 await paced("schedule");await paced("boxscore");await paced("shiftcharts");
 assert.deepEqual(observed.map(x=>x.time),[0,1200,2400]);
 assert.deepEqual(waits,[1200,1200]);
 assert.throws(()=>makePacedClient(null),/Invalid NHL pacing/);
});
test("five incomplete dates cannot permanently starve later dates",()=>{const a=historicalDates().slice(0,5);const next=nextMissingSeasonDates({recentFailedDates:a});assert.equal(next.length,5);assert.equal(next[0],a[0]);assert.equal(next[1],historicalDates()[5]);assert.equal(next.filter(x=>a.includes(x)).length,1);});

test("2026 Olympic game family 202509 is not an NHL club game or a missing shiftchart day",async()=>{
 const date="2026-02-11",requests=[];
 const sample={gameWeek:[{date,games:[
  {id:2025090001,gameState:"OFF",startTimeUTC:date+"T16:00:00Z",
   homeTeam:{abbrev:"CAN"},awayTeam:{abbrev:"ITA"}},
  {id:2025090002,gameState:"OFF",startTimeUTC:date+"T20:00:00Z",
   homeTeam:{abbrev:"SWE"},awayTeam:{abbrev:"FIN"}}
 ]}]};
 const x=await officialHistoricalSource(date,{client:async(url)=>{
  requests.push(url);return {ok:true,json:async()=>sample};
 }});
 assert.deepEqual(requests,["https://api-web.nhle.com/v1/schedule/"+date]);
 assert.equal(x.emptySchedule,true);
 assert.equal(x.noNhlClubGamesInVerifiedOfficialSchedule,true);
 assert.equal(x.excludedNonLeagueGames,2);
 assert.deepEqual(x.excludedCompetitionTypes,[202509]);
 assert.equal(x.scheduledGames,0);
});
test("season schedule distinguishes NHL regular/playoff games from Olympics and preseason",()=>{
 const d="2026-02-12";
 const x=partitionLeagueSeasonGames([
  {date:d,id:2025090003},{date:d,id:2025020801},
  {date:d,id:2025030101},{date:d,id:2025010003},
  {date:"2026-02-11",id:2025090001}
 ],d);
 assert.deepEqual(x.league.map(g=>g.id),[2025020801,2025030101]);
 assert.equal(x.excludedNonLeagueGames,2);
 assert.deepEqual(x.otherCompetitionTypes,[202501,202509]);
});
