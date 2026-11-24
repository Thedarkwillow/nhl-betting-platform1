"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {auditFrames}=require("../src/nhl-alternate-probability-coherence.cjs");
const base={gameId:1,playerId:2,market:"shotsOnGoal",model:"weighted-form-v1",projection:3,capturedAt:"2026-11-14T16:00:00Z",eventStartsAt:"2026-11-14T23:00:00Z"};
const row=(line,higher,lower,push=0,extra={})=>({...base,line,probabilities:{higher,lower,push},...extra});
const frame=rankedProps=>({gitHistoryCount:1,firstCommittedAt:"2026-11-14T16:02:00Z",snapshot:{generatedAt:"2026-11-14T16:01:00Z",rankedProps}});
test("valid same-input curves compare across tiers, retaining push mass",()=>{
 const r=auditFrames([frame([row(1.5,.8,.2,0,{tier:"Goblin"}),row(2,.5,.2,.3),row(3.5,.3,.7,0,{tier:"Demon"})])]);
 assert.equal(r.comparedAdjacentThresholds,2);assert.equal(r.higherMonotonicityViolations,0);
 assert.equal(r.lowerMonotonicityViolations,0);assert.equal(r.modelChanged,false);
});
test("raises coherence diagnostics but does not modify model",()=>{
 const r=auditFrames([frame([row(1.5,.4,.6),row(2.5,.6,.4),row(3.5,.8,.8)])]);
 assert.equal(r.higherMonotonicityViolations,1);assert.equal(r.lowerMonotonicityViolations,1);assert.equal(r.invalidVectors,1);
});
test("different projection context or conflicting duplicate cannot create comparison",()=>{
 const a=auditFrames([frame([row(1.5,.8,.2),row(2.5,.3,.7,0,{projection:4})])]);
 assert.equal(a.comparedGroups,0);
 const b=auditFrames([frame([row(1.5,.8,.2),row(1.5,.7,.3),row(2.5,.3,.7)])]);
 assert.equal(b.conflictingVectors,1);assert.equal(b.comparedGroups,0);
});
