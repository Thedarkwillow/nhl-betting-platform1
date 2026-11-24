"use strict";
/** P01-06: summarize repo-local GitHub workflow evidence only.
 * Missing events are UNKNOWN, not success; data is read-only and
 * independently sourced from GitHub, not the betting API.
 */
const WATCH=new Set([
 "Bounded Daily NHL Pregame Freeze (Legacy Requests)",
 "NHL 9 AM Pacific Fresh Board and Changes",
 "Verify NHL Morning Board Captures and Flag Missing Runs",
 "Grade Archived NHL Predictions",
 "Trial Free PrizePicks NHL API",
 "Publish Sanitized NHL Dashboard Data",
 "NHL Seven-Workstream Daily Research Status (Read Only)"
]);
const events=new Set(["schedule","workflow_dispatch","workflow_run"]);
const outcomes=new Set(["success","failure","cancelled","skipped","timed_out","neutral","action_required"]);
function summarizeNhlActionRuns(runs,{now=new Date().toISOString(),windowHours=36}={}){
 const t=Date.parse(now);
 if(!Number.isFinite(t)||!Number.isInteger(windowHours)||windowHours<1||windowHours>72)
  throw Error("Invalid GitHub run health window");
 const recent=(Array.isArray(runs)?runs:[]).filter(r=>{
  const at=Date.parse(r?.created_at);
  return typeof r?.name==="string"&&WATCH.has(r.name)&&
   events.has(r.event)&&Number.isFinite(at)&&at<=t&&
   t-at<=windowHours*3600000&&typeof r.html_url==="string"&&
   /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(r.html_url);
 }).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 const byWorkflow={};
 for(const r of recent){
  if(byWorkflow[r.name])continue;
  byWorkflow[r.name]={
   name:r.name,trigger:r.event,startedAt:r.created_at,
   status:r.status==="completed"?"completed":"not_completed",
   conclusion:outcomes.has(r.conclusion)?r.conclusion:null,
   url:r.html_url
  };
 }
 const failures=recent.filter(x=>x.status==="completed"&&
  ["failure","cancelled","timed_out"].includes(x.conclusion));
 const pending=recent.filter(x=>x.status!=="completed");
 return {kind:"nhl_read_only_github_actions_activity_audit_v1",
  checkedAt:now,lookbackHours:windowHours,watchlistWorkflows:WATCH.size,
  observedRelevantRuns:recent.length,
  observedFailures:failures.length,
  observedNoncompleted:pending.length,
  lastRunByWorkflow:byWorkflow,
  recentFailureLinks:failures.slice(0,8).map(x=>({
   name:x.name,at:x.created_at,conclusion:x.conclusion,url:x.html_url})),
  status:recent.length===0?"actions_evidence_unavailable":
   failures.length?"recent_workflow_failures_observed":
   pending.length?"workflow_runs_still_in_progress":
   "no_failures_observed_in_limited_run_window",
  scheduledRunMustBeIndependentlyVerified:true,
  providerAccountCreditsNotChecked:true,paidProviderCalls:0,
  falseNoFailureClaimsFromMissingRuns:false};
}
module.exports={WATCH,summarizeNhlActionRuns};
