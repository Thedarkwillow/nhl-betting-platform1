"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {aggregate,pairedResearch}=require("../src/nhl-paired-shadow-research.cjs");
const row=(game,player,actual,champion,shadows)=>{
 const mk=(side)=>side?{status:"research_only"}:{status:"missing"};
 return {gameId:game,playerId:player,market:"shotsOnGoal",line:2.5,
  outcome:{status:"decided",side:actual},originalSelectedSide:champion,
  shadow:{variants:{usage:mk(shadows?.usage),matchup:mk(shadows?.matchup),
   distribution:mk(shadows?.distribution)},decisions:{
    usage:{side:shadows?.usage},matchup:{side:shadows?.matchup},
    distribution:{side:shadows?.distribution}}}};
};
test("paired denominator is identical for champion and a supported challenger",()=>{
 const a=row(1,1,"Higher","Lower",{usage:"Higher",matchup:"Lower"});
 const b=row(2,2,"Lower","Lower",{usage:"Lower"});
 const p=pairedResearch([a,b],{originalPrecommitted:true});
 assert.equal(p.results.usage.pairedDecisions,2);
 assert.equal(p.results.usage.challengerCorrect,2);
 assert.equal(p.results.usage.championCorrect,1);
 assert.equal(p.results.usage.challengerOnlyCorrect,1);
 assert.equal(p.results.usage.championOnlyCorrect,0);
 assert.equal(p.results.matchup.pairedDecisions,1);
 assert.equal(p.results.matchup.championCorrect,0);
 assert.equal(p.results.matchup.challengerCorrect,0);
 assert.equal(p.results.matchup.modelOutperformanceProven,false);
 assert.equal(p.prospectiveModelEvidence,true);
});
test("pending, pushes, unsupported and duplicate source rows never improve a rate",()=>{
 const a=row(1,1,"Higher","Lower",{usage:"Higher"});
 const b={...row(2,2,"Higher","Higher",{usage:"Higher"}),outcome:{status:"pending_official_player_stat"}};
 const c={...row(3,3,"Higher","Higher",{usage:"Higher"}),outcome:{status:"push",side:"Push"}};
 const d=row(4,4,"Lower","Lower",{});
 const p=aggregate([a,a,b,c,d],"usage");
 assert.equal(p.pairedDecisions,1);
 assert.equal(p.championCorrect,0);
 assert.equal(p.challengerCorrect,1);
 assert.equal(p.exclusions.duplicate_exact_original_line,1);
 assert.equal(p.exclusions.not_decided_or_identity_missing,2);
 assert.equal(p.exclusions.challenger_not_supported_on_original_line,1);
 assert.equal(p.platformPayoutEV,null);
});
test("posthoc cohort is explicitly not reported as prospective",()=>{
 const p=pairedResearch([row(1,1,"Lower","Lower",{distribution:"Lower"})]);
 assert.equal(p.prospectiveModelEvidence,false);
 assert.equal(p.retrospectiveNotProspective,true);
 assert.equal(p.byMarket.shotsOnGoal.distribution.challengerCorrect,1);
});
