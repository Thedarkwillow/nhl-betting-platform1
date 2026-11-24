"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {retrieveWindow,archiveWindow,WINDOWS}=require("../scripts/backfill-sportsgameodds-nhl-closes.cjs");
const win=WINDOWS[1];
function game(i=1){
 return {eventID:"e"+i,leagueID:"NHL",
  status:{startsAt:win.from},
  teams:{home:{names:{long:"Boston Bruins"}},away:{names:{long:"Vegas Golden Knights"}}},
  players:{"P1":{name:"Example Skater"}},
  odds:{over:{statID:"shots_onGoal",playerID:"P1",betTypeID:"ou",periodID:"game",
   sideID:"over",byBookmaker:{prizepicks:{closeOverUnder:"2.5",closeOdds:"-110",overUnder:"0.5"}}},
   under:{statID:"shots_onGoal",playerID:"P1",betTypeID:"ou",periodID:"game",
   sideID:"under",byBookmaker:{prizepicks:{closeOverUnder:"2.5",closeOdds:"-110",overUnder:"0.5"}}}}};
}
test("paginates and removes duplicate fixture IDs, but does not misreport coverage",async()=>{
 const pages=[];
 const r=await retrieveWindow("dummy",win,{delay:async()=>{},budget:{calls:0},fetcher:async(u,opts)=>{
  pages.push(u.searchParams.get("cursor"));
  assert.ok(!u.href.includes("dummy"));
  assert.equal(opts.headers["x-api-key"],"dummy");
  return {ok:true,json:async()=>({success:true,
   nextCursor:pages.length===1?"next":null,data:pages.length===1?[game(1)]:[game(1),game(2)]})};
 }});
 assert.equal(r.events.length,2);
 assert.equal(r.paginationComplete,true);
 assert.deepEqual(pages,[null,"next"]);
});
test("marks incomplete pagination as partial",async()=>{
 let calls=0;
 const r=await retrieveWindow("dummy",win,{delay:async()=>{},budget:{calls:0},
  fetcher:async()=>({ok:true,json:async()=>({success:true,nextCursor:"still-more-"+(++calls),data:[game(1)]})})});
 assert.equal(r.events.length,1);
 assert.equal(r.paginationComplete,false);
});
test("normalizes only provider CLOSE field, never last postgame market odds",()=>{
 const d=archiveWindow(win,[game(1),game(1)],{pages:1,paginationComplete:false},"2026-11-02T00:00:00Z");
 assert.equal(d.prizepicks,1);
 assert.equal(d.rows[0].line,2.5);
 assert.equal(d.rows[0].verifiedPrizePicksOriginalOffer,false);
 assert.equal(d.modelPredictionBacktested,false);
});
test("historical error fails without fabricated records",async()=>{
 await assert.rejects(()=>retrieveWindow("dummy",win,{budget:{calls:0},
  fetcher:async()=>({ok:false,status:403})}),/HTTP 403/);
});
