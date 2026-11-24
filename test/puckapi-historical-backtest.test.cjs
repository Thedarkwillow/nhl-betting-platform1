"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {evaluateHistory,summarizeSeasonResults,normalizeOfficialLog}=require("../src/puckapi-historical-backtest.cjs");
const season="2025-26",playerId=8478402,market="player_shots_on_goal";
const game=d=>({gameId:2025020000+d,gameDate:"2025-10-"+String(d).padStart(2,"0"),shots:2,goals:0,assists:0,points:0});
const official={gameLog:Array.from({length:10},(_,i)=>game(i+1))};
const response={player_name:"Connor McDavid",market,games:Array.from({length:10},(_,i)=>({
 game_id:String(game(i+1).gameId),game_date:game(i+1).gameDate,line:1.5,actual:2,books:3})),truncated:false};
const run=(res=response,off=official)=>evaluateHistory({response:res,official:off,season,playerId,market,retrievedAt:"2026-11-01T18:00:00Z"});
test("walk-forward uses only prior official NHL games for historical sportsbook line",()=>{
 const r=run();assert.equal(r.matchedOfficialDecisions,5);
 assert.equal(r.decisions[0].previousGames,5);
 assert.equal(r.decisions[0].correct,true);
 assert.equal(r.decisions[0].providerPrizePicks,false);
});
test("rejects PuckAPI vs NHL result mismatch instead of guessing",()=>{
 const x=structuredClone(response);x.games[7].actual=7;
 const r=run(x);assert.equal(r.exclusions.provider_official_stat_mismatch,1);assert.equal(r.matchedOfficialDecisions,4);
});
test("no training on same-day outcomes or later games",()=>{
 const x=structuredClone(official);x.gameLog.push({...game(11),gameDate:"2025-10-06",shots:100});
 const r=run(response,x);
 assert.equal(r.decisions[0].projection,2);
 const same=structuredClone(official);same.gameLog[0].gameDate="2025-10-06";
 assert.equal(normalizeOfficialLog(same).length,10);
});
test("summary separates 2025-26 from 2026-27 and does not claim PrizePicks",()=>{
 const a=run(),b={...run(),season:"2026-27",decisions:[]};
 const summary=summarizeSeasonResults([a,b]);assert.equal(summary.seasons["2025-26"].samples,5);
 assert.equal(summary.seasons["2026-27"].samples,0);
 assert.equal(summary.prizePicksHistory,false);assert.equal(summary.expectedValue,null);
});
