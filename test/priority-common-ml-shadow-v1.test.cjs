"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{predict,F}=require("../src/priority-common-ml-shadow-v1.cjs");
test("exact supported line and first-Git artifact only",()=>{
 const fields=F.nfl_receiving_yards,model={fields,means:[0,0,0],scales:[1,1,1],coefficients:[.1,.1,.1],intercept:0};
 const doc={kind:"priority_common_features_logistic_v1",generatedAt:"2026-11-20T00:00:00Z",researchOnly:true,modelPromoted:false,models:{nfl_receiving_yards:{"24.5":model}}};
 const a={document:doc,firstCommittedAt:"2026-11-21T00:00:00Z"},f={base:10,recent5:10,opportunity:5},now="2026-11-22T00:00:00Z";
 assert.ok(predict("nfl_receiving_yards",24.5,f,a,now).higher>.5);
 assert.equal(predict("nfl_receiving_yards",25.5,f,a,now),null);
 assert.equal(predict("nfl_receiving_yards",24.5,f,{...a,firstCommittedAt:"2026-11-23T00:00:00Z"},now),null);
 assert.equal(predict("nfl_receiving_yards",24.5,{...f,opportunity:null},a,now),null);
});

test("expanded NHL history uses strictly prior same-team final games and no missing values",()=>{
 const {nhlCommon}=require("../src/priority-common-ml-shadow-v1.cjs");
 const rows=Array.from({length:10},(_,i)=>({gameId:i+1,gameDate:"2026-11-"+String(i+1).padStart(2,"0"),team:"A",type:"skater",gameState:"FINAL",timeOnIceSeconds:1200,shotsOnGoal:2}));
 assert.deepEqual(nhlCommon("shotsOnGoal",[...rows,{...rows[0],gameId:99,gameDate:"2026-11-11",shotsOnGoal:100}],"A","2026-11-11"),{recent5:2,recent20:2,ice:20});
 assert.equal(nhlCommon("shotsOnGoal",rows.slice(1),"A","2026-11-11"),null);
 assert.equal(nhlCommon("shotsOnGoal",[...rows,rows[0]],"A","2026-11-11"),null);
 assert.ok(F.nfl_rushing_yards&&F.nhl_saves&&F.nfl_receptions);
});

test("goalie saves require exact fresh official starter evidence, not expected status",()=>{
 const {goalieStart}=require("../src/priority-common-ml-shadow-v1.cjs"),now="2026-11-24T18:00:00Z",p={gameId:123,playerId:42,team:"A",gameStartAt:"2026-11-24T19:00:00Z"},row={team:"A",playerId:42,nhlOfficialGameId:123,officialRosterIdentityMatched:true,sourceCapturedAt:now,officialTeamStarterConfirmation:false};
 const a={firstCommittedAt:now,document:{kind:"nhl_external_pregame_availability_research",generatedAt:now,events:[{nhlGameId:123,eventStartsAt:p.gameStartAt,goalies:[row]}]}};
 assert.equal(goalieStart(p,a,now),false);row.officialTeamStarterConfirmation=true;assert.equal(goalieStart(p,a,now),true);assert.equal(goalieStart({...p,playerId:43},a,now),false);
});
test("kicker feature rows include observed zero attempts and reject duplicates",()=>{
 const {kickerFeatures}=require("../src/priority-common-ml-shadow-v1.cjs"),rows=Array.from({length:12},(_,i)=>({gameId:i,year:2025,week:i+1,measures:{fg_attempts:0,fg_made:0}}));
 assert.deepEqual(kickerFeatures(rows,"fg_made"),{base:0,recent5:0,opportunity:0});assert.equal(kickerFeatures([...rows,rows.at(-1)],"fg_made"),null);
});

test("official final goalie starter flags join only exact matching observations",()=>{const {joinGoalieUsage}=require("../src/priority-common-ml-shadow-v1.cjs"),g={gameId:1,playerId:42,gameDate:"2025-11-01",team:"A",type:"goalie",timeOnIceSeconds:3600,saves:25},history={players:{42:{games:[g]}}},u={source:"official_NHL_final_gamecenter_boxscore",players:{42:[{...g,started:true,provenance:"official_NHL_final_gamecenter_boxscore"}]}};assert.equal(joinGoalieUsage(history,u).players[42].games[0].started,true);u.players[42][0].saves=24;assert.equal(joinGoalieUsage(history,u).players[42].games[0].started,undefined);});
