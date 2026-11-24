"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {study,probs}=require("../src/nhl-older-season-locked-families-v1.cjs");
const {prioritizeDates}=require("../scripts/collect-nhl-pp-scoring-history.cjs");
function rows(){
 const out=[];
 for(const season of [2023,2024,2025])for(let i=0;i<60;i++){
  const day=new Date(Date.UTC(season,9,1+i)).toISOString().slice(0,10);
  const gameId=season*1000000+200000+i;
  for(let player=1;player<=4;player++){
   const v=(i+player)%5;
   out.push({gameId,playerId:8470000+player,team:"NYR",type:"skater",
    gameState:"FINAL",gameDate:day,
    timeOnIceSeconds:800+15*(i%5),
    shotsOnGoal:v,points:Number(v>=3)+Number(i%10===0),
    assists:Number(v>=4),blockedShots:(i+2*player)%4});
  }
 }
 return out;
}
test("earlier season only chooses four market families, without reselecting on holdout",()=>{
 const all=rows(),a=study(all);
 assert.equal(a.source.bySeason[2023],240);
 assert.equal(a.training.shotsOnGoal.thresholds>300,true);
 assert.equal(a.training.points.thresholds>300,true);
 assert.equal(a.evaluationNeverUsedForFamilySelection,true);
 assert.equal(a.flags.noHistoricalPrizePicksOrUnderdogQuotes,true);
 for(const m of Object.keys(a.selectedFamilies)){
  assert.ok(a.selectedFamilies[m],m);
  assert.equal(a.evaluation[m].selectionWasFrozenBeforeHoldout,true);
  assert.ok(a.evaluation[m].selectedOnTrainingOnly);
 }
 const changed=structuredClone(all);
 for(const p of changed.filter(p=>String(p.gameId).startsWith("2025")))
  p.assists=40,p.blockedShots=40,p.shotsOnGoal=40,p.points=40;
 const b=study(changed);
 assert.deepEqual(b.selectedFamilies,a.selectedFamilies);
 assert.deepEqual(b.training,a.training);
});
test("all game observations on the target day are withheld until after forecasts",()=>{
 const all=rows(),prior=all.filter(r=>r.playerId===8470001&&r.gameDate<"2024-10-25");
 const p=probs(prior,"shotsOnGoal",2.5);
 assert.ok(p);
 assert.equal(p.asOfPriorDate<"2024-10-25",true);
 const future={...prior[0],gameDate:"2024-10-25",shotsOnGoal:30};
 assert.deepEqual(probs(prior,"shotsOnGoal",2.5),
  probs([...prior,future].filter(x=>x.gameDate<"2024-10-25"),"shotsOnGoal",2.5));
});
test("duplicates fail closed; invalid stats never enter evaluation",()=>{
 const all=rows();
 assert.throws(()=>study([...all,all[0]]),/Duplicate source game/);
 const missing=structuredClone(all);
 missing[0].gameState="LIVE";
 assert.equal(study(missing).source.invalid,1);
});
test("official scoring recovery prioritizes early-current gaps and ongoing old backfill",()=>{
 const days=["2025-10-01","2025-10-02","2025-10-03","2025-10-04",
 "2025-10-05","2026-10-01","2026-10-02","2026-10-03",
 "2026-10-04","2026-10-05","2026-10-06","2026-10-07",
 "2026-10-08","2026-10-09","2026-11-12","2026-11-13","2026-11-14"];
 const a=prioritizeDates(days);
 assert.ok(a.length<=12);
 assert.ok(a.includes("2026-10-01"));
 assert.ok(a.includes("2026-11-14"));
 assert.ok(a.includes("2025-10-01"));
 assert.equal(new Set(a).size,a.length);
});
