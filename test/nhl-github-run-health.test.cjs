"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {WATCH,summarizeNhlActionRuns}=require("../src/nhl-github-run-health.cjs");
const now="2026-11-07T01:00:00Z";
const url=id=>"https://github.com/Thedarkwillow/nhl-betting-platform/actions/runs/"+id;
const base={name:"NHL 9 AM Pacific Fresh Board and Changes",
 event:"schedule",created_at:"2026-11-07T00:00:00Z",
 status:"completed",conclusion:"failure",html_url:url(5)};
test("scheduled failure remains visible even when a CI push succeeds",()=>{
 const runs=[base,{...base,event:"push",conclusion:"success",html_url:url(6)}];
 const r=summarizeNhlActionRuns(runs,{now});
 assert.equal(r.observedRelevantRuns,1);
 assert.equal(r.observedFailures,1);
 assert.equal(r.status,"recent_workflow_failures_observed");
 assert.equal(r.lastRunByWorkflow[base.name].conclusion,"failure");
 assert.equal(r.paidProviderCalls,0);
});
test("missing schedules are unknown, not green; URLs and run scope are allowlisted",()=>{
 const r=summarizeNhlActionRuns([
  {...base,name:"Other workflow"},
  {...base,html_url:"https://malicious.example/jobs/5"},
  {...base,created_at:"2026-11-01T00:00:00Z"}
 ],{now});
 assert.equal(r.observedRelevantRuns,0);
 assert.equal(r.status,"actions_evidence_unavailable");
 assert.equal(r.scheduledRunMustBeIndependentlyVerified,true);
 assert.equal(r.falseNoFailureClaimsFromMissingRuns,false);
});
test("in-progress jobs count distinctly from completed provider failures",()=>{
 const a=summarizeNhlActionRuns([
  {...base,conclusion:"success",html_url:url(7)},
  {...base,name:"Grade Archived NHL Predictions",status:"in_progress",
   conclusion:null,html_url:url(8)}
 ],{now});
 assert.equal(a.observedFailures,0);
 assert.equal(a.observedNoncompleted,1);
 assert.equal(a.status,"workflow_runs_still_in_progress");
 assert.equal(a.watchlistWorkflows,WATCH.size);
});
test("action run auditing is deterministic and rejects impossible clocks",()=>{
 assert.deepEqual(summarizeNhlActionRuns([base],{now}),
  summarizeNhlActionRuns([base],{now}));
 assert.throws(()=>summarizeNhlActionRuns([],{now:"invalid"}),/Invalid/);
});
