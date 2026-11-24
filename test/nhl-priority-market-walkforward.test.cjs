"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runOfficialMarketWalkforward}=require("../src/nhl-priority-market-walkforward.cjs");
const game=(day,id,hits)=>({gameDate:day,gameId:id,hits,faceoffsWon:hits+2,
 shotsOnGoal:hits+1,timeOnIceSeconds:1000+hits*25});
test("2026-27 strict prior-date holdout estimates errors without future leakage",()=>{
 const old=Array.from({length:9},(_,i)=>game(
  "2025-10-"+String(i+10),1000+i,i%3));
 const holdout=game("2026-10-15",2000,4);
 const report=runOfficialMarketWalkforward({players:{
  "1":{playerId:1,type:"skater",games:[holdout,...old]}
 }});
 const hits=report.markets.hits;
 assert.equal(hits.scoredPlayerGames,1);
 assert.equal(hits.distinctOfficialGames,1);
 assert.equal(hits.players,1);
 assert.ok(Number.isFinite(hits.last5MeanAbsoluteError));
 assert.ok(Number.isFinite(hits.last10MeanAbsoluteError));
 assert.equal(hits.originalPlatformQuoteLinesScored,0);
 assert.equal(hits.eligibleForAutomaticModelPromotion,false);
 assert.equal(report.noModelPromoted,true);
});
test("no same-day future-result leakage and only complete official stats are counted",()=>{
 const old=Array.from({length:8},(_,i)=>game("2025-10-"+String(i+10),200+i,1));
 const sameDayA=game("2026-10-20",999,12);
 const sameDayB=game("2026-10-20",1000,0);
 const r=runOfficialMarketWalkforward({players:{
  "9":{playerId:9,type:"skater",games:[...old,sameDayA,sameDayB]}
 }});
 assert.equal(r.markets.hits.scoredPlayerGames,2);
 assert.equal(r.markets.hits.last5MeanAbsoluteError,6);
 assert.equal(r.markets.hits.last10MeanAbsoluteError,6);
});
test("goalie fantasy only evaluates explicit recorded official fields, never fabricated shutouts",()=>{
 const games=Array.from({length:10},(_,i)=>({
  gameDate:"2025-11-"+String(i+10),gameId:2000+i,
  saves:22,goalsAgainst:2,prizePicksGoalieFantasyScore:null}));
 games.push({gameDate:"2026-11-09",gameId:3000,saves:24,goalsAgainst:1,
  prizePicksGoalieFantasyScore:null});
 const score=runOfficialMarketWalkforward({players:{
  "31":{playerId:31,type:"goalie",games}
 }});
 assert.equal(score.markets.saves.scoredPlayerGames,1);
 assert.equal(score.markets.prizePicksGoalieFantasyScore.scoredPlayerGames,0);
 assert.equal(score.markets.prizePicksGoalieFantasyScore.last5MeanAbsoluteError,null);
 assert.equal(score.isActualPrizePicksQuotedLineBacktest,false);
});
test("missing historical data emits zero evaluated rather than artificial winning outcomes",()=>{
 const r=runOfficialMarketWalkforward(null);
 assert.equal(r.status,"official_history_unavailable");
 assert.equal(r.markets.hits.scoredPlayerGames,0);
 assert.equal(r.markets.hits.lowerErrorBaseline,"unavailable");
 assert.throws(()=>runOfficialMarketWalkforward(null,{minPrevious:3}),/floor/);
});
