"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {offsetFit,study}=require("../src/nhl-tier-calibration-replay.cjs");
test("offset learns only from the supplied tier's multiple past games; no dependence on duplicated rows in one game",()=>{
 const prior=Array.from({length:75},(_,i)=>({gameId:i%15,officialGameDate:"2026-11-"+String(i%5+1).padStart(2,"0"),estimatedProbability:.8,selectionStatus:"incorrect"}));
 assert.equal(offsetFit(prior.slice(0,20),.8),null);
 assert.ok(offsetFit(prior,.8)<.8);
 const duplicate=[...prior,...prior.filter(x=>x.gameId===1)];
 assert.equal(offsetFit(duplicate,.8),offsetFit(prior,.8));
 assert.ok(offsetFit(prior,.8)>=.65);
});
test("empty data keeps all three tier intercept cohorts separate and unapproved",()=>{
 const r=study({kind:"private_immutable_source_linked_nhl_selected_predictions",cohort:"explicit_original_Git_precommitted_standalone_model_directions",records:[]});
 assert.deepEqual(Object.keys(r.tierOffsetReplay),["Standard","Goblin","Demon"]);
 assert.equal(r.tierOffsetReplay.Standard.offsetBrier,null);
 assert.equal(r.tierOffsetReplay.Goblin.calibrationApproved,false);
});
