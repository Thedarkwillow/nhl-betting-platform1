"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {empirical,correlation,evaluate,nbaRows,workload,contextSummary}=require("../scripts/chronological-player-stat-audit.cjs");
test("empirical distribution score and interval arithmetic",()=>{
 const x=empirical([0,2],1);assert.equal(x.mean,1);assert.equal(x.crps,.5);assert.equal(x.mae,0);assert.equal(x.covered,1);
 assert.equal(empirical([2,2,2],5).crps,3);
 assert.equal(empirical([2,2,2],5).covered,0);
});
test("no retrospective same-date, same-series or late-observed input enters a forecast",()=>{
 const rows=Array.from({length:12},(_,i)=>({sport:"CS2",player:"p",event:"e"+i,series:"s"+i,date:"2026-10-01",start:i*100,end:i*100+1,known:i*100+2,scope:"map_1",values:{kills:10}}));
 const target={sport:"CS2",player:"p",event:"target",series:"same",date:"2026-11-01",start:2000,end:2100,known:2200,scope:"map_1",values:{kills:15}};
 const poison=[{...target,event:"prior_same",start:1500,end:1600,known:1700,values:{kills:1000}},{...target,event:"late",series:"other",start:1500,end:1600,known:2001,values:{kills:1000}},{...target,event:"same_time",series:"other2",values:{kills:1000}}];
 const result=evaluate([...rows,...poison,target]);
 // Evaluate a clean target only: both earlier poisoned observations are not eligible for that target.
 const clean=evaluate([...rows,target]);
 const k=JSON.stringify(["CS2","map_1","kills"]);
 assert.equal(clean.groups[k].n,1);assert.equal(clean.groups[k].mae,5);
 // Same-series and late-observed rows cannot contaminate a distinct target after the chosen cutoff.
 for(const extra of poison){const result=evaluate([...rows,extra,target]);assert.equal(result.groups[k].n,2);assert.equal(result.groups[k].mae,(990+5)/2);}
 assert.equal(result.prospective,false);assert.equal(result.calibrationApproved,false);
 const sameDate=evaluate([...rows.slice(0,11),{...rows[11],start:2000,end:2000,known:2000},target]);
 assert.equal(sameDate.groups[k],undefined);
});
test("pearson requires sample size and nonzero variance",()=>{
 assert.equal(correlation([[1,1],[2,2]]),null);
 assert.equal(correlation(Array.from({length:30},(_,i)=>[i,-i])),-1);
 assert.equal(correlation(Array.from({length:30},(_,i)=>[1,i])),null);
});
test("empty sport evidence remains zero, no prospective claims",()=>{
 const r=evaluate([]);assert.deepEqual(r.groups,{});assert.equal(r.sourceRows.VALORANT,0);assert.equal(r.untouched,false);
});
test("NBA duplicate player-game rejects rather than overcounting",()=>{
 const row={gameId:1,playerId:2,team:"AAA",gameDate:"2026-11-01",points:10,rebounds:2,assists:3,threePointersMade:1,steals:0,blocks:0,turnovers:1};
 assert.throws(()=>nbaRows({season:"2026-27",capturedAt:"2026-11-24T18:20:18Z",rows:[row,row]}),/duplicate/);
});

test("workload forecast separates historical exposure and productivity, never target minutes",()=>{
 const prior=Array.from({length:12},(_,i)=>({exposure:i%2?20:10,values:{points:20}}));
 const w=workload(prior,"points");assert.equal(w.expectedExposure,15);assert.equal(w.projection,22.5);assert.equal(w.baseline,20);
 assert.equal(workload(prior.slice(0,11),"points"),null);
});
test("paired context diagnostics report same-cohort errors and abstain on tiny cluster sample",()=>{
 const prior=Array.from({length:12},(_,i)=>({sport:"NBA",player:"p",event:"e"+i,date:"2026-10-"+String(i+1).padStart(2,"0"),start:i*100,end:i*100,known:i*100,scope:"full_game",opponent:"A",exposure:i%2?20:10,values:{points:20}}));
 const target={...prior[0],event:"target",date:"2026-11-01",start:2000,end:2000,known:2000,exposure:9999,values:{points:25}};
 const r=evaluate([...prior,target]),k=JSON.stringify(["NBA","full_game","points","prior_workload_rate"]),o=JSON.stringify(["NBA","full_game","points","same_opponent_history"]);
 assert.equal(r.pairedContextExperiments[k].n,1);assert.equal(r.pairedContextExperiments[k].mae,2.5);assert.equal(r.pairedContextExperiments[k].pairedBaselineMAE,5);assert.equal(r.pairedContextExperiments[k].approximateCluster95Interval,null);
 assert.equal(r.pairedContextExperiments[o].meanMAEImprovement,0);
});
test("event-cluster confidence interval requires 30 clusters and ten dates",()=>{
 const a={n:30,mae:30,baseMAE:60,clusters:new Map(Array.from({length:30},(_,i)=>[String(i),{n:1,d:1}])),dates:new Set(Array.from({length:10},(_,i)=>String(i)))};
 assert.deepEqual(contextSummary(a).approximateCluster95Interval,[1,1]);
 assert.equal(contextSummary({...a,dates:new Set(["one"])}).approximateCluster95Interval,null);
});
