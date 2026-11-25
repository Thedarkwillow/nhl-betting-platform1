"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {links,pageTime,validateProvider,corroborate}=require("../scripts/nba-public-schedule-corroboration.cjs");
const url="https://www.nba.com/game/mia-vs-phi-0022600055",at="2026-11-25T08:00:00Z",start="2026-11-25T22:00:00Z";
const html='<link rel="canonical" href="'+url+'"><p>Wednesday, November 25th, 2026 <b>5:00 PM ET</b></p>';
const provider={kind:"nba_bdl_daily_schedule_v1",source:"BALLDONTLIE",date:"2026-11-25",completePagination:true,capturedAt:at,rows:[{providerGameId:"42",gameIdNamespace:"balldontlie:nba",away:"MIA",home:"PHI",status:"scheduled",startAt:start}]};
test("explicit official game clock matches alternate provider time in ET",()=>{
 assert.equal(pageTime(html,start,url),true);
 assert.equal(pageTime(html,"2026-11-25T23:00:00Z",url),false);
 assert.equal(pageTime(html.replace(url,"https://www.nba.com/game/other"),start,url),false);
 assert.equal(pageTime(html+"<p>Wednesday, November 25th, 2026 6:00 PM ET</p>",start,url),false);
 assert.equal(links(url).get("MIA@PHI").size,1);
});
test("invalid clocks, duplicate team match, and non-scheduled provider records fail closed",()=>{
 assert.equal(validateProvider(provider,"2026-11-25",at).length,1);
 assert.throws(()=>validateProvider({...provider,rows:[...provider.rows,...provider.rows]},"2026-11-25",at));
 assert.throws(()=>validateProvider({...provider,rows:[{...provider.rows[0],status:"postponed"}]},"2026-11-25",at));
 assert.throws(()=>validateProvider(provider,"2026-11-25","2026-11-25T22:00:00Z"));
});
test("matched clock is not official status evidence; access refusal stops",async()=>{
 let n=0;const x=await corroborate(provider,at,url,async()=>{n++;return new Response(html)});
 assert.equal(n,1);assert.equal(x.matches.length,1);assert.equal(x.matches[0].officialStatusIndependentlyVerified,false);
 const y=await corroborate(provider,at,url,async()=>new Response("",{status:403}));
 assert.equal(y.matches.length,0);assert.equal(y.excluded.sourceUnavailable,1);
});
