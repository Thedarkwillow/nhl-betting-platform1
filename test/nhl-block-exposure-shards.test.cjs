"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {collectGame,shardName}=require("../scripts/collect-nhl-block-exposure-shards.cjs");
const gameId=2026020123,day="2026-11-15";
const players=[
 ...Array.from({length:13},(_,i)=>({gameId,gameDate:day,
  playerId:i+1,type:"skater",gameState:"FINAL",team:"NYR",
  timeOnIceSeconds:100,shotsOnGoal:i===0?1:0})),
 ...Array.from({length:13},(_,i)=>({gameId,gameDate:day,
  playerId:i+101,type:"skater",gameState:"FINAL",team:"BOS",
  timeOnIceSeconds:100,shotsOnGoal:i===0?1:0}))
];
const e=(eventId,typeDescKey,team)=>({
 eventId,typeDescKey,periodDescriptor:{number:1,periodType:"REG"},
 details:{eventOwnerTeamId:team}
});
const pbp={id:gameId,gameState:"FINAL",gameDate:day,
 homeTeam:{id:1,abbrev:"NYR",sog:1},awayTeam:{id:2,abbrev:"BOS",sog:1},
 plays:[
  ...Array.from({length:3},(_,i)=>({eventId:100+i,
   typeDescKey:"period-end",periodDescriptor:{number:i+1,periodType:"REG"}})),
  e(1,"shot-on-goal",1),e(2,"shot-on-goal",2),
  e(3,"missed-shot",1),e(4,"blocked-shot",2)]};
test("game-scoped source accepts complete opponent attempts despite absent zone starts",async()=>{
 const c={day,gameId,players};
 const a1=await collectGame(c,{pbp:async()=>pbp,shifts:async()=>[]});
 a.equal(a1.attemptRows.length,26);
 a.equal(a1.zoneRows.length,0);
 a.equal(a1.verifiedShotAttemptGames,1);
 a.equal(a1.verifiedZoneStartGames,0);
 a.equal(a1.pastResultOnly,true);
 a.equal(shardName(c),"2026-11-15__2026020123.json");
});
test("identity or official final shot discrepancy fails closed",async()=>{
 const c={day,gameId,players};
 await a.rejects(()=>collectGame(c,{pbp:async()=>({...pbp,id:gameId+1}),
  shifts:async()=>[]}),/identity/);
 await a.rejects(()=>collectGame(c,{pbp:async()=>({
  ...pbp,homeTeam:{...pbp.homeTeam,sog:2}}),shifts:async()=>[]}),
  /Neither opponent attempts nor defensive starts/);
});
