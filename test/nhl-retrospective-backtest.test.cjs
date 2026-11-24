"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {gradeHistoricalBoard,summarizeBacktest}=require("../src/nhl-retrospective-backtest.cjs");
const asOf="2026-10-30T16:00:00Z";
const offer={id:"pp_test",source:"prizepicks",is_demo:false,league:"NHL",status:"active",
 player:{name:"Example Skater",team:"BOS"},event:{opponent:"NYR",starts_at:"2026-10-30T23:00:00Z"},
 market:{stat:"Shots On Goal",period:"Full game"},line:2.5,observed_at:"2026-10-30T15:59:00Z",
 selections:[{side:"more",tier:"standard",available:true},{side:"less",tier:"standard",available:true}]};
const games=[{id:123,away:"BOS",home:"NYR",startTimeUTC:"2026-10-30T23:00:00Z"}];
const log=i=>({gameId:i,gameDate:"2026-10-"+String(i).padStart(2,"0"),type:"skater",shotsOnGoal:3,team:"BOS"});
const history={players:{"9":{playerId:9,name:"E. Skater",team:"BOS",type:"skater",games:[
 ...Array.from({length:6},(_,i)=>log(i+22)),{gameId:123,gameDate:"2026-10-30",shotsOnGoal:4,type:"skater",team:"BOS"}]}}};
test("historical replay uses only games prior to the as-of checkpoint",()=>{
 const r=gradeHistoricalBoard([offer],history,games,asOf);
 assert.equal(r.decisions.length,1);assert.equal(r.decisions[0].correct,true);
 assert.equal(r.decisions[0].observations,6);
 assert.equal(r.decisions[0].methodology,"retrospective_replayed_board_not_pregame_publication");
 const s=summarizeBacktest([r]);assert.equal(s.hitRate,1);assert.equal(s.prospectiveVerified,false);
});
test("historical replay rejects started games and stale observations",()=>{
 const r=gradeHistoricalBoard([offer,{...offer,observed_at:"2026-10-30T14:00:00Z"},
 {...offer,event:{...offer.event,starts_at:"2026-10-30T12:00:00Z"}}],history,games,asOf);
 assert.equal(r.decisions.length,1);assert.equal(r.excluded.timestamp_or_game_window,2);
});
test("later game statistics cannot become past training data",()=>{
 const h=structuredClone(history);h.players["9"].games=h.players["9"].games.filter(g=>g.gameId===123);
 const r=gradeHistoricalBoard([offer],h,games,asOf);
 assert.equal(r.decisions.length,0);assert.equal(r.excluded.missing_player,1);
});
test("does not count pushes as wins and does not claim calibration",()=>{
 const r=summarizeBacktest([{totalOffers:2,decisions:[
 {market:"goals",tier:"standard",correct:true,estimatedProbability:.6},
 {market:"goals",tier:"standard",correct:null,estimatedProbability:.5}]}]);
 assert.equal(r.gradedDecisions,1);assert.equal(r.pushes,1);
 assert.equal(r.calibrated,false);assert.equal(r.prospectiveVerified,false);
});
