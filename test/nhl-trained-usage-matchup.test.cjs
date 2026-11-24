"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {forecasts,rowsFromReports,buildRows,evaluate,CUT}=require("../src/nhl-trained-usage-matchup.cjs");
function fixture(days=24){
 return Array.from({length:days},(_,d)=>{
  const date=new Date(Date.UTC(2026,9,17+d)).toISOString().slice(0,10),players=[];
  for(let game=0;game<2;game++)for(let team=0;team<2;team++)for(let p=0;p<19;p++){
   const goalie=p===18,base=team+1,stat=(p+d)%5;
   players.push({gameId:2026020000+d*2+game,gameDate:date,gameState:"OFF",team:["NYR","BOS","TOR","MTL"][game*2+team],
    playerId:100+game*100+team*30+p,type:goalie?"goalie":"skater",timeOnIceSeconds:goalie?3600:900+stat*60,
    shotsOnGoal:goalie?null:base+stat,goals:goalie?null:stat%2,assists:goalie?null:stat%3,points:goalie?null:stat%2+stat%3,
    blockedShots:goalie?null:stat%3,hits:goalie?null:stat,faceoffsWon:goalie?null:stat*2,saves:goalie?20+stat:null});
  }
  return {requestedDate:date,source:"NHL public API",sourceSchemaVersion:5,errors:[],scheduledGames:2,completedGames:2,collectedGames:2,players};
 });
}
test("forecast uses only prior valid usage and shrunk opponent context",()=>{
 const p=Array.from({length:5},()=>({stat:3,toi:900}));
 assert.equal(forecasts(p,[40,40,40],Array(12).fill(20)).candidates.usage,3);
 assert.ok(forecasts(p,[40,40,40],Array(12).fill(20)).candidates.usageMatchup>3);
 assert.equal(forecasts(p,[40],Array(12).fill(20)),null);
});
test("same-day and later stat changes cannot change that day's projection inputs",()=>{
 const a=fixture(),day=a.at(-1).requestedDate;
 const b=structuredClone(a);
 for(const p of b.at(-1).players){if(p.type==="skater")p.shotsOnGoal+=50;else p.saves+=50;p.timeOnIceSeconds=1000;}
 const get=x=>buildRows(x).rows.filter(r=>r.date===day).map(r=>r.candidates);
 assert.deepEqual(get(a),get(b));
 const r=evaluate(a),q=evaluate(b);
 assert.equal(r.byMarket.shotsOnGoal.selectedFromTrainingOnly,q.byMarket.shotsOnGoal.selectedFromTrainingOnly);
 assert.deepEqual(r.byMarket.shotsOnGoal.training,q.byMarket.shotsOnGoal.training);
 assert.ok(r.byMarket.shotsOnGoal.testRows>0);
 assert.equal(r.modelPromoted,false);assert.equal(r.originalPlatformHitRate,null);
});
test("missing or incomplete archive and duplicate rows fail closed",()=>{
 const a=fixture(3);a[0].errors=["incomplete"];a[1].scheduledGames=3;
 const r=rowsFromReports(a);assert.equal(r.dates.size,1);assert.equal(r.excluded.length,2);
 const b=fixture(1);b[0].players.push(b[0].players[0]);
 assert.throws(()=>rowsFromReports(b),/Duplicate/);
});
test("comparison uses a common cohort and requires complete context",()=>{
 const a=fixture(24),r=evaluate(a);
 assert.equal(r.byMarket.shotsOnGoal.trainingRows+r.byMarket.shotsOnGoal.testRows,r.byMarket.shotsOnGoal.coverage.matched);
 assert.equal(r.trainBefore,CUT);
 assert.equal(r.byMarket.saves.selectedFromTrainingOnly,null);
 assert.ok(r.byMarket.shotsOnGoal.selectedFromTrainingOnly);
});
