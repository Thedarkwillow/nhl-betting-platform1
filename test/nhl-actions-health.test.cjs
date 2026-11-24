"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {summarizeGitHubActions,compactRun,TRACKED}=require("../src/nhl-actions-health.cjs");
const {fetchActions}=require("../scripts/report-nhl-workflow-health.cjs");
const now="2026-11-04T10:00:00Z";
const make=(name,created_at,conclusion="success",event="schedule")=>({
 id:41700000001,name,created_at,event,status:"completed",conclusion,
 html_url:"https://github.com/Thedarkwillow/nhl-betting-platform/actions/runs/41700000001",
 privateToken:"never copy this"
});
test("scheduled failure cannot be hidden by a newer successful push",()=>{
 const name="Grade Archived NHL Predictions";
 const scheduled=make(name,"2026-11-04T08:00:00Z","failure");
 const push=make(name,"2026-11-04T09:00:00Z","success","push");
 const r=summarizeGitHubActions({
  recentRuns:[scheduled,push],scheduledRuns:[scheduled],now,tracked:[TRACKED[1]]
 });
 assert.equal(r.workflows[0].status,"failed");
 assert.equal(r.workflows[0].latest.conclusion,"success");
 assert.equal(r.workflows[0].latestScheduled.conclusion,"failure");
 assert.equal(r.counts.criticalIssues,1);
 assert.equal(r.providerRequestCount,0);
 assert.equal(r.githubJobsProveProviderRows,false);
});
test("overdue critical schedule is flagged separately from provider success",()=>{
 const run=make("Collect NHL player stats","2026-11-02T02:00:00Z");
 const r=summarizeGitHubActions({
  recentRuns:[run],scheduledRuns:[run],now,tracked:[TRACKED[0]]
 });
 assert.equal(r.workflows[0].status,"overdue");
 assert.equal(r.counts.overdue,1);
 assert.equal(r.workflows[0].sourcePayloadVerified,false);
});
test("missing schedule history remains unknown and never green",()=>{
 const name="Collect NHL player stats",run=make(name,"2026-11-04T08:00:00Z","success","workflow_dispatch");
 const r=summarizeGitHubActions({recentRuns:[run],scheduledRuns:[],now,tracked:[TRACKED[0]]});
 assert.equal(r.workflows[0].status,"schedule_evidence_missing");
 assert.equal(r.counts.missingScheduleEvidence,1);
 assert.equal(r.counts.criticalIssues,0);
});
test("recent successful scheduled job proves workflow completion only",()=>{
 const run=make("Collect NHL player stats","2026-11-04T08:00:00Z");
 const r=summarizeGitHubActions({recentRuns:[run],scheduledRuns:[run],now,tracked:[TRACKED[0]]});
 assert.equal(r.workflows[0].status,"job_succeeded");
 assert.equal(r.workflows[0].sourcePayloadVerified,false);
 assert.equal(r.githubJobsProveProspectiveHitRate,false);
});
test("cancelled scheduled job is not a successful source capture",()=>{
 const run=make("Collect NHL player stats","2026-11-04T08:00:00Z","cancelled");
 const r=summarizeGitHubActions({recentRuns:[run],scheduledRuns:[run],now,tracked:[TRACKED[0]]});
 assert.equal(r.workflows[0].status,"cancelled");
});
test("invalid actions metadata, future events and forged URLs fail safely",()=>{
 assert.throws(()=>summarizeGitHubActions({recentRuns:null,scheduledRuns:[],now}),/Invalid/);
 const f=make("Collect NHL player stats","2026-11-05T10:00:00Z");
 const x=summarizeGitHubActions({recentRuns:[f],scheduledRuns:[f],now,tracked:[TRACKED[0]]});
 assert.equal(x.workflows[0].status,"schedule_evidence_missing");
 const bad=compactRun({...f,html_url:"https://evil.example.com/steal"});
 assert.equal(bad.url,null);
 assert.equal(bad.privateToken,undefined);
});
test("GitHub API collector requests only private action metadata, not sportsbook data",async()=>{
 let calls=0;
 const client=async(url,opts)=>{
  calls++;
  assert.match(url,/^https:\/\/api\.github\.com\/repos\/Thedarkwillow\/nhl-betting-platform\/actions\/runs\?/);
  assert.ok(!url.includes("prizepicksapi")&&!url.includes("odds-api"));
  assert.equal(opts.headers.Authorization,"Bearer private-token");
  return {ok:true,json:async()=>({workflow_runs:[]})};
 };
 assert.deepEqual(await fetchActions("private-token",null,{client}),[]);
 assert.deepEqual(await fetchActions("private-token","schedule",{client}),[]);
 assert.equal(calls,2);
 await assert.rejects(fetchActions("",null,{client}),/Missing GitHub/);
});
