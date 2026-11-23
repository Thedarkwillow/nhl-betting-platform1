"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {evaluate}=require("./build-daily-grade-quality-gates.cjs");
const original=require("../data/daily-grade-2026-11-22.json");
test("Nov 22 independent NHL/NFL aggregates produce correct six-track risk classification",()=>{
 const x=evaluate(original),t=Object.fromEntries(x.tracks.map(y=>[y.id,y]));
 assert.equal(x.tracks.length,6);
 assert.equal(t.nhl_points.status,"needs_new_future_challenger");
 assert.equal(t.nhl_points.observed.decided,22);
 assert.equal(t.nhl_standard.status,"underperformed_same_line_baseline");
 assert.equal(t.nfl_rushing.status,"underperformed_market_benchmark");
 assert.equal(t.unresolved.nhlPending,4);
 assert.equal(t.unresolved.nflUnresolved,146);
 assert.equal(t.unresolved.nflFirstDistinctThresholdUnresolved,65);
 assert.equal(t.probability_payout.expectedValue,null);
 assert.equal(t.probability_payout.approvedLineups,0);
 assert.equal(t.automated_grading.status,"aggregate_evidence_reconciled");
 assert.equal(x.rawPropRowsExposed,0);
 assert.equal(x.modelPromoted,false);
});
test("corrupt NHL counts fail closed",()=>{
 const x=structuredClone(original);
 x.nhl.byTier.Standard.correct++;
 assert.throws(()=>evaluate(x),/Unsafe daily grade/);
});
test("unresolved NFL rows cannot be silently counted as losses",()=>{
 const x=structuredClone(original);
 x.nfl.incorrect+=146;
 assert.throws(()=>evaluate(x),/Unsafe daily grade/);
});
test("unverified settlement and ROI cannot be published",()=>{
 const x=structuredClone(original);
 x.payoutROI=.08;
 assert.throws(()=>evaluate(x),/Unsafe daily grade/);
});
test("partial official finals block confident market conclusions",()=>{
 const x=structuredClone(original);
 x.nhl.finalGames--;
 const r=evaluate(x);
 assert.equal(r.tracks[0].status,"awaiting_complete_final");
 assert.equal(r.gradedNhlFinalOnly,false);
});