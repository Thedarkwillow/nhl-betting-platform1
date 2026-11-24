"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit,study,clusterIntervals,TARGET}=require("../src/nhl-slate-cluster-validation.cjs");
function row(i=0,opts={}){
 const date=new Date(Date.UTC(2026,10,16+i,22)).toISOString();
 const commit=new Date(Date.parse(date)-3600000).toISOString();
 return {id:"r"+i,gameId:100+i,playerId:1000+i,market:"shotsOnGoal",line:2.5,tier:"Standard",
  selectedSide:i%2?"Higher":"Lower",officialResult:i%2?"Higher":"Lower",
  officialStat:i%2?3:2,selectionStatus:"correct",estimatedProbability:.65,
  firstCaptureAt:commit,firstResearchAt:commit,firstGitCommittedAt:commit,gameStartAt:date,...opts};
}
function ledger(records){const counts={registered:records.length,correct:0,incorrect:0,push:0,pending:0};
 for(const r of records)counts[r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus]++;
 return {kind:"private_immutable_source_linked_nhl_selected_predictions",cohort:"explicit_original_Git_precommitted_standalone_model_directions",records,counts};}
test("same-row paired scores and multiplicity-adjusted game/slate intervals are reproducible",()=>{
 const rows=Array.from({length:20},(_,i)=>row(i));const r=study(rows);
 assert.equal(r.point.hitRate,1);assert.equal(r.point.alwaysHigher,.5);
 assert.equal(r.point.modelMinusLower,.5);assert.equal(r.slate.clusters,20);
 assert.equal(r.game.perIntervalConfidence,1-.05/6);
 assert.ok(r.slate.intervals.brierMinusFairCoin.upper<0);
 assert.deepEqual(clusterIntervals(rows,r=>r.gameId),clusterIntervals(rows,r=>r.gameId));
 assert.equal(r.targetMet,false);
});
test("same slate is one cluster; insufficient evidence is not a positive claim",()=>{
 const a=Array.from({length:12},(_,i)=>row(i,{gameStartAt:"2026-12-15T22:00:00Z"}));
 const r=study(a);assert.equal(r.game.clusters,12);assert.equal(r.slate.clusters,1);
 assert.equal(r.slate.intervals,null);assert.equal(r.allIntervalDirectionsFavorable,false);
});
test("requires original first proof; deduplicates first threshold, excludes old predictions and stays research-only",()=>{
 const original=row(0),later={...original,id:"later",firstGitCommittedAt:"2026-11-16T21:10:00Z",firstResearchAt:"2026-11-16T21:10:00Z"};
 const r=audit(ledger([later,original,row(2)]),{firstPolicyCommit:"2026-11-17T00:00:00Z",asOf:"2026-11-20T00:00:00Z"});
 assert.equal(r.duplicateThresholdsExcluded,1);assert.equal(r.historicalDescriptive.counts.decisions,2);
 assert.equal(r.prospective.counts.decisions,1);assert.equal(r.windowComplete,false);
 assert.equal(r.prospectiveStatisticalCriteriaMet,false);assert.equal(r.bettingEdgeEstablished,false);
 assert.equal(r.payoutAdjustedROI,null);assert.equal(TARGET.decisions,2000);
 assert.equal(audit(ledger([original])).prospective.counts.decisions,0);
});
test("rejects bad counts, original outcome and conflicting earliest threshold",()=>{
 const r=row(0);const l=ledger([r]);l.counts.correct=99;
 assert.equal(audit(l).status,"inconsistent_ledger_counts");
 assert.equal(audit(ledger([{...r,officialStat:5}])).status,"invalid_original_row");
 assert.equal(audit(ledger([r,{...r,id:"duplicate",estimatedProbability:.8}])).status,"conflicting_first_threshold");
});
test("push and pending are never graded as misses",()=>{
 const push=row(0,{line:2,officialStat:2,officialResult:"Push",selectionStatus:"push"});
 const pending=row(1,{officialStat:null,officialResult:null,selectionStatus:"pending_official_player_stats"});
 const a=audit(ledger([push,pending]));
 assert.equal(a.historicalDescriptive.counts.decisions,0);
 assert.equal(a.historicalDescriptive.counts.pushes,1);assert.equal(a.historicalDescriptive.counts.pending,1);
});
