"use strict";const test=require("node:test"),assert=require("node:assert/strict"),{exposure,audit,originalLinePairedCI}=require("../src/nhl-exact-line-exposure-audit.cjs");
function fixture(){return Array.from({length:20},(_,i)=>({gameDate:"2026-01-"+String(i+1).padStart(2,"0"),type:"skater",timeOnIceSeconds:1000+i*5,shotsOnGoal:i%5,points:i%3,powerPlayTimeOnIceSeconds:100+i*5,powerPlayPoints:i%2===0&&i%3>0?1:0}));}
test("TOI estimators and PP split from past observed exposure only",()=>{const p=fixture(),r=exposure(p,"points",.5);assert.ok(r.stableTOI<r.baseTOI);assert.ok(r.ppTOI>0);assert.ok(r.withPP>=0&&r.withPP<=1);assert.equal(r.ppMode,"exact_historical_PP_and_non_PP_point_counts");});
test("missing PP cannot be silently assigned zero",()=>{const p=fixture().map(({powerPlayTimeOnIceSeconds,...g})=>g);const r=exposure(p,"shotsOnGoal",2.5);assert.equal(r.ppTOI,null);assert.equal(r.withPP,null);});
test("empty cohort cannot establish evidence",()=>{const r=audit({records:[]},{players:{}},{source:"Official NHL Web API",complete:true,games:[]},{});assert.deepEqual(r.byMarket,{});assert.equal(r.promotionApproved,false);assert.equal(r.prospectiveEvidence,false);});

test("tampered official outcomes and mismatched counts refuse replay",()=>{
 const empty={kind:"private_immutable_source_linked_nhl_selected_predictions",
  cohort:"explicit_original_Git_precommitted_standalone_model_directions",
  counts:{registered:1,correct:0,incorrect:0,push:0,pending:0},records:[]};
 const out=audit(empty,{players:{}},{source:"Official NHL Web API",complete:true,games:[]},{});
 assert.equal(out.evidenceValid,false);
 assert.equal(out.prospectiveEvidence,false);
 assert.deepEqual(out.byMarket,{});
});
test("same original Lower selection uses P(Higher), not selected-side probability",()=>{
 const prior=Array.from({length:20},(_,i)=>({
  gameId:20260000+i,playerId:17,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  gameState:"OFF",type:"skater",team:"NYR",timeOnIceSeconds:1000,
  shotsOnGoal:i%4,points:i%2,powerPlayTimeOnIceSeconds:120,
  powerPlayPoints:i%2
 }));
 const g={...prior.at(-1),gameId:2026111701,gameDate:"2026-11-17",shotsOnGoal:1};
 const all=[...prior,g],schedule={source:"Official NHL Web API",complete:true,
  games:all.map(a=>({id:a.gameId,gameDate:a.gameDate,home:"NYR",away:"BOS",
   startTimeUTC:a.gameDate+"T23:00:00Z"}))};
 const r={id:"original17",gameId:g.gameId,playerId:g.playerId,gameStartAt:"2026-11-17T23:00:00Z",
  firstCaptureAt:"2026-11-17T16:00:00Z",firstResearchAt:"2026-11-17T16:01:00Z",
  firstGitCommittedAt:"2026-11-17T16:02:00Z",tier:"Standard",market:"shotsOnGoal",
  selectedSide:"Lower",estimatedProbability:.62,line:2.5,team:"NYR",
  selectionStatus:"correct",officialResult:"Lower",officialStat:1};
 const ledger={kind:"private_immutable_source_linked_nhl_selected_predictions",
  cohort:"explicit_original_Git_precommitted_standalone_model_directions",
  records:[r],counts:{registered:1,correct:1,incorrect:0,push:0,pending:0}};
 const replay=audit(ledger,{players:{"17":{games:all}}},schedule,{shotsOnGoal:"empirical"});
 assert.equal(replay.evidenceValid,true);
 assert.equal(replay.byMarket.shotsOnGoal.n,1);
 assert.equal(replay.byMarket.shotsOnGoal.baselineHitRate,1);
 assert.equal(replay.byMarket.shotsOnGoal.alwaysLower,1);
 assert.equal(replay.prospectiveEvidence,false);
 assert.equal(replay.promotionApproved,false);
 const tampered=audit({...ledger,records:[{...r,selectionStatus:"incorrect"}]},
  {players:{"17":{games:all}}},schedule,{shotsOnGoal:"empirical"});
 assert.equal(tampered.evidenceValid,false);
});

test("actual-line CI text reflects candidate-minus-original Brier, never synthetic threshold",()=>{
 const ci=originalLinePairedCI(Array.from({length:12},()=>({n:1,diff:-.04})));
 assert.ok(ci&&ci.lower<0&&ci.upper<0);
 assert.match(ci.metric,/original_lines/);
 assert.match(ci.interpretation,/original Standard thresholds/);
 assert.match(ci.interpretation,/Negative favors the reconstructed candidate/);
 assert.doesNotMatch(ci.interpretation,/synthetic thresholds/);
});
