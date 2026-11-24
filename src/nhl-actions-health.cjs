"use strict";
/**
 * Read-only GitHub Actions reliability report. Never infers successful data
 * collection from a green GitHub job; schedules may run with no fresh source
 * rows. Never requests a sports data provider or reads paid API credentials.
 */
const TRACKED=Object.freeze([
 {name:"Collect NHL player stats",maxScheduleGapHours:42,critical:true},
 {name:"Grade Archived NHL Predictions",maxScheduleGapHours:42,critical:true},
 {name:"Publish Sanitized NHL Dashboard Data",maxScheduleGapHours:6,critical:true},
 {name:"Collect NHL Sportsbook Odds",maxScheduleGapHours:42,critical:false},
 {name:"Capture Approved MoneyPuck and Daily Faceoff NHL Research",maxScheduleGapHours:42,critical:false}
]);
const VALID_CONCLUSIONS=new Set(["success","failure","timed_out","cancelled","action_required","skipped","neutral"]);
function time(s){
 if(typeof s!=="string")return null;
 const d=Date.parse(s);
 return Number.isFinite(d)?d:null;
}
function compactRun(r){
 if(!r||typeof r.name!=="string"||time(r.created_at)===null)return null;
 return {
  name:r.name,
  id:Number.isSafeInteger(r.id)&&r.id>0?r.id:null,
  event:typeof r.event==="string"?r.event:null,
  createdAt:new Date(time(r.created_at)).toISOString(),
  status:r.status==="completed"?"completed":"ongoing",
  conclusion:VALID_CONCLUSIONS.has(r.conclusion)?r.conclusion:null,
  url:typeof r.html_url==="string"&&/^https:\/\/github\.com\/Thedarkwillow\/nhl-betting-platform\/actions\/runs\/[0-9]+$/.test(r.html_url)?r.html_url:null
 };
}
function summarizeGitHubActions({recentRuns,scheduledRuns,now=new Date().toISOString(),tracked=TRACKED}){
 const nowMs=time(now);
 if(nowMs===null||!Array.isArray(recentRuns)||!Array.isArray(scheduledRuns))
  throw Error("Invalid GitHub actions health input");
 const summarize=(runs,name)=>runs.map(compactRun).filter(r=>r&&r.name===name&&
  time(r.createdAt)<=nowMs).sort((a,b)=>time(b.createdAt)-time(a.createdAt));
 const workflows=[];
 for(const {name,maxScheduleGapHours,critical} of tracked){
  const any=summarize(recentRuns,name),sched=summarize(scheduledRuns,name),
   latestAny=any[0]||null,latestScheduled=sched[0]||null;
  const age=latestScheduled?Number(((nowMs-time(latestScheduled.createdAt))/3600000).toFixed(2)):null;
  const overdue=age!==null&&age>maxScheduleGapHours;
  // Provider outage is not equivalent to missing job. Conversely a green
  // workflow only verifies the action concluded, not that offers existed.
  const failedLatestSchedule=latestScheduled?.status==="completed"&&
   ["failure","timed_out","action_required"].includes(latestScheduled.conclusion);
  const cancelledLatestSchedule=latestScheduled?.conclusion==="cancelled";
  const state=failedLatestSchedule?"failed":overdue?"overdue":
   cancelledLatestSchedule?"cancelled":
   !latestScheduled?"schedule_evidence_missing":
   latestScheduled.status==="ongoing"?"running":
   latestScheduled.conclusion==="success"?"job_succeeded":
   "unverified";
  workflows.push({name,critical,maxScheduleGapHours,latest:latestAny,
   latestScheduled,scheduleAgeHours:age,failedLatestSchedule,
   scheduleOverdue:overdue,status:state,
   sourcePayloadVerified:false,predictionAccuracyVerified:false});
 }
 const failures=workflows.filter(r=>r.failedLatestSchedule);
 const overdue=workflows.filter(r=>r.scheduleOverdue);
 const criticalIssues=workflows.filter(r=>r.critical&&(r.failedLatestSchedule||r.scheduleOverdue));
 return {schemaVersion:1,kind:"nhl_github_actions_operational_health",
  asOf:new Date(nowMs).toISOString(),
  counts:{monitored:workflows.length,scheduleFailures:failures.length,
   overdue:overdue.length,criticalIssues:criticalIssues.length,
   missingScheduleEvidence:workflows.filter(r=>r.status==="schedule_evidence_missing").length},
  workflows,
  warnings:criticalIssues.map(x=>x.name+" "+x.status),
  githubJobsProveProviderRows:false,githubJobsProveProspectiveHitRate:false,
  providerRequestCount:0,
  apiUsage:"GitHub Actions metadata only; does not fetch sports feeds or spend provider credits"
 };
}
module.exports={summarizeGitHubActions,compactRun,TRACKED};
