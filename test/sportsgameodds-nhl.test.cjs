"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {american,extractQuotes,analyzeResponse,fetchOne}=require("../scripts/collect-sportsgameodds-nhl.cjs");
const at="2026-11-02T01:00:00Z";
const core={leagueID:"NHL",eventID:"game1",
 status:{startsAt:"2026-11-03T01:00:00Z",started:false,live:false},
 teams:{home:{names:{long:"Boston Bruins"}},away:{names:{long:"Toronto Maple Leafs"}}},
 players:{P1:{name:"Example Player"}},
 odds:{
  o:{statID:"shots_onGoal",playerID:"P1",periodID:"game",betTypeID:"ou",sideID:"over",
   byBookmaker:{fanduel:{available:true,overUnder:"2.5",odds:"-120",lastUpdatedAt:"2026-11-02T00:58:00Z"}}},
  u:{statID:"shots_onGoal",playerID:"P1",periodID:"game",betTypeID:"ou",sideID:"under",
   byBookmaker:{fanduel:{available:true,overUnder:"2.5",odds:"+100",lastUpdatedAt:"2026-11-02T00:57:00Z"}}}
 }};
test("extracts exactly matching paired NHL player odds, with timestamps",()=>{
 const r=extractQuotes(core,at);
 assert.equal(r.quotes.length,1);
 assert.equal(r.quotes[0].market,"shotsOnGoal");
 assert.equal(r.quotes[0].overOdds,-120);
 assert.equal(r.quotes[0].underOdds,100);
 assert.equal(r.quotes[0].providerPlayerId,"P1");
 assert.equal(r.quotes[0].book,"FanDuel");
});
test("rejects mismatched line, unavailable or stale quote, in-game odds",()=>{
 const changed=structuredClone(core);changed.odds.u.byBookmaker.fanduel.overUnder="3.5";
 assert.equal(extractQuotes(changed,at).quotes.length,0);
 const unavailable=structuredClone(core);unavailable.odds.u.byBookmaker.fanduel.available=false;
 assert.equal(extractQuotes(unavailable,at).quotes.length,0);
 const stale=structuredClone(core);stale.odds.u.byBookmaker.fanduel.lastUpdatedAt="2026-11-01T00:00:00Z";
 assert.equal(extractQuotes(stale,at).quotes.length,0);
 const live=structuredClone(core);live.status.started=true;
 assert.equal(extractQuotes(live,at).quotes.length,0);
});
test("correct NHL stat mapping distinguishes goals from points and team totals",()=>{
 const a=structuredClone(core);
 a.odds.o.statID=a.odds.u.statID="points";
 assert.equal(extractQuotes(a,at).quotes[0].market,"goals");
 a.odds.o.statID=a.odds.u.statID="goals+assists";
 assert.equal(extractQuotes(a,at).quotes[0].market,"points");
 a.odds.o.playerID=a.odds.u.playerID="all";
 assert.equal(extractQuotes(a,at).quotes.length,0);
});
test("rejects non-American odds, missing two sides and changes in-game",()=>{
 assert.equal(american("-110"),-110);
 assert.equal(american("+125"),125);
 assert.equal(american("1.91"),null);
 assert.equal(american(0),null);
 const a=structuredClone(core);a.odds.o.byBookmaker.fanduel.odds="1.91";
 assert.equal(extractQuotes(a,at).quotes.length,0);
});
test("one-request key safely stays in header only and no historical request",async()=>{
 let called=0,headers=null,href=null;
 const payload=await fetchOne("fake-secret",async(url,opts)=>{
  called++;headers=opts.headers;href=url.toString();
  return {ok:true,json:async()=>({success:true,data:[],nextCursor:null})};
 });
 assert.equal(called,1);assert.equal(headers["x-api-key"],"fake-secret");
 assert.ok(!href.includes("fake-secret"));assert.ok(href.includes("bookmakerID"));
 assert.ok(!href.includes("finalized=true"));assert.ok(!href.includes("startsAfter"));
 const r=analyzeResponse(payload,at);
 assert.equal(r.historicalDataTested,false);
 assert.equal(r.pairedQuotes,0);
});
test("a malformed response is not treated as an empty successful archive",()=>{
 assert.throws(()=>analyzeResponse({success:false,data:[]},at),/Unexpected/);
});
