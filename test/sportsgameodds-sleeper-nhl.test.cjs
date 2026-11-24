"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseEvent,loadWindow,loadLive,WINDOWS,request}=require("../scripts/collect-sportsgameodds-sleeper-nhl.cjs");
const at="2026-11-02T04:00:00Z";
const fixture={
 leagueID:"NHL",eventID:"NHL1",status:{startsAt:"2026-10-28T23:00:00Z"},
 teams:{home:{names:{long:"Toronto Maple Leafs"}},away:{names:{long:"Boston Bruins"}}},
 players:{P1:{name:"Test Skater"}},
 odds:{
  a:{periodID:"game",betTypeID:"ou",sideID:"over",statID:"shots_onGoal",playerID:"P1",
   byBookmaker:{sleeper:{available:true,overUnder:"4.5",closeOverUnder:"2.5",odds:"-115",closeOdds:"-120",lastUpdatedAt:"2026-10-28T20:00:00Z"}}},
  b:{periodID:"game",betTypeID:"ou",sideID:"under",statID:"shots_onGoal",playerID:"P1",
   byBookmaker:{sleeper:{available:true,overUnder:"4.5",closeOverUnder:"2.5",odds:"-105",closeOdds:"100",lastUpdatedAt:"2026-10-28T20:02:00Z"}}}
 }};
test("historical Sleeper lines use verified provider close field, NEVER latest potentially in-play line",()=>{
 const p=parseEvent(fixture,"historical",at);
 assert.equal(p.hadSleeperQuote,true);
 assert.equal(p.rows.length,1);
 assert.equal(p.rows[0].line,2.5);
 assert.equal(p.rows[0].bookmakerID,"sleeper");
 assert.equal(p.rows[0].sides.length,2);
 assert.equal(p.rows[0].originalPlatformLineVerified,false);
 assert.equal(p.rows[0].originalPregameTimestampVerified,false);
 assert.equal(p.rows[0].tier,"unverified");
});
test("historical older seasons without close field produce no invented offer",()=>{
 const g=structuredClone(fixture);delete g.odds.a.byBookmaker.sleeper.closeOverUnder;
 delete g.odds.b.byBookmaker.sleeper.closeOverUnder;
 const p=parseEvent(g,"historical",at);
 assert.equal(p.rows.length,0);assert.equal(p.issues.noCloseField,2);
});
test("pregame available Sleeper lines retain observed time and two directions when present",()=>{
 const p=parseEvent(fixture,"live","2026-10-28T20:05:00Z");
 assert.equal(p.rows.length,1);assert.equal(p.rows[0].line,4.5);
 assert.equal(p.rows[0].observedAt,"2026-10-28T20:02:00Z");
 assert.equal(p.rows[0].archiveMode,"live");
 assert.equal(p.rows[0].sides.length,2);
 const started=structuredClone(fixture);started.status.started=true;
 assert.equal(parseEvent(started,"live",at).rows.length,0);
 const stale=structuredClone(fixture);
 stale.odds.a.byBookmaker.sleeper.lastUpdatedAt="2026-10-27T00:00:00Z";
 stale.odds.b.byBookmaker.sleeper.lastUpdatedAt="2026-10-27T00:00:00Z";
 assert.equal(parseEvent(stale,"live","2026-10-28T20:05:00Z").rows.length,0);
});
test("Sleeper cannot be accidentally merged into standard sportsbook payout research",()=>{
 const g=structuredClone(fixture);
 g.odds.a.byBookmaker.prizepicks=g.odds.a.byBookmaker.sleeper;
 g.odds.b.byBookmaker.underdog=g.odds.b.byBookmaker.sleeper;
 const p=parseEvent(g,"historical",at);
 assert.equal(p.rows.length,1);assert.equal(p.rows[0].platform,"Sleeper");
});
test("keeps authenticated key out of URL and requests Sleeper exclusively",async()=>{
 let uri,header;
 const response=await request("not-a-real-key",{leagueID:"NHL",limit:"2"},async(u,opts)=>{
  uri=u;header=opts.headers["x-api-key"];
  return {ok:true,json:async()=>({success:true,data:[]})};
 });
 assert.equal(response.data.length,0);
 assert.equal(uri.searchParams.get("bookmakerID"),"sleeper");
 assert.equal(header,"not-a-real-key");assert.ok(!uri.href.includes("not-a-real-key"));
});
test("historical pagination tracks event uniqueness and incomplete coverage accurately",async()=>{
 const window={...WINDOWS.find(x=>x.season==="2026-27"&&x.from.startsWith("2026-10-28"))};
 let page=0;
 const r=await loadWindow("demo",window,{at,fetcher:async()=>({
  ok:true,json:async()=>({success:true,data:[fixture],nextCursor:++page===1?"page2":null})
 })});
 assert.equal(r.gamesReturned,1);assert.equal(r.closingLineRecords,1);
 assert.equal(r.paginationComplete,true);
 assert.equal(r.pagesFetched,2);
 assert.equal(r.distinctEventsWithClose,1);
 assert.equal(r.rows[0].season,"2026-27");
});
test("live source is pregame-only and does not fake complete coverage when paginated",async()=>{
 const g=structuredClone(fixture);
 g.status.startsAt="2026-11-03T23:00:00Z";
 for(const odd of Object.values(g.odds))odd.byBookmaker.sleeper.lastUpdatedAt="2026-11-02T03:58:00Z";
 const r=await loadLive("demo",{at,fetcher:async()=>({
  ok:true,json:async()=>({success:true,data:[g],nextCursor:"next"})
 })});
 assert.equal(r.liveLineRecords,1);assert.equal(r.paginationComplete,false);
 assert.equal(r.officialSleeperBoardVerified,false);
});
