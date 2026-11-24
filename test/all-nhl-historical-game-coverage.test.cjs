"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {clubsForSeason,normalizeClubSchedule,officialSeason}=require("../scripts/audit-official-nhl-full-game-schedules.cjs");
const {makeWindows,matchOfficial,retrieveWindow,auditWindow,summarizeCoverage,teamCode}
 =require("../scripts/backfill-sportsgameodds-all-nhl-games.cjs");
const now="2026-11-03T13:00:00Z";
const start="2026-10-14T23:00:00Z",fixture={id:2026020120,gameType:2,gameDate:"2026-10-14",
 gameState:"OFF",startTimeUTC:start,homeTeam:{abbrev:"BOS"},awayTeam:{abbrev:"TOR"}};
const scheduled={id:fixture.id,gameType:2,season:"2026-27",finalized:true,startTimeUTC:start,
 home:"BOS",away:"TOR",gameState:"OFF"};
const provider={
 eventID:"sgo_001",leagueID:"NHL",type:"match",
 teams:{home:{names:{long:"Boston Bruins"}},away:{names:{long:"Toronto Maple Leafs"}}},
 status:{startsAt:start,finalized:true},
 players:{P1:{name:"Example Player"}},
 odds:{
  over:{periodID:"game",betTypeID:"ou",sideID:"over",statID:"shots_onGoal",playerID:"P1",
   byBookmaker:{prizepicks:{closeOverUnder:"2.5",overUnder:"6.5"},
    underdog:{closeOverUnder:"3.5",overUnder:"1.5"}}},
  under:{periodID:"game",betTypeID:"ou",sideID:"under",statID:"shots_onGoal",playerID:"P1",
   byBookmaker:{prizepicks:{closeOverUnder:"2.5",overUnder:"6.5"},
    underdog:{closeOverUnder:"3.5",overUnder:"1.5"}}}
 }};
test("official season schedules include exactly 32 teams, including historical Arizona",()=>{
 assert.equal(clubsForSeason("2023-24").length,32);
 assert.ok(clubsForSeason("2023-24").includes("ARI"));
 assert.ok(clubsForSeason("2024-25").includes("UTA"));
 const r=normalizeClubSchedule({games:[fixture,{...fixture,id:9,gameType:1}]},"2026-27");
 assert.equal(r.length,1);assert.equal(r[0].finalized,true);
});
test("official schedule only claims complete if all team schedules succeed",async()=>{
 const clubs=clubsForSeason("2026-27");
 let count=0;
 const r=await officialSeason("2026-27",{teams:clubs,fetcher:async(url)=>{
  assert.match(url,/\/20262027$/);
  count++;return {ok:true,json:async()=>({games:[fixture]})};
 }});
 assert.equal(count,32);assert.equal(r.complete,true);
 assert.equal(r.games.length,1);
 assert.equal(r.finalGames,1);
 const incomplete=await officialSeason("2026-27",{teams:["BOS"],fetcher:async()=>({
  ok:true,json:async()=>({games:[fixture]})})});
 assert.equal(incomplete.complete,false);
});
test("window planner covers all 2025-26 days and completed 2026-27 days with no date gaps",()=>{
 const windows=makeWindows(now);
 for(const season of ["2025-26","2026-27"]){
  const seasonWindows=windows.filter(x=>x.season===season);
  for(let i=1;i<seasonWindows.length;i++)assert.equal(seasonWindows[i-1].to,seasonWindows[i].from);
  assert.equal(seasonWindows[0].from,season==="2025-26"?
   "2026-01-01T00:00:00.000Z":"2026-10-01T00:00:00.000Z");
 }
});
test("official game match requires both actual teams and sufficiently close time",()=>{
 assert.equal(teamCode("Utah Mammoth"),"UTA");
 assert.equal(teamCode("Boston Bruins"),"BOS");
 assert.equal(matchOfficial(provider,[scheduled]).gameId,fixture.id);
 assert.equal(matchOfficial({...provider,teams:{...provider.teams,
  home:{names:{long:"New York Rangers"}}}},[scheduled]).status,"no_official_game_match");
});
test("pagination uses exclusive API boundary with overlap and filters results to exact window",async()=>{
 const from="2026-10-14T00:00:00.000Z",to="2026-10-15T00:00:00.000Z";
 const calls=[];
 const v=await retrieveWindow("dummy",{season:"2026-27",from,to},{budget:{calls:0},fetcher:async(url,options)=>{
  calls.push(url);
  assert.equal(options.headers["x-api-key"],"dummy");
  return {ok:true,json:async()=>({success:true,nextCursor:calls.length===1?"token":null,
   data:[provider,{...provider,eventID:"late",status:{startsAt:to}}]})};
 }});
 assert.equal(v.events.length,1);
 assert.equal(v.pages,2);
 assert.equal(v.complete,true);
 assert.equal(calls[0].searchParams.get("startsAfter"),"2026-10-13T23:59:59.000Z");
 assert.equal(calls[0].searchParams.get("startsBefore"),"2026-10-15T00:00:01.000Z");
 assert.equal(calls[1].searchParams.get("cursor"),"token");
 assert.ok(!calls[0].href.includes("dummy"));
});
test("game coverage counts provider closeOverUnder, not postgame odds or fake tier",()=>{
 const window={season:"2026-27",from:"2026-10-14T00:00:00.000Z",to:"2026-10-15T00:00:00.000Z"};
 const archive=auditWindow(window,{events:[provider],complete:true,pages:1},[scheduled],now);
 assert.equal(archive.providerMatchedOfficialGames,1);
 assert.equal(archive.gamesWithPrizePicksClose,1);
 assert.equal(archive.gamesWithUnderdogClose,1);
 assert.equal(archive.prizepicksClosingLineRecords,1);
 assert.equal(archive.underdogClosingLineRecords,1);
 assert.equal(archive.rows.find(x=>x.book==="prizepicks").line,2.5);
 assert.equal(archive.rows.find(x=>x.book==="underdog").line,3.5);
 assert.equal(archive.rows[0].originalOfferVerified,false);
 assert.equal(archive.rows[0].tier,"unverified");
});
test("missing provider event remains coverage gap, not proof of no available prop",()=>{
 const window={season:"2026-27",from:"2026-10-14T00:00:00.000Z",to:"2026-10-15T00:00:00.000Z"};
 const a=auditWindow(window,{events:[],complete:true,pages:1},[scheduled],now);
 assert.equal(a.games[0].status,"no_provider_event_returned");
 assert.equal(a.prizepicksClosingLineRecords,0);
 assert.throws(()=>auditWindow(window,{events:[],complete:false,pages:1},[scheduled]),/Partial/);
});
test("season coverage deduplicates observed games and excludes unmatched before success",()=>{
 const win={season:"2026-27",from:"2026-10-14T00:00:00.000Z",to:"2026-10-15T00:00:00.000Z"};
 const archive=auditWindow(win,{events:[provider],complete:true,pages:1},[scheduled],now);
 const manifests={"2025-26":{complete:true,finalGames:0,games:[]},
  "2026-27":{complete:true,finalGames:1,games:[scheduled]}};
 const coverage=summarizeCoverage(manifests,[archive,archive],now);
 const r=coverage.bySeason["2026-27"];
 assert.equal(r.completedGamesInsideCheckedWindows,1);
 assert.equal(r.officialGamesWithPrizePicksClosingLines,1);
 assert.equal(r.officialGamesWithUnderdogClosingLines,1);
 assert.equal(r.distinctPrizePicksClosingLineRecords,1);
 assert.equal(r.officialCompletedGamesInEligiblePeriod,1);
 assert.equal(r.allEligibleCompletedGameDatesChecked,true);
 assert.equal(r.allGamesHaveOriginalProviderLinesVerified,false);
});
