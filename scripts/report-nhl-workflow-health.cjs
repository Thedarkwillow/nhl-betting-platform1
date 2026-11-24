"use strict";
/** Read-only, no paid provider traffic. Appends a private GitHub Actions
 * operator summary and uploads a short-lived artifact from the workflow.
 */
const fs=require("node:fs"),path=require("node:path");
const {summarizeGitHubActions}=require("../src/nhl-actions-health.cjs");
const REPO="Thedarkwillow/nhl-betting-platform";
async function fetchActions(token,event,{client=fetch}={}){
 if(!token)throw Error("Missing GitHub Actions read token");
 const url="https://api.github.com/repos/"+REPO+"/actions/runs?per_page=100"+
  (event?"&event="+encodeURIComponent(event):"");
 const r=await client(url,{
  method:"GET",
  headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28","User-Agent":"nhl-private-actions-health"},
  signal:AbortSignal.timeout(18000)
 });
 if(!r?.ok)throw Error("GitHub Actions metadata HTTP "+Number(r?.status||0));
 const json=await r.json();
 if(!Array.isArray(json?.workflow_runs))throw Error("GitHub Actions metadata schema unavailable");
 return json.workflow_runs;
}
async function main({token=process.env.GITHUB_TOKEN,client=fetch,now=new Date().toISOString()}={}){
 // Query GitHub Actions alone, not sportsbook, NHL, or fantasy sources.
 const [recentRuns,scheduledRuns]=await Promise.all([
  fetchActions(token,null,{client}),fetchActions(token,"schedule",{client})
 ]);
 const report=summarizeGitHubActions({recentRuns,scheduledRuns,now});
 const filename=path.resolve(__dirname,"../outputs/health/nhl-actions-status.json");
 fs.mkdirSync(path.dirname(filename),{recursive:true});
 fs.writeFileSync(filename,JSON.stringify(report,null,2)+"\n");
 const table=[
  "# NHL GitHub Actions Scheduling Health",
  "",
  "Read-only workflow metadata, not proof of current prop availability or predictive accuracy.",
  "",
  "| Criticality | Workflow | Scheduled job state | Last schedule (UTC) | Scheduled age |",
  "|---|---|---|---|---|",
  ...report.workflows.map(w=>"| "+(w.critical?"Critical":"Research")+" | "+
   w.name+" | "+w.status+" | "+(w.latestScheduled?.createdAt||"unknown")+
   " | "+(w.scheduleAgeHours===null?"unknown":w.scheduleAgeHours+"h")+" |"),
  "",
  "Critical workflow issues: "+report.counts.criticalIssues+
  "; latest scheduled failures: "+report.counts.scheduleFailures+
  "; overdue schedules: "+report.counts.overdue+".",
  "",
  "Successful workflow execution does not prove successful provider data capture. Missing workflow history remains unknown, never marked as healthy."
 ].join("\n");
 if(process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,table+"\n");
 if(report.counts.criticalIssues||report.counts.scheduleFailures){
  console.log("::warning::NHL scheduled workflow failures/overdue jobs detected; inspect private nhl-actions-status artifact");
 }
 console.log(JSON.stringify({
  tracked:report.counts.monitored,latestScheduledFailures:report.counts.scheduleFailures,
  overdue:report.counts.overdue,criticalIssues:report.counts.criticalIssues,
  missingScheduleEvidence:report.counts.missingScheduleEvidence,
  providerRequests:0,wagersPlaced:0}));
 return report;
}
if(require.main===module)main().catch(e=>{
 console.error("::error::NHL GitHub Actions monitoring unavailable: "+e.message);
 process.exitCode=1;
});
module.exports={main,fetchActions};
