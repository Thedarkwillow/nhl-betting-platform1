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

test("GRID four-title identities and provider-native maps never imply independent settlement",()=>{
 const base={id:"series",startTimeScheduled:"2026-11-25T00:00:00Z",teams:[{baseInfo:{id:"a",name:"A"}},{baseInfo:{id:"b",name:"B"}}]};
 for(const [name,title] of [["CS2","CS2"],["Counter-Strike 2","CS2"],["Dota 2","DOTA2"],["LoL","LOL"],["Valorant","VALORANT"]]){
  const f=gridSeries({...base,title:{id:"1",nameShortened:name}});assert.equal(f.title,title);assert.deepEqual(f.teamNames,["A","B"]);
 }
 assert.equal(gridSeries({...base,title:{nameShortened:"COD"}}),null);
 const f=gridSeries({...base,title:{nameShortened:"CS2"}}),teams=[{id:"a",won:true},{id:"b",won:false}];
 const game={id:"g1",sequenceNumber:1,started:true,finished:true,teams:teams.map((t,i)=>({...t,players:Array.from({length:5},(_,j)=>({id:String(i*5+j),name:"player"+(i*5+j),kills:2,deaths:1}))}))};
 const series={id:"series",valid:true,started:true,finished:true,teams,games:[game]};
 const g=gridState(series,f).games[0];
 assert.equal(g.providerMapOrdinal,1);assert.equal(g.providerReportedGameFinal,true);assert.equal(g.providerWinnerTeamId,"a");assert.equal(g.players[0].providerPlayerName,"player0");
 assert.equal(g.mapOrdinal,null);assert.equal(g.individualGameFinalVerified,false);assert.equal(gridState(series,f).originalOfferMatched,false);
 assert.equal(gridState({...series,games:[{...game,finished:false}]},f).games[0].providerReportedGameFinal,false);
 assert.throws(()=>gridState({...series,valid:false},f));
 assert.throws(()=>gridState({...series,games:[game,{...game,id:"g2"}]},f));
 assert.throws(()=>gridState({...series,games:[{...game,sequenceNumber:2}]},f));
 assert.throws(()=>gridState({...series,games:[game,{...game,sequenceNumber:2}]},f));
});
test("GRID permission alone still preserves zero-charge gate",async()=>{
 const g=await collectGrid({GRID_API_KEY:"test",GRID_BETTING_DATA_AUTHORIZED:"1"},()=>{throw Error("must not call");});
 assert.equal(g.report.requests,0);assert.equal(g.report.authorizedNoCharge,false);
});
