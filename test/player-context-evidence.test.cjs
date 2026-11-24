"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {playerProfile,opponentPositionTable}=require("../src/player-context-evidence.cjs");
const {adapt,report}=require("../src/nhl-player-context-evidence.cjs");
const scope={sport:"NHL",market:"shotsOnGoal",period:"full_game",beforeDate:"2026-11-10",season:"2026-27",playerId:1,line:2,matchupOpponent:"BBB"};
const row=(i,value,extras={})=>({sport:"NHL",market:"shotsOnGoal",period:"full_game",gameId:i,playerId:1,gameDate:"2026-11-"+String(i).padStart(2,"0"),season:"2026-27",officialFinal:true,participated:true,team:"AAA",opponent:"BBB",venue:"home",position:"C",completeGame:true,value,...extras});
test("profile uses past-only exact threshold including pushes, not forecast probabilities",()=>{
 const p=playerProfile([row(1,1),row(2,2),row(3,3),row(4,4),row(10,100),row(5,99,{officialFinal:false}),row(6,100,{period:"1P"}),row(7,0,{participated:false})],scope);
 assert.deepEqual(p.windows.last5,{n:4,above:2,below:1,push:1,average:2.5,aboveRate:.5,belowRate:.25,decidedAboveRate:2/3});
 assert.equal(p.consecutiveAbove,2);assert.equal(p.windows.headToHead.n,4);assert.equal(p.confidence,null);
});
test("duplicates and other sports are excluded; missing sample is null rather than zero",()=>{
 const p=playerProfile([row(1,1),row(1,2),row(2,9,{sport:"NFL"}),row(3,4,{opponent:"CCC"})],{...scope,opponent:"BBB"});
 assert.equal(p.windows.last5.n,0);assert.equal(p.windows.last5.average,null);
});
test("rank requires full cohort coverage and explicit position, low conceded number ranks first",()=>{
 const a=[];for(let i=1;i<=5;i++){a.push(row(i,1));a.push(row(i,3,{playerId:2,team:"BBB",opponent:"AAA"}));}
 a.push(row(6,100,{position:"RW"}));a.push(row(7,100,{completeGame:false}));
 const s={...scope,position:"C",leagueTeams:["AAA","BBB"]};
 const t=opponentPositionTable(a,s);
 assert.equal(t.teams.BBB.last5.rank,1);assert.equal(t.teams.AAA.last5.rank,2);
 assert.equal(t.teams.BBB.last10.rank,null);
 assert.equal(opponentPositionTable(a,{...s,leagueTeams:["AAA","BBB","CCC"]}).teams.BBB.last5.rank,null);
});
test("NHL adapter refuses unknown event and does not manufacture complete boxscores",()=>{
 const game={id:2026020001,season:"2026-27",gameType:2,home:"NYR",away:"BOS",gameDate:"2026-11-01"};
 const schedule={source:"Official NHL Web API",complete:true,season:"2026-27",games:[game]};
 const g={gameId:game.id,playerId:1,gameDate:game.gameDate,gameState:"OFF",type:"skater",team:"NYR",position:"L",timeOnIceSeconds:900,shotsOnGoal:3};
 const history={players:{1:{games:[g,{...g,gameId:999}]}}};
 const a=adapt(history,schedule,scope.beforeDate);
 const s=a.rows.find(r=>r.market==="shotsOnGoal");
 assert.equal(s.position,"LW");assert.equal(s.opponent,"BOS");assert.equal(s.venue,"home");assert.equal(s.completeGame,false);
 assert.equal(report(history,schedule,scope.beforeDate).coverage.shotsOnGoal.byPosition.LW.seasonRankedTeams,0);
});
