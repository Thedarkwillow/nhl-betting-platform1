"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {WINDOWS,archiveClosingLines,summarizeResponse,fetchWindow}=require("../scripts/probe-sportsgameodds-historical-nhl.cjs");
const game={eventID:"fixture1",leagueID:"NHL",
 status:{startsAt:"2026-10-29T00:00:00Z",finalized:true},
 teams:{home:{names:{long:"Boston Bruins"}},away:{names:{long:"Vegas Golden Knights"}}},
 players:{player1:{name:"Example Player"}},
 odds:{
  o:{statID:"shots_onGoal",playerID:"player1",periodID:"game",betTypeID:"ou",sideID:"over",
   byBookmaker:{prizepicks:{overUnder:"1.5",closeOverUnder:"2.5",closeOdds:"-110"},
    fanduel:{overUnder:"4.5",closeOverUnder:"3.5",closeOdds:"-120"}}},
  u:{statID:"shots_onGoal",playerID:"player1",periodID:"game",betTypeID:"ou",sideID:"under",
   byBookmaker:{prizepicks:{overUnder:"1.5",closeOverUnder:"2.5",closeOdds:"+100"},
    fanduel:{overUnder:"4.5",closeOverUnder:"3.5",closeOdds:"+100"}}}
 }};
test("uses only documented pregame close field and does not confuse completed-game last price",()=>{
 const x=archiveClosingLines(game,"2026-27");
 assert.equal(x.rows.length,2);
 assert.deepEqual(x.rows.map(x=>x.line).sort(),[2.5,3.5]);
 assert.equal(x.counts.prizepicksBooks,1);
 assert.equal(x.rows[0].tier,"unverified");
 assert.equal(x.rows[0].verifiedProspectivePrediction,false);
});
test("does not create historical offers from completed game's last in-play line",()=>{
 const x=structuredClone(game);
 for(const q of Object.values(x.odds)){
  delete q.byBookmaker.prizepicks.closeOverUnder;
  delete q.byBookmaker.fanduel.closeOverUnder;
 }
 assert.equal(archiveClosingLines(x,"2025-26").rows.length,0);
});
test("rejects unsupported period, team totals and bookmaker-less records",()=>{
 const x=structuredClone(game);
 x.odds.o.periodID="1p";x.odds.u.periodID="1p";
 assert.equal(archiveClosingLines(x,"2026-27").rows.length,0);
 x.odds.o.periodID="game";x.odds.u.periodID="game";
 x.odds.o.playerID="all";x.odds.u.playerID="all";
 assert.equal(archiveClosingLines(x,"2026-27").rows.length,0);
});
test("fetch uses Pro history event-window query, no key in URL",async()=>{
 let captured=null,header=null;
 await fetchWindow(" secret ",WINDOWS[0],async(u,opts)=>{
  captured=u;header=opts.headers;
  return {ok:true,json:async()=>({success:true,data:[]})};
 });
 assert.equal(captured.searchParams.get("finalized"),"true");
 assert.equal(captured.searchParams.get("includeOpenCloseOdds"),"true");
 assert.equal(captured.searchParams.get("startsAfter"),WINDOWS[0].from);
 assert.equal(captured.searchParams.get("startsBefore"),WINDOWS[0].to);
 assert.equal(captured.searchParams.get("limit"),"3");
 assert.ok(!captured.href.includes("secret"));
 assert.equal(header["x-api-key"],"secret");
});
test("reports partial pagination and no inaccurate verified historical claims",()=>{
 const result=summarizeResponse({success:true,data:[game],nextCursor:"more"},
  WINDOWS[2],"2026-11-02T00:00:00Z");
 assert.equal(result.partialWindow,true);
 assert.equal(result.completePagination,false);
 assert.equal(result.hadPrizePicksOddsOnReturnedEvents,true);
 assert.equal(result.closingLines[0].verifiedPrizePicksOriginalOffer,false);
});
