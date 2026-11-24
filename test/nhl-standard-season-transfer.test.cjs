"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fit,forecast,sourceRich}=require("../src/nhl-standard-season-transfer.cjs");
const {features}=require("../src/nhl-standard-adaptive-research.cjs");
function fixture(){
 const rows=[];
 for(const season of [2023,2024,2025])for(let i=0;i<48;i++){
  const day=new Date(Date.UTC(season,9,1+i)).toISOString().slice(0,10);
  rows.push({season,gameId:Number(season+"02"+String(i+1).padStart(4,"0")),playerId:1,gameDate:day,team:"UTA",opponent:"SJS",type:"skater",gameState:"FINAL",timeOnIceSeconds:1200,shotsOnGoal:i%5,goals:i%2,assists:i%3,points:i%2+i%3,blockedShots:i%3,attempts:6,xg:.4,onIceGoals:3,againstAttempts:10});
 }
 return rows;
}
test("training weights and training-selected variant cannot change with evaluation season outcomes",()=>{
 const rows=fixture(),opts={now:"2026-11-15T12:00:00Z",minGames:1,minDates:1};
 const a=fit(rows,opts),b=fit(rows.map(r=>r.season===2025?{...r,shotsOnGoal:9,goals:4,assists:5,points:9}:r),opts);
 for(const m of ["shotsOnGoal","points","goals","assists","blockedShots"]){
  assert.deepEqual(a.byMarket[m].weights,b.byMarket[m].weights);
  assert.equal(a.byMarket[m].selectedOnTrainingBrierOnly,b.byMarket[m].selectedOnTrainingBrierOnly);
  assert.deepEqual(a.byMarket[m].training,b.byMarket[m].training);
  assert.equal(a.byMarket[m].eligibleForShadow,true);
 }
 assert.ok(a.byMarket.points.evaluation.sourceRichAblation.matched>0);
 assert.equal(a.byMarket.points.evaluation.sourceRichAblation.portableToLive,false);
 assert.notDeepEqual(a.byMarket.points.evaluation,b.byMarket.points.evaluation);
 assert.equal(a.modelPromoted,false);
});
test("invalid duplicate archive and nonmatching season IDs fail closed",()=>{
 const rows=fixture();assert.throws(()=>fit([...rows,rows[0]]),/Repeated historical/);
 assert.throws(()=>fit([{...rows[0],gameId:2024020001}]),/Invalid historical/);
});
test("historical source fit is not pregame evidence before artifact publication",()=>{
 const rows=fixture(),a=fit(rows,{now:"2026-11-15T12:00:00Z",minGames:1,minDates:1});
 const f=features(rows.slice(-15),"points",.5,[],[],"2026-11-15");
 const p={market:"points"};
 assert.equal(forecast(a,p,f,"2026-11-15T11:59:59Z"),null);
 assert.ok(forecast(a,p,f,"2026-11-15T13:00:00Z").higher>0);
 assert.ok(forecast(a,p,f,"2026-11-15T11:59:59Z",{retrospective:true}));
 assert.equal(forecast(a,{market:"saves"},f,"2026-11-15T13:00:00Z"),null);
});
test("source-rich point model requires earlier measured scoring involvement",()=>{
 const prior=fixture().slice(0,20),f=features(prior,"points",.5,[],[],"2023-10-25");
 assert.ok(Number.isFinite(sourceRich(prior,"points",.5,f)));
 assert.equal(sourceRich(prior.map(r=>({...r,onIceGoals:null})),"points",.5,f),null);
});
