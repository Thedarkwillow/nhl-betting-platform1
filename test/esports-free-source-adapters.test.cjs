"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {dotaIndex,dotaDetail,pandaFixture,gridSeries,gridState,collectPanda,collectGrid}=require("../scripts/esports-free-source-adapters.cjs");
const now=Date.parse("2026-11-25T04:00:00Z"),x={match_id:99,start_time:Math.floor(now/1000)-4000,duration:1800,leagueid:1,radiant_team_id:10,dire_team_id:20,radiant_win:true,radiant_score:20,dire_score:10,series_id:123,series_type:1,players:Array.from({length:10},(_,i)=>({account_id:i+1,player_slot:i<5?i:128+i-5,kills:2,deaths:2,assists:3,last_hits:100,hero_id:i+1}))};
test("Dota native series without fabricated ordinal",()=>{
 const r=dotaIndex(x,now);assert.equal(r.providerSeriesId,"123");assert.equal(r.mapOrdinal,null);
 const d=dotaDetail(x,r,now);assert.equal(d.players.length,10);assert.equal(d.players[0].propMatchEligible,false);
 assert.throws(()=>dotaDetail({...x,series_id:124},r,now));
 assert.equal(dotaIndex({...x,start_time:Math.floor(now/1000)},now),null);
});
test("Panda fixture final needs consistent results and no forfeit",()=>{
 const a={id:2,status:"finished",videogame:{slug:"dota-2"},opponents:[10,20].map(id=>({type:"Team",opponent:{id}})),begin_at:"2026-11-25T00:00:00Z",end_at:"2026-11-25T01:00:00Z",winner_id:10,results:[{team_id:10,score:2},{team_id:20,score:0}],forfeit:false};
 assert.equal(pandaFixture(a,"DOTA2",now).providerReportedFinal,true);
 assert.equal(pandaFixture({...a,forfeit:true},"DOTA2",now).providerReportedFinal,false);
 assert.equal(pandaFixture(a,"LOL",now),null);
});
test("GRID provider-native IDs only and final guard",()=>{
 const f=gridSeries({id:"s",title:{nameShortened:"LoL"},startTimeScheduled:"2026-11-25T00:00:00Z",teams:[{baseInfo:{id:"a"}},{baseInfo:{id:"b"}}]});
 const t=[{id:"a",won:true},{id:"b",won:false}],g={id:"s",started:true,finished:true,teams:t,games:[{teams:t.map((q,i)=>({id:q.id,players:Array.from({length:5},(_,j)=>({id:String(i*5+j),kills:1,deaths:2}))}))}]};
 assert.equal(gridState(g,f).games[0].mapOrdinal,null);assert.throws(()=>gridState({...g,finished:false},f));
});
test("credentials alone do not permit restricted usage or charges",async()=>{
 const never=()=>{throw Error("network should not be called")};
 const p=await collectPanda({PANDASCORE_API_KEY:"test"},never),g=await collectGrid({GRID_API_KEY:"test"},never);
 assert.equal(p.report.requests,0);assert.equal(g.report.requests,0);
 assert.equal(p.report.credentialConfigured,true);assert.equal(g.report.credentialConfigured,true);
});
