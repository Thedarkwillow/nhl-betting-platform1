"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),m=require("../src/nhl-shot-point-opportunity-v1.cjs");
function fixture(){
 const h={players:{}},s={source:"Official NHL Web API",complete:true,games:[]};
 for(let i=0;i<65;i++){const day=new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),gameId=2025020001+i;s.games.push({id:gameId,gameDate:day,home:"ANA",away:"CGY",startTimeUTC:day+"T23:00:00Z"});
  for(let j=0;j<36;j++){const id=j+1,position=j%18<12?"C":"D",goals=Number((i+j)%11===0),assists=Number((i+j+2)%9===0),r={gameId,playerId:id,gameDate:day,type:"skater",gameState:"OFF",team:j<18?"ANA":"CGY",position,timeOnIceSeconds:1000,shotsOnGoal:(i+j)%5,goals,assists,points:goals+assists,powerPlayTimeOnIceSeconds:120+(i%5)*10,powerPlayPoints:0};(h.players[id]??={games:[]}).games.push(r);}
 }return {h,s};
}
test("fixed chronological holdout compares forward and defense models, matched PP exposures",()=>{const {h,s}=fixture(),x=m.prepare(h,s,{holdout:"2026-02-15",cutoff:"2026-03-07"});assert.ok(x.report.byMarketAndPosition["shotsOnGoal|F"].models.position.n>0);assert.ok(x.report.byMarketAndPosition["points|D"].models.position.n>0);assert.ok(x.report.ppThresholds>0);assert.ok(x.report.ppPointComponentThresholds>0);assert.ok(x.report.training.points.F.dates>=10);assert.ok(x.report.training.points.F.games>=30);const y=m.prepare(h,s,{holdout:"2026-02-15",cutoff:"2026-02-15"});assert.deepEqual(x.report.training,y.report.training);});
test("unknown PP never passes as zero or creates a PP model",()=>{const {h,s}=fixture();for(const p of Object.values(h.players))for(const g of p.games)delete g.powerPlayTimeOnIceSeconds;const x=m.prepare(h,s,{holdout:"2026-02-15",cutoff:"2026-03-07"});assert.equal(x.report.ppThresholds,0);assert.deepEqual(x.report.matchedPPImpact,{});});
test("count probability and no final observation no grading",()=>{assert.ok(m.poisson(3,2.5)>m.poisson(1,2.5));assert.equal(m.poisson(3,2),null);const x=m.grade([{gameId:1,playerId:2,market:"points",line:.5,tier:"Standard"}],{players:{}});assert.equal(x.pending,1);assert.equal(x.approved,false);});
