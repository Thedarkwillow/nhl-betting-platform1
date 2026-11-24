"use strict";
const fs=require("node:fs"),path=require("node:path");
const {buildNhlSevenReadiness}=require("../src/nhl-seven-roadmap-readiness.cjs");
const {watchdog}=require("../src/nhl-morning-board-monitor.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>{
 try{return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}
 catch{return null;}
};
function main({now=new Date().toISOString(),write=true}={}){
 const snapshotDir=path.join(root,"outputs/free-source/nhl/snapshots");
 const names=fs.existsSync(snapshotDir)?
  fs.readdirSync(snapshotDir).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x))
   .map(x=>path.join(snapshotDir,x)):[];
 const delta=read("outputs/free-source/nhl/movement-latest.json");
 const morning=watchdog({now,files:names,
  readFile:p=>fs.readFileSync(p,"utf8"),movement:delta});
 const report=buildNhlSevenReadiness({now,
  board:read("outputs/free-source/nhl/latest.json"),
  research:read("outputs/free-source/nhl/research-latest.json"),
  grading:read("outputs/grading/nhl-latest.json"),
  ledger:read("outputs/research/registry/nhl-precommitted-ledger-latest.json"),
  shadow:read("outputs/backtests/nhl-approved-source-prospective-latest.json"),
  platform:read("outputs/comparisons/nhl-platform-line-shop-latest.json"),
  watchdog:morning,movement:delta,
  availability:read("outputs/pregame-availability/latest.json"),
  site:read("site/data.json"),
  actionRuns:read("outputs/health/nhl-github-run-window.json")});
 if(write){
  const dest=path.join(root,"outputs/health/nhl-seven-workstream-readiness.json");
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(report,null,2)+"\n");
 }
 const s=report.operations,g=report.grading,m=report.model,l=report.lineups,
  goal=report.goalie,p=report.crossPlatform;
 const summary=[
  "# NHL seven-workstream research operations",
  "Generated at "+now+". Read-only. No provider calls, credits spent or wagers.",
  "",
  "| Roadmap area | Current evidence |",
  "| --- | --- |",
  "| 1. Source/operations | "+s.status+" · "+s.offeredSideRows+
   " offered-side rows · actual morning 06:00 "+s.morningActualSixComplete+
   " / 09:00 "+s.morningActualNineComplete+" · last archived quota "+
   s.quotaUnit+" · balance "+(s.archivedLastKnownCreditBalance??"unknown")+" (not live) |",
  "| GitHub workflow runs | "+s.githubActions.status+
   " · "+s.githubActions.observedRelevantRuns+" observed relevant runs in "+
   s.githubActions.lookbackHours+" hours · "+
   s.githubActions.observedFailures+" failures (missing runs are not success) |",
  "| 2. Model validation | "+m.status+" · "+m.gradedForecasts+
   " exploratory scored forecasts across "+m.independentOfficialGames+
   " games · no candidate promoted |",
  "| 3. Grading | "+g.status+" · "+g.decided+" decided / "+g.pushes+
   " push / "+g.pending+" pending · official-stat results, not fantasy settlement |",
  "| 4. Website | "+report.website.status+" · source data status must be visible on mobile |",
  "| 5. Lineup simulation | "+l.status+" · joint probability and payout-specific EV unavailable |",
  "| 6. Goalie/injury | "+goal.goalieNeedsReview+
   " goalie-side rows awaiting review · original club starters unverified |",
  "| 7. PrizePicks/Underdog | "+p.status+" · "+p.matchedStandardSides+
   " licensed, source-fresh matched comparison sides |",
  "",
  "No actual first-party PrizePicks/Underdog availability, realized payouts, calibrated edge or guarantee inferred.",
  ""
 ].join("\n");
 if(process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
 console.log(summary);
 return report;
}
if(require.main===module)try{main()}catch(e){console.error("::error::"+e.message);process.exitCode=1;}
module.exports={main};
