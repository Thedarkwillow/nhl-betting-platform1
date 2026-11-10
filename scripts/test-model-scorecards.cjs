"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),
 fs=require("node:fs"),path=require("node:path");
const {viewModel}=require("../assets/model-scorecards.js");
const json=JSON.parse(fs.readFileSync(path.resolve(__dirname,"../data/model-scorecards.json"),"utf8"));
test("real public NHL grade report preserves small-market and outcome caution",()=>{
 const v=viewModel(json,"NHL");
 assert.equal(v.available,true);
 assert.equal(v.sport,"NHL");
 assert.equal(v.calibrated,false);
 assert.equal(v.verifiedPlatformSettlement,false);
 assert.match(v.heading,/Standard/);
 assert.match(v.detail,/Neither comparison establishes an edge/);
 assert.ok(v.markets.every(m=>m.decided>=0));
});
test("NFL numeric-only retrospectives are never counted as frozen Higher/Lower hits",()=>{
 const v=viewModel(json,"NFL");
 assert.equal(v.available,true);
 assert.equal(v.sport,"NFL");
 assert.equal(v.calibrated,false);
 assert.match(v.detail,/NOT preselected Higher\/Lower wins/);
 const x={...json,nfl:{...json.nfl,explicitlyFrozenDirections:{
   ...json.nfl.explicitlyFrozenDirections,decided:1,
   frozenSelections:0,correct:1,incorrect:0,push:0,pending:0}}};
 assert.equal(viewModel(x,"NFL").available,false);
});
test("invalid evidence, payout claims, missing privacy flags fail closed",()=>{
 for(const x of [
   {...json,kind:"bad"},
   {...json,evidenceWarnings:{...json.evidenceWarnings,payoutAdjustedEV:1}},
   {...json,evidenceWarnings:{...json.evidenceWarnings,originalGitPrecommitRequired:false}},
   {...json,evidenceWarnings:{...json.evidenceWarnings,calibratedHigherLowerProbabilities:true}}
 ]){
  assert.equal(viewModel(x,"NHL").available,false);
 }
 const page=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
 assert.match(page,/id="multiSportPicker"/);
 assert.match(page,/id="modelScorecardEvidence"/);
 assert.match(page,/assets\/model-scorecards\.js/);
 for(const secret of ['"playerId"','"originalOfferId"','"modelWeights"','"projectionId"'])
  assert.equal(JSON.stringify(json).includes(secret),false);
});
