"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{normalize}=require("../scripts/nba-alternate-official-result-crosscheck.cjs");
function fixture(){
 const g={gameId:22600052,home:"ORL",away:"DET",startAt:"2026-11-25T00:00:00Z"};
 const summary={gameId:"0022600052",gameStatus:3,gameTimeUTC:g.startAt,homeTeam:{teamTricode:"ORL",teamId:1,score:100,inactives:[{personId:999}]},awayTeam:{teamTricode:"DET",teamId:2,score:95,inactives:[]}};
 const side=(code,id,pts)=>({teamTricode:code,teamId:id,players:Array.from({length:5},(_,i)=>({personId:id*10+i,firstName:"Player",familyName:String(i),statistics:{minutes:"30:00",points:pts,reboundsTotal:3,assists:2,threePointersMade:1,steals:0,blocks:0,turnovers:1}}))});
 const traditional={gameId:summary.gameId,homeTeam:side("ORL",1,20),awayTeam:side("DET",2,19)};
 return [g,{boxScoreSummary:summary},{boxScoreTraditional:traditional}];
}
test("official alternate final team totals and native IDs reconcile",()=>{const f=normalize(...fixture());assert.equal(f.rows.size,10);assert.equal(f.rows.get(10).pointsReboundsAssists,25);assert.equal(f.inactive.has(999),true);});
test("live, wrong game, partial points, duplicate player and inactive-appearing conflict fail closed",()=>{for(const change of [a=>a[1].boxScoreSummary.gameStatus=2,a=>a[2].boxScoreTraditional.gameId="wrong",a=>a[2].boxScoreTraditional.homeTeam.players[0].statistics.points=19,a=>a[2].boxScoreTraditional.awayTeam.players[0].personId=10,a=>a[1].boxScoreSummary.homeTeam.inactives=[{personId:10}]]){const a=fixture();change(a);assert.equal(normalize(...a),null);}});
