"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const cal=require("../src/forward-calibration-evidence.cjs"),dep=require("../src/forward-pair-evidence.cjs"),period=require("../src/nhl-dedicated-period-distributions.cjs"),bench=require("../src/strict-market-benchmark.cjs"),trial=require("../src/fixed-trial-evidence-gates.cjs");
const row=(i,p=.6,y=1)=>({id:"r"+i,gameId:i,playerId:i,market:"shotsOnGoal",period:"full_game",tier:"Standard",side:"Higher",p,y,frozenAt:"2026-11-10T10:00:00Z",startAt:"2026-11-10T18:00:00Z"});
test("first observed final clock cannot backdate training evidence",()=>{
 const a=cal.observe(Array.from({length:60},(_,i)=>row(i)),null,"2026-11-12T10:00:00Z");
 assert.equal(cal.forecast(row(99),a.firstObserved).probability,.75);
 assert.ok(Object.values(cal.study(a).byMarketTierSide).every(v=>v.matchedHeldout===0));
 const b=cal.observe([row(1,.6,0)],a,"2026-11-13T10:00:00Z");assert.ok(b.quarantined.includes("r1"));
 assert.equal(b.firstObserved.find(x=>x.id==="r1").observedFinalAt,"2026-11-12T10:00:00Z");
});
test("matched pair cohort excludes same target alternate thresholds",()=>{
 const a=row(1),b={...a,id:"other"},c={...a,id:"different",market:"points"};
 const state=cal.observe([a,b,c],null,"2026-11-12T10:00:00Z");
 assert.equal(dep.pairs(state).length,1);assert.equal(dep.study(state).verifiedJointProbability,false);
});
test("period distributions reject unplayed periods and preserve probability mass",()=>{
 const a=Array.from({length:10},(_,i)=>({playedInPeriod:true,period:1,gameId:i+1,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),goals:i%2,timeOnIceSeconds:400+i,shotsOnGoal:i%3}));
 for(const m of ["goals","timeOnIceSeconds","shotsOnGoal"]){const v=period.forecast(a,m,1);assert.ok(Math.abs(Object.values(v.probabilities).reduce((s,x)=>s+x,0)-1)<1e-8);}
 const b=a.map(x=>({...x,playedInPeriod:false}));assert.equal(period.forecast(b,"goals",.5),null);
});
test("strict consensus requires fresh unique books with exact original market",()=>{
 const a={gameId:1,playerId:2,market:"points",period:"full_game",line:.5,eventStartsAt:"2026-11-10T18:00:00Z"};
 const quotes=book=>["Higher","Lower"].map(side=>({...a,book,side,observedAt:"2026-11-10T17:00:00Z",decimalOdds:1.91,archiveVerified:true}));
 const opts={asOf:"2026-11-10T17:15:00Z"};assert.equal(bench.consensus(a,[quotes("one")],opts),null);
 assert.equal(bench.consensus(a,[quotes("one"),quotes("two")],opts).higher,.5);
 assert.equal(bench.consensus(a,[quotes("one"),quotes("two")],{asOf:"2026-11-10T17:45:00Z"}),null);
 assert.equal(bench.assessEvidence({}).status,"abstain");
});
test("fixed trial cannot approve early or infer missing significance",()=>{
 const r=trial.holm(["a","b","c"],{a:.01,b:.04});assert.equal(r.a.passes,true);assert.equal(r.b.passes,false);assert.equal(r.c.adjustedP,1);
 assert.equal(trial.releaseReview({now:"2026-11-16T00:00:00Z"}).trialComplete,false);
 assert.equal(trial.releaseReview({now:"2028-01-01T00:00:00Z"}).productionPromotionApproved,false);
});
