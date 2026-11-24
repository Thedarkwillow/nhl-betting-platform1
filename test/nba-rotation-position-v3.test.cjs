"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalizeGame,roleSplits,positionDefense,priorPosition,absenceAdjustment,pregameAbsenceCandidate}=require("../src/nba-rotation-position-v3.cjs");
const at="2026-11-24T19:30:00Z";
function fixture(){
 const players=[];
 for(let team=1;team<=2;team++)for(let i=0;i<5;i++)players.push({player_id:String(team*100+i),team_id:String(team),position:["G","G","F","F","C"][i],starter:true,did_not_play:false,minutes:48,pts:20,reb:5,ast:4,tpm:2,fga:14,fta:4,tov:2});
 players.push({player_id:"199",team_id:"1",position:"G",starter:false,did_not_play:true,minutes:null});
 return {data:{game:{game_id:"123",season:2026,season_type:"regular",status:"final",date:"2025-12-01",starts_at:"2025-12-02T00:00:00Z",overtime_periods:0,home:{team_id:"1",abbrev:"DEN",score:100},away:{team_id:"2",abbrev:"BOS",score:100}},team_stats:[{team_id:"1",pts:100,fga:85,fta:20,oreb:10,tov:12},{team_id:"2",pts:100,fga:85,fta:20,oreb:10,tov:12}],players}};
}
test("box score reconciles totals and preserves explicit DNP without zero production",()=>{
 const raw=fixture(),g=normalizeGame(raw,"123",at);
 assert.equal(g.rows.length,11);assert.equal(g.rows.find(x=>x.id==="199").played,false);assert.equal(g.rows.find(x=>x.id==="199").points,undefined);assert.equal(g.completeDnpRosterVerified,false);
 raw.data.players.pop();raw.data.players.pop();assert.throws(()=>normalizeGame(raw,"123",at),/incomplete team box/);
});
function sample(n=12){
 const g=normalizeGame(fixture(),"123",at);
 return Array.from({length:n},(_,i)=>({...g,id:String(i+1000),date:"2025-12-"+String(i+1).padStart(2,"0"),rows:g.rows.map(x=>x.id==="199"?{...x,played:i<6,minutes:i<6?15:null}:x.id==="100"?{...x,minutes:i<6?30:35,usageProxy:i<6?.4:.6}:x)}));
}
test("with and without splits use explicit same-team entries only and historical dates",()=>{
 const a=sample(),s=roleSplits(a,"100","2025-12-20").find(x=>x.teammateId==="199");
 assert.equal(s.with.games,6);assert.equal(s.without.games,6);assert.equal(s.minutesDelta,5);assert.ok(s.minSampleMet);
 assert.equal(roleSplits(a,"100","2025-12-07").find(x=>x.teammateId==="199").minSampleMet,false);
 a[0].rows=a[0].rows.filter(x=>x.id!=="199");assert.equal(roleSplits(a,"100","2025-12-20").find(x=>x.teammateId==="199").with.games,5);
});
test("absence adjustment requires a dated explicit pregame status, not historical DNP",()=>{
 const splits=roleSplits(sample(),"100","2025-12-20"),cut="2025-12-20T23:00:00Z";
 assert.equal(absenceAdjustment(splits,null,cut,"1","100"),null);
 const snapshot={kind:"nba_pregame_availability_v1",observedAt:"2025-12-20T21:00:00Z",rows:[{team:"1",playerId:"199",identityVerified:true,status:"out"}]};
 assert.equal(absenceAdjustment(splits,snapshot,cut,"1","100").minutesDelta,5);
 assert.equal(absenceAdjustment(splits,{...snapshot,observedAt:"2025-12-21T01:00:00Z"},cut,"1","100"),null);
 assert.equal(absenceAdjustment(splits,{...snapshot,rows:[{...snapshot.rows[0],status:"questionable"}]},cut,"1","100"),null);
});
test("position estimates use prior stable positions and coverage gate",()=>{
 const a=sample();assert.equal(priorPosition(a,"100","2025-12-03"),null);assert.deepEqual(priorPosition(a,"100","2025-12-05"),{position:"G",teamId:"1"});
 assert.equal(positionDefense(a,"2025-12-20","BOS","G","points"),null);
 const teams=["ATL","BKN","CHA","CHI","CLE","DAL","DET","HOU"];
 const g=normalizeGame(fixture(),"123",at);
 const b=Array.from({length:20},(_,i)=>({...g,id:String(2000+i),date:"2025-12-"+String(i+1).padStart(2,"0"),teams:{"1":{...g.teams["1"],abbrev:teams[i%8]},"2":{...g.teams["2"],abbrev:i<6?"BOS":teams[(i+1)%8]}}}));
 const x=positionDefense(b,"2025-12-25","BOS","G","points");assert.ok(x);assert.equal(x.games,6);assert.equal(x.shrunkRatio,1);assert.equal(x.matchupAssignmentVerified,false);
 assert.equal(positionDefense(b,"2025-12-05","BOS","G","points"),null);
});

test("candidate demands exact game, authorized timestamp and complete explicit roster",()=>{
 const boxes=sample(),target={gameId:"555",date:"2025-12-20"},prior=Array.from({length:12},(_,i)=>({date:"2025-12-"+String(i+1).padStart(2,"0"),minutes:30,points:20}));
 const snap={kind:"nba_pregame_availability_v1",gameIdNamespace:"dunkapi:nba",gameId:"555",gameDate:target.date,targetTeamId:"1",sourceUseAuthorized:true,sourceTimestampVerified:true,completeRosterVerified:true,source:"authorized test fixture",observedAt:"2025-12-20T20:00:00Z",freezeAt:"2025-12-20T22:00:00Z",tipAt:"2025-12-20T23:00:00Z",rows:[{team:"1",playerId:"100",status:"available",identityVerified:true},{team:"1",playerId:"199",status:"out",identityVerified:true}]};
 const call=s=>pregameAbsenceCandidate(boxes,s,target,"100","points",20.5,prior,30);
 assert.equal(call(snap).expectedMinutes,35);assert.ok(call(snap).probability>.5);
 assert.equal(call({...snap,gameId:"556"}),null);assert.equal(call({...snap,sourceUseAuthorized:false}),null);assert.equal(call({...snap,completeRosterVerified:false}),null);assert.equal(call({...snap,freezeAt:"2025-12-20T22:55:00Z"}),null);
});
