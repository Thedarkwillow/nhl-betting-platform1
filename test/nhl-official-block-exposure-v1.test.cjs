"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {zoneStarts,reconcileAttemptDay,officialTeamAttemptEvidence}=require("../src/nhl-official-block-exposure-v1.cjs");
const mk=(team,id)=>({type:"skater",gameState:"FINAL",gameId:2026020123,
 gameDate:"2026-11-15",team,playerId:id,timeOnIceSeconds:100,shotsOnGoal:0});
test("defensive zone start source fails closed when shift charts are absent",()=>{
 const p={id:2026020123,gameState:"FINAL",homeTeam:{id:1,abbrev:"NYR"},
  awayTeam:{id:2,abbrev:"BOS"},plays:[]};
 assert.notEqual(zoneStarts(p,[],[...Array.from({length:12},(_,i)=>mk("NYR",i+1)),
  ...Array.from({length:12},(_,i)=>mk("BOS",i+101))]).status,"source_verified_completed_game");
});
test("independent attempt join refuses unverified or incomplete player totals",()=>{
 const skaters=[...Array.from({length:13},(_,i)=>mk("NYR",i+1)),
  ...Array.from({length:13},(_,i)=>mk("BOS",i+101))];
 const attempts=skaters.map(x=>({...x,shotAttempts:2}));
 const puck={total:skaters.length,data:skaters.map(x=>({
  gameId:x.gameId,playerId:x.playerId,shotAttempts:2}))};
 assert.equal(reconcileAttemptDay(puck,skaters,attempts,"2026-11-15").verifiedGames.length,1);
 const altered={...puck,data:puck.data.map((x,i)=>i===0?{...x,shotAttempts:3}:x)};
 assert.equal(reconcileAttemptDay(altered,skaters,attempts,"2026-11-15").verifiedGames.length,0);
 assert.throws(()=>reconcileAttemptDay({...puck,total:1},skaters,attempts,"2026-11-15"));
});
test("zone starts are rejected if even a single original roster shift has no TOI reconciliation",()=>{
 const skaters=[...Array.from({length:13},(_,i)=>mk("NYR",i+1)),
  ...Array.from({length:13},(_,i)=>mk("BOS",i+101))];
 const p={id:2026020123,gameState:"FINAL",homeTeam:{id:1,abbrev:"NYR"},
  awayTeam:{id:2,abbrev:"BOS"},plays:[]};
 const shifts=skaters.slice(1).map((x,i)=>({id:1000+i,gameId:p.id,playerId:x.playerId,
  typeCode:517,period:1,startTime:"00:00",endTime:"01:40",duration:"01:40"}));
 assert.equal(zoneStarts(p,shifts,skaters).status,"shift_total_or_roster_coverage_unverified");
});
test("official PBP team attempts require both final Gamecenter and independently archived team SOG to reconcile",()=>{
 const players=[...Array.from({length:13},(_,i)=>({...mk("NYR",i+1),shotsOnGoal:i===0?1:0})),
  ...Array.from({length:13},(_,i)=>({...mk("BOS",i+101),shotsOnGoal:i===0?1:0}))];
 const shot=(id,type,owner)=>({eventId:id,typeDescKey:type,
  periodDescriptor:{number:1,periodType:"REG"},details:{eventOwnerTeamId:owner}});
 const pbp={id:2026020123,gameState:"FINAL",gameDate:"2026-11-15",
  homeTeam:{id:1,abbrev:"NYR",sog:1},awayTeam:{id:2,abbrev:"BOS",sog:1},
  plays:[...Array.from({length:3},(_,i)=>({eventId:100+i,typeDescKey:"period-end",
   periodDescriptor:{number:i+1,periodType:"REG"}})),
   shot(1,"shot-on-goal",1),shot(2,"shot-on-goal",2),
   shot(3,"missed-shot",1),shot(4,"blocked-shot",2)]};
 const verified=officialTeamAttemptEvidence(pbp,players);
 assert.equal(verified.status,"source_verified_final_official_team_attempts");
 assert.equal(verified.rows.length,26);
 assert.equal(verified.rows.find(p=>p.team==="NYR").opponentShotAttempts,2);
 assert.equal(verified.rows.find(p=>p.team==="BOS").opponentShotAttempts,2);
 assert.equal(officialTeamAttemptEvidence({...pbp,homeTeam:{...pbp.homeTeam,sog:2}},players).rows.length,0);
 assert.equal(officialTeamAttemptEvidence({...pbp,plays:[...pbp.plays,shot(5,"blocked-shot",404)]},players).rows.length,0);
 assert.equal(officialTeamAttemptEvidence({...pbp,plays:pbp.plays.slice(1)},players).rows.length,0);
});
test("reconciled official SOG-conceded values are stored separately from attempt exposure",()=>{
 const players=[...Array.from({length:13},(_,i)=>({...mk("NYR",i+1),shotsOnGoal:i===0?1:0})),
  ...Array.from({length:13},(_,i)=>({...mk("BOS",i+101),shotsOnGoal:i===0?1:0}))];
 const e=(eventId,typeDescKey,eventOwnerTeamId)=>({eventId,typeDescKey,
  periodDescriptor:{number:1,periodType:"REG"},details:{eventOwnerTeamId}});
 const pbp={id:2026020123,gameDate:"2026-11-15",gameState:"FINAL",
  homeTeam:{id:1,abbrev:"NYR",sog:1},awayTeam:{id:2,abbrev:"BOS",sog:1},
  plays:[...[1,2,3].map(n=>({eventId:100+n,typeDescKey:"period-end",
   periodDescriptor:{number:n,periodType:"REG"}})),
   e(1,"shot-on-goal",1),e(2,"shot-on-goal",2),
   e(3,"missed-shot",1),e(4,"blocked-shot",2)]};
 const v=officialTeamAttemptEvidence(pbp,players);
 assert.equal(v.opponentSogConcessionVerified,true);
 assert.equal(v.opponentScoringConcessionsVerified,false);
 assert.equal(v.rows[0].opponentShotsOnGoal,1);
 assert.equal(v.rows[0].opponentShotAttempts,2);
 assert.equal(v.rows[0].opponentTeamPoints,undefined);
});
test("scoring concessions require exact skater goal/assist and Gamecenter reconciliation",()=>{
 const players=[...Array.from({length:13},(_,i)=>({...mk("NYR",i+1),
  shotsOnGoal:i===0?1:0,goals:i===0?1:0,assists:0,points:i===0?1:0})),
  ...Array.from({length:13},(_,i)=>({...mk("BOS",i+101),
  shotsOnGoal:i===0?1:0,goals:i===0?1:0,assists:0,points:i===0?1:0}))];
 const pbp={id:2026020123,gameDate:"2026-11-15",gameState:"FINAL",
  homeTeam:{id:1,abbrev:"NYR",sog:1,score:1},
  awayTeam:{id:2,abbrev:"BOS",sog:1,score:1},
  plays:[...[1,2,3].map(n=>({eventId:100+n,typeDescKey:"period-end",
   periodDescriptor:{number:n,periodType:"REG"}})),
   ...[1,2].map(n=>({eventId:n,typeDescKey:"goal",
    periodDescriptor:{number:1,periodType:"REG"},details:{eventOwnerTeamId:n}}))]};
 const v=officialTeamAttemptEvidence(pbp,players);
 assert.equal(v.opponentScoringConcessionsVerified,true);
 assert.equal(v.rows[0].opponentTeamPoints,1);
 assert.equal(v.rows[0].opponentTeamAssists,0);
 assert.equal(officialTeamAttemptEvidence({...pbp,homeTeam:{...pbp.homeTeam,score:2}},players)
  .opponentScoringConcessionsVerified,false);
});
