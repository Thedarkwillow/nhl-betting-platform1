"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{context,signal,predict}=require("../src/nhl-two-team-matchup-research.cjs"),{reconcile}=require("../scripts/reconcile-sportsbook-quota.cjs");
test("shot defense versus own attack; blocks use own defensive workload and opponent offense",()=>{
 const a=[{shotsOnGoal:20,blockedShots:12,faceoffsWon:25}],b=[{shotsOnGoal:30,blockedShots:8,faceoffsWon:20}],v=context(a,b);
 assert.deepEqual(v.shotsOnGoal,[20,30]);assert.deepEqual(v.blockedShots,[42,28]);assert.deepEqual(v.saves,[30,20]);assert.deepEqual(v.faceoffsWon,[45,45]);assert.deepEqual(v.powerPlayPoints,[null,null]);
 assert.equal(signal("shotsOnGoal",Array(4).fill([20,30]),Array(10).fill([20,30]),Array(30).fill([25,25])),null);
 const own=Array(15).fill([30,20]),opp=Array(15).fill([20,30]),lg=Array(30).fill([25,25]),prior=Array(10).fill({type:"skater",shotsOnGoal:2,timeOnIceSeconds:1200});
 const p=predict("shotsOnGoal",prior,own,opp,lg);assert.ok(p.combined>p.base);
});
test("balance delta alone cannot release reserve or prove sport attribution",()=>{
 const r=reconcile({prior:{remainingCredits:17700,quotaCreditsReported:6},marker:{pacificDate:"2026-11-15",reservedCredits:6},remaining:17694,cost:0,used:2306,at:"2026-11-15T20:50:00Z",archiveFound:null});
 assert.equal(r.balanceDeltaSincePrior,6);assert.equal(r.nhlActualUsageVerified,false);assert.equal(r.additionalPaidRequestsAllowed,0);
});
test("collector import works without starting HTTP if loaded as module",()=>{
 assert.equal(typeof require("../scripts/collect-bounded-sportsbook-quotes.cjs").main,"function");
});
