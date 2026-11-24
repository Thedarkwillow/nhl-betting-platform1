"use strict";
const assert=require("node:assert/strict"),{test}=require("node:test");
const {ablation}=require("../src/nhl-position-defense-ablation.cjs");
const {adapt}=require("../src/nfl-player-context-evidence.cjs");
test("position study embargoes the target date and rejects insufficient sample",()=>{
 const rows=[];for(let d=1;d<=10;d++)for(let p=1;p<=4;p++)rows.push({sport:"NHL",market:"shotsOnGoal",period:"full_game",gameDate:"2026-10-"+String(d).padStart(2,"0"),gameId:d,playerId:p,team:"AAA",opponent:"BBB",position:"C",officialFinal:true,participated:true,completeGame:true,value:2});
 assert.equal(ablation(rows,"shotsOnGoal").appearances,0);
 const expanded=[];for(let d=1;d<=12;d++)for(let g=1;g<=4;g++)expanded.push({sport:"NHL",market:"shotsOnGoal",period:"full_game",gameDate:"2026-10-"+String(d).padStart(2,"0"),gameId:d*10+g,playerId:g,team:"AAA",opponent:"BBB",position:"C",officialFinal:true,participated:true,completeGame:true,value:2});
 const a=ablation(expanded,"shotsOnGoal");assert.equal(a.appearances,16);assert.equal(a.models.positionDefense.mae,0);assert.equal(a.actualOfferLines,false);
});
test("NFL context requires past final matched regular-season appearance",()=>{
 const x={player_id:"p",season:2025,week:1,position:"QB",recent_team:"AAA",attempts:20,completions:10,passing_yards:120};
 const g={game_id:"g",season:2025,week:1,game_type:"REG",gameday:"2025-09-07",home_score:20,away_score:10,home_team:"AAA",away_team:"BBB"};
 const rows=adapt([x],[g],"2025-09-08");assert.equal(rows.find(r=>r.market==="passing_yards").value,120);assert.equal(rows[0].venue,"home");assert.equal(rows[0].opponent,"BBB");assert.equal(rows[0].completeGame,false);
 assert.equal(adapt([x],[g],"2025-09-07").length,0);assert.equal(adapt([x,x],[g],"2025-09-08").length,0);assert.equal(adapt([{...x,opponent_team:"CCC"}],[g],"2025-09-08").length,0);
});
