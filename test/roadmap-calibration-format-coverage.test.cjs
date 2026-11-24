"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fit,study}=require("../src/nhl-tier-calibration-replay.cjs");
const {formatCoverage}=require("../src/lineup-dependence-bounds-research.cjs");
test("tier calibration needs prior sample and independent game support; no empty-bin estimate",()=>{
 const rows=Array.from({length:25},(_,i)=>({estimatedProbability:.65,gameId:i%12,selectionStatus:i<10?"correct":"incorrect"}));
 assert.equal(fit(rows,.85),null);
 assert.equal(fit(rows.map(r=>({...r,gameId:1})),.65),null);
 assert.ok(Math.abs(fit(rows,.65)-(10+20*.65)/45)<1e-9);
});
test("tier replay rejects unverified ledger and distinguishes all three empty tiers",()=>{
 assert.equal(study({records:[]}).status,"unverified_original_ledger");
 const l={kind:"private_immutable_source_linked_nhl_selected_predictions",cohort:"explicit_original_Git_precommitted_standalone_model_directions",records:[]};
 const s=study(l);assert.deepEqual(Object.keys(s.byTier),["Standard","Goblin","Demon"]);
 assert.equal(s.byTier.Demon.fittedBrier,null);assert.equal(s.prospectiveCalibration,false);
});
test("format coverage preserves all nine legal size/format categories without fabricated probabilities",()=>{
 const s=formatCoverage({power_2:{registered:3,decided:1,pending:2},flex_4:{registered:1,decided:0,pending:1}},{byFormat:{power_2:{distinctResolvedSlates:1,heldoutSlates:0}}});
 assert.equal(Object.keys(s).length,9);assert.equal(s.flex_2,undefined);assert.equal(s.power_2.distinctResolvedSlates,1);assert.equal(s.flex_4.status,"awaiting_final_evidence");assert.equal(s.flex_6.status,"no_original_scenarios");assert.equal(s.power_2.verifiedJointProbability,null);
});

test("joint shrinkage baseline observes only prior dated games and remains synthetic",()=>{const {pairStudy}=require("../src/lineup-dependence-bounds-research.cjs");const rows=Array.from({length:30},(_,i)=>({gameId:i+1,day:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),a:i%2,b:i%2}));const r=pairStudy(rows,{firstHoldout:"2026-01-21"});assert.equal(r.heldoutGames,10);assert.ok(Number.isFinite(r.shrunkCoherentJointBrier));assert.equal(r.usesMarginalDependenceBounds,true);assert.equal(r.productionEligible,false);});
