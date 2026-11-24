"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {inventory}=require("../src/dedicated-prop-model-roadmap.cjs");
const {model,SPEC}=require("../src/nfl-dedicated-core-market-lab.cjs");
const {combo,specialty}=require("../src/nhl-dedicated-specialty-lab.cjs");
const {noVig,paperReturns,reliability}=require("../src/market-evidence-quality.cjs");
test("phase two coverage distinguishes implemented research and never approves release",()=>{
 const a=inventory().models,implemented=a.filter(x=>x.status==="historical_candidate_implemented_pending_validation");
 assert.equal(implemented.filter(x=>x.sport==="NHL").length,16);assert.equal(implemented.filter(x=>x.sport==="NFL").length,31);assert.equal(inventory().periodPolicies.length,96);assert.ok(inventory().periodPolicies.every(x=>!x.releaseApproved));assert.ok(a.every(x=>!x.releaseApproved));
});
test("NFL receptions modeled as bounded target conversion rather than unconstrained count",()=>{
 const rows=Array.from({length:10},()=>({targets:8,receptions:5,position:"WR"})),r=model(rows,SPEC.receptions);
 assert.ok(r.estimate<=8&&r.estimate>0);assert.ok(r.prob(3.5)>r.prob(6.5));
 assert.equal(model(rows.slice(0,5),SPEC.receptions),null);
});
test("combo retains paired outcomes; invalid components never produce a quote",()=>{
 const a=[0,0,0,0,4,4,4,4],b=[0,0,0,0,4,4,4,4],r=combo(a,b,5.5);
 assert.ok(r.candidate>r.base);assert.equal(combo(a,b.slice(1),5.5),null);
 assert.equal(specialty("goalieFantasyScore",[],14.5),null);
});
test("no-vig benchmark must exactly match lines and time; paper return fails closed on missing terms",()=>{
 const x={book:"Test",gameId:1,playerId:2,market:"shotsOnGoal",line:2.5,period:"full",observedAt:"2026-11-13T10:00:00Z",eventStartsAt:"2026-11-13T18:00:00Z",side:"Higher",decimalOdds:1.9};
 const y={...x,side:"Lower"},o={asOf:"2026-11-13T11:00:00Z"};const q=noVig([x,y],o);
 assert.equal(q.higher,.5);assert.equal(noVig([x,{...y,line:3.5}],o),null);
 assert.equal(noVig([x,y],{asOf:x.eventStartsAt}),null);
 assert.equal(paperReturns([{id:"a",paperStake:1,officialPaperReturn:3}]).paperROI,null);
 assert.deepEqual(reliability([]),{});
});
