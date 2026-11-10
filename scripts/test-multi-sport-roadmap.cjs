"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),
 fs=require("node:fs"),path=require("node:path");
const {viewModel,movementView}=require("../assets/multi-sport-roadmap.js");
const source=JSON.parse(fs.readFileSync(path.join(__dirname,"../data/nhl-nfl-freeze-status.json"),"utf8"));
const clock=Date.parse(source.sourceCaptureFinishedUTC);
test("NHL and NFL public research counts are real precommitted aggregate evidence",()=>{
 const nhl=viewModel(source,"NHL",clock+1000);
 const nfl=viewModel(source,"NFL",clock+1000);
 assert.equal(nhl.available,true);
 assert.equal(nfl.available,true);
 assert.equal(nhl.counts.frozen,source.pregameSelections.NHL.count);
 assert.equal(nfl.counts.standard,source.pregameSelections.NFL.standard);
 assert.equal(nfl.calibrated,false);
 assert.equal(nhl.platformOffersVerified,false);
 assert.equal(nfl.paidLineupEVAvailable,false);
});
test("older snapshot becomes an archived research record, never a live offer",()=>{
 const x=viewModel(source,"NFL",clock+40*60000);
 assert.equal(x.available,true);
 assert.equal(x.sourceFresh,false);
 assert.match(x.explanation,/NOT current live availability/);
});
test("forged or inconsistent provenance cannot produce model picks",()=>{
 const invalid=[
  {...source,firstGitAdditionVerified:false},
  {...source,originalModelDirectionsBeforeKickoff:false},
  {...source,sourceCaptureFinishedUTC:"2050-11-09T17:22:17Z"},
  {...source,sameCommitForBothSports:false},
  {...source,pregameSelections:{...source.pregameSelections,NFL:{count:"115",standard:115}}}
 ];
 for(const v of invalid){
  const x=viewModel(v,"NFL",clock+1000);
  assert.equal(x.available,false);
  assert.equal(x.counts,null);
 }
});
test("site inserts sport selector without exposing private prop lines or model internals",()=>{
 const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
 assert.match(html,/id="multiSportEvidence"/);
 assert.match(html,/id="multiSportPicker"/);
 assert.match(html,/assets\/multi-sport-roadmap\.js/);
 assert.match(html,/NHL-only/);
 assert.equal(source.noRawLinesPlayersOrPrivateModelsPublished,true);
 assert.equal(JSON.stringify(source).includes('"playerId"'),false);
});

test("sport picker shows only independently archived NFL and NHL line-change counts",()=>{
 const d=JSON.parse(fs.readFileSync(path.join(__dirname,
  "../data/source-line-movement.json"),"utf8"));
 const at=Date.parse(d.laterCaptureAt)+3600000;
 const nfl=movementView(d,"NFL",at);
 const nhl=movementView(d,"NHL",at);
 assert.match(nfl,/cross-day source comparison/);
 assert.match(nfl,/98 matching-offer lines changed/);
 assert.match(nfl,/6 offered-side changes/);
 assert.match(nfl,/NOT confirmed removals/);
 assert.match(nfl,/Archived research; not current app availability/);
 assert.match(nhl,/No shared offer IDs/);
 const bad={...d,originalOffersFromPartnerSourceNotVerifiedPrizePicksApp:false};
 assert.match(movementView(bad,"NFL",at),/no verified comparison/);
 const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
 assert.match(html,/data-multi="movement"/);
 assert.equal(d.privateOfferIDsPublished,0);
 assert.equal(d.rawLinesPublished,0);
});
