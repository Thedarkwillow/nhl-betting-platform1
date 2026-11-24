"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateScoringDay,enrichHistory,enrichBlockHistory,teamGoalOpportunity,ppAssistHistory,blockExposure}=
 require("../src/nhl-strict-official-evidence-v1.cjs");
const day="2026-11-15";
const sample={type:"skater",gameState:"FINAL",gameId:2026020300,playerId:8470001,
 gameDate:day,team:"NYR",goals:1,assists:2,points:3,timeOnIceSeconds:1300,
 powerPlayTimeOnIceSeconds:180,shotsOnGoal:2};
test("explicit official PP totals only; missing and inconsistent totals reject",()=>{
 const ok={data:[{...sample,teamAbbrev:"NYR",ppPoints:2,ppGoals:1}],total:1};
 const x=validateScoringDay(ok,[sample],day);
 assert.equal(x.matched,1);assert.equal(x.rows[0].powerPlayAssists,1);
 assert.equal(validateScoringDay({data:[{...sample,teamAbbrev:"NYR",ppPoints:1}],total:1},[sample],day).matched,0);
 assert.throws(()=>validateScoringDay({data:ok.data,total:2},[sample],day));
 assert.throws(()=>validateScoringDay({data:[...ok.data,...ok.data],total:2},[sample],day));
});
test("exact player game scoring merge; missing source never confers PP certainty",()=>{
 const h={players:{"8470001":{games:[sample]}}};
 const a={kind:"official_nhl_exact_game_pp_scoring_v1",date:day,
 source:"NHL_stats_rest_skater_summary_isGame_exact_official_identity",
 rows:[{...sample,ppGoals:1,ppPoints:2,powerPlayAssists:1}]};
 const v=enrichHistory(h,[a]);
 assert.equal(v.history.players["8470001"].games[0].powerPlayAssists,1);
 assert.equal(h.players["8470001"].games[0].powerPlayAssists,undefined);
 assert.equal(ppAssistHistory(v.history.players["8470001"].games).verified,false);
 const changed=enrichHistory(h,[{...a,rows:[{...a.rows[0],assists:3}]}]);
 assert.equal(changed.counts.rejected,1);
});
test("only ten verified individual official PP games satisfy strict assist gate",()=>{
 const ten=Array.from({length:10},(_,i)=>({...sample,gameId:sample.gameId+i,
  powerPlayAssists:1,powerPlayScoringSource:"NHL_stats_rest_skater_summary_exact_game"}));
 assert.equal(ppAssistHistory(ten).verified,true);
 assert.equal(ppAssistHistory(ten.slice(1)).verified,false);
 assert.equal(ppAssistHistory([{...ten[0],powerPlayScoringSource:"unverified"},...ten.slice(1)]).verified,false);
});
test("opponent attempts and zone starts each independently require full verified history",()=>{
 const g=Array.from({length:10},()=>({...sample,opponentShotAttempts:50,
  opponentShotAttemptSource:"NHL_official_exact_team_attempts_verified",
  defensiveZoneStarts:3,defensiveZoneStartSource:"NHL_official_shift_faceoff_onice_reconciled"}));
 assert.equal(blockExposure(g).opponentShotAttemptsVerified,true);
 assert.equal(blockExposure(g).defensiveZoneStartsVerified,true);
 assert.equal(blockExposure([{...g[0],defensiveZoneStartSource:"approximate"},...g.slice(1)]).defensiveZoneStartsVerified,false);
 assert.equal(blockExposure([sample]).opponentShotAttemptsVerified,false);
});
test("team goal opportunity must be earlier-date full completed official rosters",()=>{
 const players={};
 for(let game=0;game<10;game++)for(let i=0;i<26;i++){
  const id=8470000+i,team=i<13?"NYR":"BOS";
  const g={...sample,playerId:id,gameId:2026020300+game,gameDate:
   "2026-11-"+String(game+1).padStart(2,"0"),team,goals:i===0?1:0,
   assists:0,points:i===0?1:0};
  (players[id]??={games:[]}).games.push(g);
 }
 const h={players};
 assert.equal(teamGoalOpportunity(h,"NYR",day).verified,true);
 assert.equal(teamGoalOpportunity(h,"NYR","2026-11-05").verified,false);
 assert.equal(teamGoalOpportunity(h,"NYR","2026-11-01").verified,false);
});
test("block archive joins the exact official singular source keys, not synthetic flags",()=>{
 const h={players:{"8470001":{games:[sample]}}};
 const archive={kind:"official_nhl_exact_game_block_exposure_v1",date:day,
  source:"NHL_Gamecenter_events_shiftcharts_and_independent_Stats_REST_puckPossessions",
  attemptRows:[{gameId:sample.gameId,playerId:sample.playerId,gameDate:day,
   team:"NYR",opponentShotAttempts:51,
   opponentShotAttemptSource:"NHL_official_exact_team_attempts_verified"}],
  zoneRows:[{gameId:sample.gameId,playerId:sample.playerId,gameDate:day,
   team:"NYR",defensiveZoneStarts:4,
   defensiveZoneStartSource:"NHL_official_shift_faceoff_onice_reconciled"}]};
 const v=enrichBlockHistory(h,[archive]);
 const g=v.history.players["8470001"].games[0];
 assert.equal(v.counts.attemptRows,1);
 assert.equal(v.counts.zoneRows,1);
 assert.equal(g.opponentShotAttempts,51);
 assert.equal(g.defensiveZoneStarts,4);
 assert.equal(h.players["8470001"].games[0].opponentShotAttempts,undefined);
 const bad=enrichBlockHistory(h,[{...archive,zoneRows:[
  {...archive.zoneRows[0],defensiveZoneStartSource:"proxy"}]}]);
 assert.equal(bad.counts.zoneRows,0);
});
