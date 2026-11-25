"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{evaluateCards}=require("../scripts/hypothetical-joint-scenario-audit.cjs");
function fixture(){
 const legs=Array.from({length:6},(_,i)=>({id:"p"+i,player:"player"+i,event:"event"+i,tier:"Standard",platform:"fixture"}));
 const payouts={};for(let k=2;k<=6;k++)payouts[k]={[k+",0,0,0"]:2,["0,"+k+",0,0"]:0};
 return {kind:"hypothetical_joint_scenario_v1",platform:"fixture",scenarioSource:"synthetic test",payoutSource:"synthetic test",legs,payouts,scenarios:[{weight:.6,outcomes:Object.fromEntries(legs.map(l=>[l.id,"win"]))},{weight:.4,outcomes:Object.fromEntries(legs.map(l=>[l.id,"loss"]))}]};
}
test("correlated scenarios support all sizes, not independence",()=>{const r=evaluateCards(fixture());for(let k=2;k<=6;k++){const x=r.sizes[k].topScenarioOnly[0];assert.ok(Math.abs(x.scenarioExpectedNet-.2)<1e-12);assert.equal(x.scenarioAllWinProbability,.6);assert.ok(Math.abs(x.dependencies[0].winCorrelation-1)<1e-12);assert.ok(x.independenceAllWinComparator<.6);}assert.equal(r.actualPlatformEVVerified,false);});
test("unavailable payout state is excluded",()=>{const x=fixture();x.scenarios[0].outcomes.p0="void";const r=evaluateCards(x);assert.equal(r.sizes[6].status,"no_eligible_scenarios");assert.equal(r.sizes[6].missingRules,1);});
test("repeat player or event excluded, invalid weights rejected",()=>{const x=fixture();x.legs[0].event=x.legs[1].event;assert.equal(evaluateCards(x).sizes[6].excluded,1);x.scenarios[0].weight=.7;assert.throws(()=>evaluateCards(x));});
