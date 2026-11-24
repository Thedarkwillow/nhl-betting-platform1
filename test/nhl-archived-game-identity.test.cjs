"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {resolveArchivedGameIdentity}=require("../src/nhl-archived-game-identity.cjs");
const source=Object.freeze({playerId:8482511,team:"VGK",opponent:"BOS",
 matchup:"BOS vs VGK | 2026-11-03T00:00:00.000Z",
 eventStartsAt:"2026-11-03T00:00:00.000Z",capturedAt:"2026-11-02T01:57:57Z",
 market:"shotsOnGoal",line:2.5,lean:"Higher"});
const games=[{id:2026020232,home:"BOS",away:"VGK",startTimeUTC:"2026-11-03T00:00:00Z"},
 {id:2026020233,home:"FLA",away:"DET",startTimeUTC:"2026-11-03T00:00:00Z"}];
test("recovers immutable archived NHL offer only on exact official game and time",()=>{
 const result=resolveArchivedGameIdentity(source,games);
 assert.equal(result.status,"recovered_from_official_schedule");
 assert.equal(result.prop.gameId,2026020232);
 assert.equal(result.prop.gameStartAt,"2026-11-03T00:00:00Z");
 assert.equal(result.prop.gameIdentityResolvedAtGrading,true);
 assert.equal(result.prop.gameIdentitySource,"cached_official_nhl_schedule");
 assert.equal(source.gameId,undefined);
 assert.notStrictEqual(result.prop,source);
});
test("returns unchanged already identified original record",()=>{
 const p={...source,gameId:2026020232,gameStartAt:"2026-11-03T00:00:00Z"};
 const result=resolveArchivedGameIdentity(p,games);
 assert.equal(result.status,"already_identified");
 assert.strictEqual(result.prop,p);
});
test("cannot invent game from opponent-only archived old prop lacking scheduled start",()=>{
 const p={team:"ANA",matchup:"vs OTT",capturedAt:"2026-11-01T18:00:00Z"};
 const result=resolveArchivedGameIdentity(p,games);
 assert.equal(result.status,"insufficient_original_match_metadata");
 assert.strictEqual(result.prop,p);
});
test("rejects multiple matches, mismatched event times, and post-start captures",()=>{
 assert.equal(resolveArchivedGameIdentity(source,[games[0],{...games[0],id:2026021232}]).status,"ambiguous_schedule_match");
 assert.equal(resolveArchivedGameIdentity({...source,eventStartsAt:"2026-11-03T01:00:00Z"},games).status,"no_exact_official_schedule_match");
 assert.equal(resolveArchivedGameIdentity({...source,capturedAt:"2026-11-03T00:01:00Z"},games).status,"invalid_or_poststart_metadata");
});
test("matches documented city shorthand SJ to official SJS without fuzzy roster inference",()=>{
 const p={...source,team:"CGY",opponent:"SJ",
  matchup:"CGY vs SJ | 2026-11-03T02:00:00Z",
  eventStartsAt:"2026-11-03T02:00:00Z"};
 const r=resolveArchivedGameIdentity(p,[{id:2026020235,home:"SJS",away:"CGY",startTimeUTC:"2026-11-03T02:00:00Z"}]);
 assert.equal(r.status,"recovered_from_official_schedule");
 assert.equal(r.prop.gameId,2026020235);
});
test("refuses after-the-fact player/team guessing and team mismatch",()=>{
 const p={...source,opponent:"CHI"};
 const r=resolveArchivedGameIdentity(p,games);
 assert.equal(r.prop.gameId,undefined);
 assert.equal(r.status,"no_exact_official_schedule_match");
});

test("recovers originally archived @/vs opponent for a uniquely scheduled pregame game",()=>{
 const schedule=[{id:2026020230,home:"NYR",away:"EDM",startTimeUTC:"2026-11-01T23:00:00Z"},
  {id:2026020231,home:"ANA",away:"OTT",startTimeUTC:"2026-11-02T01:00:00Z"}];
 const p=Object.freeze({playerId:8480803,team:"EDM",matchup:"@ NYR",
  capturedAt:"2026-11-01T18:55:04Z",market:"blockedShots"});
 const a=resolveArchivedGameIdentity(p,schedule);
 assert.equal(a.status,"recovered_from_archived_matchup_and_official_schedule");
 assert.equal(a.prop.gameId,2026020230);
 assert.equal(a.prop.gameStartAt,schedule[0].startTimeUTC);
 assert.equal(a.prop.opponent,undefined);
 assert.equal(a.prop.eventStartsAt,undefined);
 assert.equal(p.gameId,undefined);
 const b=resolveArchivedGameIdentity({...p,team:"OTT",matchup:"@ ANA Sun 8:00pm"},schedule);
 assert.equal(b.prop.gameId,2026020231);
});
test("recovers Mon 9pm abbreviated San Jose team only if official Eastern time agrees",()=>{
 const schedule=[{id:2026020235,home:"SJS",away:"CGY",startTimeUTC:"2026-11-03T02:00:00Z"}];
 const p={playerId:8484154,team:"CGY",matchup:"@ SJ Mon 9:00pm",capturedAt:"2026-11-02T01:00:29Z"};
 const r=resolveArchivedGameIdentity(p,schedule);
 assert.equal(r.status,"recovered_from_archived_matchup_and_official_schedule");
 assert.equal(r.prop.gameId,2026020235);
 const wrongTime=resolveArchivedGameIdentity({...p,matchup:"@ SJ Mon 8:00pm"},schedule);
 assert.equal(wrongTime.prop.gameId,undefined);
});
test("rejects archived home/away contradiction rather than relabeling it",()=>{
 const schedule=[{id:2026020231,home:"ANA",away:"OTT",startTimeUTC:"2026-11-02T01:00:00Z"}];
 const p={playerId:8481596,team:"OTT",matchup:"vs ANA",capturedAt:"2026-11-01T22:28:23Z"};
 const r=resolveArchivedGameIdentity(p,schedule);
 assert.equal(r.status,"archived_matchup_venue_conflict");
 assert.equal(r.prop.gameId,undefined);
});
test("rejects post-puck-drop source captures and ambiguous original @/vs opponents",()=>{
 const g={id:2026020227,home:"CAR",away:"WPG",startTimeUTC:"2026-11-01T18:00:00Z"};
 const p={playerId:8480336,team:"CAR",matchup:"vs WPG",capturedAt:"2026-11-01T18:01:15Z"};
 assert.equal(resolveArchivedGameIdentity(p,[g]).status,"matchup_source_capture_after_game_start");
 assert.equal(resolveArchivedGameIdentity(p,[g]).prop.gameId,undefined);
 const before={...p,capturedAt:"2026-11-01T17:00:00Z"};
 assert.equal(resolveArchivedGameIdentity(before,[g,{...g,id:2026021234,startTimeUTC:"2026-11-01T20:00:00Z"}]).status,"ambiguous_archived_matchup_schedule");
});

test("audits all 64 archived exceptions without upgrading late snapshots",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const {validArchiveChronology}=require("../src/grade-nhl-predictions.cjs");
 const root=path.resolve(__dirname,"..");
 const schedule=JSON.parse(fs.readFileSync(path.join(root,"outputs/official-nhl/season-schedules/2026-27.json"),"utf8")).games;
 const examples=[
  ["20261101T222824Z.json","2026-11-01T22:28:24Z"],
  ["20261102T010030Z.json","2026-11-02T01:00:30Z"]
 ];
 let rescued=0,eligible=0,lateArchive=0,lateCapture=0,venueConflict=0;
 for(const [name,commitAt] of examples){
  const doc=JSON.parse(fs.readFileSync(path.join(root,"outputs/research/snapshots",name),"utf8"));
  for(const orig of doc.rankedProps){
   if(Number.isInteger(orig.gameId))continue;
   const r=resolveArchivedGameIdentity(orig,schedule);
   if(r.status==="recovered_from_archived_matchup_and_official_schedule"){
    rescued++;
    if(validArchiveChronology(Date.parse(orig.capturedAt),Date.parse(doc.generatedAt),
      Date.parse(commitAt),Date.parse(r.prop.gameStartAt)))eligible++;
    else lateArchive++;
   }else if(r.status==="matchup_source_capture_after_game_start")lateCapture++;
   else if(r.status==="archived_matchup_venue_conflict")venueConflict++;
   else assert.fail("Unexpected original exception status: "+r.status);
  }
 }
 assert.deepEqual({rescued,eligible,lateArchive,lateCapture,venueConflict},
  {rescued:49,eligible:36,lateArchive:13,lateCapture:14,venueConflict:1});
});
