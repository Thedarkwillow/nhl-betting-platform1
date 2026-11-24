"use strict";
const {test}=require("node:test"),a=require("node:assert/strict"),nhl=require("../src/nhl-position-rate-matchup-v2.cjs"),nfl=require("../src/nfl-position-opportunity-matchup.cjs"),{opponentPositionTable}=require("../src/player-context-evidence.cjs");
test("NHL position exposure rates distinguish volume, exclude other positions, and preserve missing windows",()=>{
 const c=nhl.newState(),rs=[];
 for(let i=1;i<=20;i++){const common={gameId:i,gameDate:"2026-10-"+String(i).padStart(2,"0"),market:"assists",completeGame:true,powerPlaySeconds:120};rs.push({...common,playerId:1,position:"C",team:"UTA",opponent:"VAN",value:2,exposureSeconds:1200});rs.push({...common,playerId:2,position:"C",team:"BOS",opponent:"NYR",value:0,exposureSeconds:1200});rs.push({...common,playerId:3,position:"LW",team:"BOS",opponent:"VAN",value:0,exposureSeconds:1200});}
 nhl.update(c,rs);const p=nhl.candidate(c,{playerId:1,team:"UTA",opponent:"VAN",market:"assists"});
 a.equal(p.position,"C");a.equal(p.defense.season.games,20);a.equal(p.defense.last20.per60,6);a.equal(p.defense.last5.allowedPerAppearance,2);a.ok(p.defenseFactor>1);a.ok(p.powerPlayTime.expectedPowerPlaySeconds>0);a.equal(nhl.candidate(c,{playerId:1,team:"UTA",opponent:"SJS",market:"assists"}),null);
 const t=opponentPositionTable(rs.map(r=>({...r,sport:"NHL",season:"2026-27",period:"full_game",officialFinal:true,participated:true})),{sport:"NHL",market:"assists",period:"full_game",beforeDate:"2026-11-01",season:"2026-27",position:"C",leagueTeams:["UTA","VAN","BOS","NYR"]});a.equal(t.teams.VAN.last20.allowedPer60,6);a.equal(t.teams.VAN.last20.rank,null);
});
test("NFL separate WR and TE opportunities; incomplete position evidence does not imply weak defense",()=>{
 const c=nfl.state(),rows=[];
 for(let i=1;i<=20;i++){const x={season:2026,gameId:i,market:"receiving_yards",opportunity:5,rateExposure:4};rows.push({...x,playerId:"wr",position:"WR",team:"AAA",opponent:"BBB",value:60,rawStat:60});rows.push({...x,playerId:"wr2",position:"WR",team:"CCC",opponent:"DDD",value:20,rawStat:20});rows.push({...x,playerId:"te",position:"TE",team:"CCC",opponent:"BBB",value:0,rawStat:0});}
 nfl.update(c,rows);const p=nfl.candidate(c,{historicalPlayerId:"wr",season:2026,team:"AAA",opponent:"BBB",market:"receiving_yards"});a.equal(p.position,"WR");a.equal(p.defense.last5.perAppearance,60);a.equal(p.rank,null);a.ok(p.positionDefense>p.baseline);a.equal(nfl.candidate(c,{historicalPlayerId:"wr",season:2026,team:"AAA",opponent:"ZZZ",market:"receiving_yards"}),null);
});
