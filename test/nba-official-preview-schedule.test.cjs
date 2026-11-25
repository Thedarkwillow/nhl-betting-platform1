"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {collect,espnGames,previewLinks}=require("../scripts/nba-official-preview-schedule.cjs");
const date="2026-11-25",at="2026-11-25T13:00:00Z",route="/game/mia-vs-phi-0022600055",start="2026-11-25T22:00:00Z";
const event={id:"123",competitions:[{date:start,status:{type:{name:"STATUS_SCHEDULED",state:"pre",completed:false}},competitors:[{homeAway:"home",team:{abbreviation:"PHI"}},{homeAway:"away",team:{abbreviation:"MIA"}}]}]};
function fixture({preview=true,clock="5:00 PM",events=[event]}={}){
 return async url=>({ok:true,text:async()=>url.includes("scoreboard?")?JSON.stringify({events}):url.includes("/games?")?'<a href="'+route+'">'+(preview?"Preview":"Final")+'</a>':'<a href="'+route+'">Summary</a> Wednesday, November 25th, 2026 '+clock+' ET'});
}
test("requires exact official ID, preview, independent scheduled status and page time",async()=>{
 const r=await collect(date,at,fixture(),()=>at);
 assert.equal(r.games.length,1);assert.equal(r.games[0].gameId,22600055);assert.equal(r.games[0].espnEventId,"123");
 assert.equal(r.games[0].status,1);assert.equal(r.paidRequests,0);
 await assert.rejects(collect(date,at,fixture({preview:false}),()=>at),/preview/);
 await assert.rejects(collect(date,at,fixture({clock:"6:00 PM"}),()=>at),/verified/);
 await assert.rejects(collect(date,at,fixture(),()=>start),/expired/);
});
test("completed games and ambiguous opponent pairs cannot be accepted",()=>{
 const done=structuredClone(event);done.competitions[0].status.type={name:"STATUS_FINAL",state:"post",completed:true};
 assert.deepEqual(espnGames({events:[done]},date,at),[]);
 assert.throws(()=>espnGames({events:[event,{...event,id:"124"}]},date,at),/ambiguous/);
 assert.equal(previewLinks('<a href="'+route+'">Final</a>').size,0);
});
