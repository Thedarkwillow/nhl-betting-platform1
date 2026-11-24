"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseToi,parseGoalieSaves,normalizeOfficialUsage,buildUsageIndex,assessPlayerUsage,assessPropRisk}=require("../src/nhl-usage-goalie.cjs");
const {optimize}=require("../src/nhl-lineup-optimizer.cjs");
const date=i=>"2026-10-"+String(i+1).padStart(2,"0");
test("official NHL TOI is minutes:seconds, not decimal minutes, and invalid formats fail closed",()=>{
 assert.equal(parseToi("18:42"),1122);assert.equal(parseToi("59:59"),3599);
 assert.equal(parseToi("18:60"),null);assert.equal(parseToi("17.5"),null);
 assert.equal(parseToi(null),null);assert.equal(parseToi("65:01"),null);
});
test("saves/shots extract only valid source official goalie fields without inference",()=>{
 assert.equal(parseGoalieSaves({saveShotsAgainst:"29/32"}),29);
 assert.equal(parseGoalieSaves({saveShotsAgainst:"29/28"}),null);
 assert.equal(parseGoalieSaves({saves:31,saveShotsAgainst:"29/32"}),31);
 assert.equal(parseGoalieSaves({saveShotsAgainst:"bad"}),null);
});
test("official final boxscore usage archive preserves missing fields and never infers starter",()=>{
 const b={id:2026020001,gameDate:"2026-10-13",gameState:"OFF",
  homeTeam:{abbrev:"BOS"},awayTeam:{abbrev:"NYR"},
  playerByGameStats:{homeTeam:{forwards:[{playerId:1,toi:"19:23",sog:3}],defense:[],
    goalies:[{playerId:2,toi:"59:23",saveShotsAgainst:"27/29"}]},
   awayTeam:{forwards:[],defense:[],goalies:[{playerId:3,toi:null,saves:0,starter:false}]}}};
 const v=normalizeOfficialUsage(b);
 assert.equal(v.length,3);
 assert.equal(v.find(x=>x.playerId===1).timeOnIceSeconds,1163);
 assert.equal(v.find(x=>x.playerId===2).saves,27);
 assert.equal(v.find(x=>x.playerId===2).started,null);
 assert.equal(v.find(x=>x.playerId===3).timeOnIceSeconds,null);
 assert.equal(v.find(x=>x.playerId===3).started,false);
 assert.throws(()=>normalizeOfficialUsage({...b,gameState:"LIVE"}),/Incomplete/);
 assert.throws(()=>normalizeOfficialUsage({...b,playerByGameStats:{...b.playerByGameStats,
  awayTeam:{forwards:[{playerId:2}],defense:[],goalies:[]}}}),/Duplicate official player/);
});
const mk=(id,toi,market="goalie")=>({gameDate:date(id-1),gameId:2026020000+id,playerId:1,
 type:market,timeOnIceSeconds:toi,started:market==="goalie"?true:null,saves:market==="goalie"?30:null});
test("same-day and future actual minutes cannot leak into a research forecast",()=>{
 const rows=Array.from({length:8},(_,i)=>mk(i+1,3500));
 const index=buildUsageIndex([{rows,errors:[],complete:true}]);
 const early=assessPlayerUsage({playerId:1,type:"goalie"},index,"2026-10-08T00:00:00Z");
 const late=assessPlayerUsage({playerId:1,type:"goalie"},index,"2026-10-09T00:00:00Z");
 assert.equal(early.observations,7);
 assert.equal(late.observations,8);
 assert.equal(early.goalieGamesWithRate,7);
 assert.equal(early.pregameStartConfirmed,false);
 assert.equal(early.modelReadyForDeployment,false);
 assert.throws(()=>buildUsageIndex([{rows:[rows[0],rows[0]],errors:[],complete:true}]),/Repeated/);
});
test("unknown pregame goalie starter always stays watchlist despite healthy prior usage",()=>{
 const rows=Array.from({length:8},(_,i)=>mk(i+1,3590));
 const index=buildUsageIndex([{rows,errors:[],complete:true}]);
 const risk=assessPropRisk({playerId:1,type:"goalie"},index,"2026-10-10T02:00:00Z","saves");
 assert.equal(risk.classification,"watchlist");
 assert.ok(risk.reasons.includes("STARTING_GOALIE_NOT_CONFIRMED"));
 assert.equal(risk.injuryStatus,"unknown");
 const a=[{playerId:1,matchup:"BOS @ NYR",tier:"Standard",lean:"Higher",probability:.9,
  researchEligibility:risk.classification,roleEvidence:risk},
  {playerId:2,matchup:"PHI @ DAL",tier:"Standard",lean:"Lower",probability:.65},
  {playerId:3,matchup:"SEA @ ANA",tier:"Standard",lean:"Higher",probability:.62}];
 const lineup=optimize(a);
 assert.equal(lineup[2].picks.length,2);
 assert.equal(lineup[2].picks.some(x=>x.playerId===1),false);
});
test("rapid skater minutes change is an explainable watchlist signal only",()=>{
 const rows=Array.from({length:10},(_,i)=>mk(i+1,i>=6?1800:600,"skater"));
 const index=buildUsageIndex([{rows,errors:[],complete:true}]);
 const risk=assessPropRisk({playerId:1,type:"skater"},index,"2026-10-13T02:00:00Z","shotsOnGoal");
 assert.equal(risk.classification,"watchlist");
 assert.ok(risk.reasons.includes("RECENT_ICE_TIME_SHIFT_REVIEW"));
 assert.equal(risk.usage.modelReadyForDeployment,false);
});
