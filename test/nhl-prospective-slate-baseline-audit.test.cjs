"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {audit}=require("../src/nhl-prospective-slate-baseline-audit.cjs");
const policy="2026-11-01T00:00:00Z";
function data(days){
 const rows=Array.from({length:days*3},(_,i)=>{
  const day=new Date(Date.UTC(2026,10,2+Math.floor(i/3))).toISOString().slice(0,10);
  return {id:"id"+i,gameId:1000+i,playerId:2000+i,tier:"Standard",
   firstGitCommittedAt:day+"T17:00:00Z",gameStartAt:day+"T23:00:00Z",
   estimatedProbability:.66,officialGameDate:day,selectedSide:"Higher",
   officialResult:i%3===0?"Higher":"Lower",
   selectionStatus:i%3===0?"correct":"incorrect"};
 });
 return {kind:"private_immutable_source_linked_nhl_selected_predictions",
  cohort:"explicit_original_Git_precommitted_standalone_model_directions",records:rows};
}
test("30 games over ten slates cannot satisfy 20-slate prospective evidence",()=>{
 const x=audit(data(10),policy);
 a.equal(x.decided,30);a.equal(x.distinctGames,30);
 a.equal(x.distinctPacificSlates,10);
 a.equal(x.preliminaryMinimumGamesMet,true);
 a.equal(x.minimumTwentyIndependentSlatesMet,false);
 a.ok(x.modelMinusAlwaysLower95ByGame);
 a.ok(x.modelMinusAlwaysLower95BySlate);
 a.equal(x.calibrationApproved,false);a.equal(x.bettingEdgeEstablished,false);
});
test("same-line original stat reconciliation, time and duplicate evidence fail closed",()=>{
 const bad=data(2);bad.records[1].selectionStatus="correct";
 a.equal(audit(bad,policy).status,"future_standard_original_outcome_reconciliation_failed");
 const dup=data(2);dup.records[1].id=dup.records[0].id;
 a.equal(audit(dup,policy).status,"invalid_original_first_git_identity");
 const noPolicy=audit(data(2),"not-a-policy-clock");
 a.equal(noPolicy.status,"unverified_registry_or_policy_clock");
});

test("original future NHL Standard market diagnosis is separate and cannot approve a filtered market",()=>{
 const d=data(21);
 d.records.forEach((r,i)=>r.market=i%3===0?"shotsOnGoal":"blockedShots");
 const x=audit(d,policy);
 a.equal(x.distinctPacificSlates,21);
 a.equal(x.byOriginalMarket.shotsOnGoal.decided,21);
 a.equal(x.byOriginalMarket.blockedShots.decided,42);
 a.equal(x.byOriginalMarket.shotsOnGoal.postHocMarketFilteringCouldOverfit,true);
 a.equal(x.byOriginalMarket.blockedShots.modelPromoted,false);
 a.equal(x.byOriginalMarket.blockedShots.preliminaryEvidenceGate,true);
 a.ok(x.byOriginalMarket.blockedShots.slateCluster95);
 a.equal(x.calibrationApproved,false);
});

test("dual same-line baselines report Higher as well as Lower without post-hoc promotion",()=>{
 const d=data(21);
 d.records.forEach((r,i)=>{
  r.market=i%3===0?"points":"shotsOnGoal";
  r.selectedSide=i%2?"Lower":"Higher";
  r.officialResult=r.selectedSide;
  r.selectionStatus="correct";
 });
 const x=audit(d,policy);
 a.equal(x.decided,63);
 a.equal(x.distinctPacificSlates,21);
 a.equal(x.alwaysHigherSameLines+x.alwaysLowerSameLines,1);
 a.equal(x.modelMinusAlwaysHigher>0,true);
 a.equal(x.modelMinusAlwaysLower>0,true);
 a.ok(x.modelMinusAlwaysHigher95BySlate);
 a.ok(x.modelMinusAlwaysLower95BySlate);
 a.equal(x.modelBeatsAlwaysHigherWithSlateClusterConfidence,true);
 a.equal(x.modelBeatsAlwaysLowerWithSlateClusterConfidence,true);
 a.equal(x.beatsBothBaselinesConsistently,true);
 a.equal(x.byOriginalMarket.points.slateClusterHigher95!==null,true);
 a.equal(x.byOriginalMarket.points.modelPromoted,false);
 a.equal(x.bettingEdgeEstablished,false);
 a.equal(x.calibrationApproved,false);
 a.equal(x.pairedByPacificSlate.length,21);
});
test("short samples cannot claim Standard consistently beats either baseline",()=>{
 const x=audit(data(5),policy);
 a.equal(x.distinctPacificSlates,5);
 a.equal(x.beatsBothBaselinesConsistently,false);
 a.equal(x.modelBeatsAlwaysHigherWithSlateClusterConfidence,false);
 a.equal(x.modelBeatsAlwaysLowerWithSlateClusterConfidence,false);
 a.equal(x.pairedByPacificSlate.length,5);
 a.equal(x.byOriginalMarket.unverified_market.preliminaryEvidenceGate,false);
});
