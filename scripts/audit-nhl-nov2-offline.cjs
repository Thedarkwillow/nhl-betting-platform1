"use strict";
/**
 * Reproducible offline diagnostic. Reads original immutable snapshot Git
 * history and cached official NHL results. Never calls a provider.
 */
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {freezeIndividualPreferences}=require("../src/nhl-frozen-individual-props.cjs");
const {auditDay}=require("../src/nhl-nov2-retrospective.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
function main(){
 const dir=path.join(root,"outputs/research/snapshots");
 const files=fs.readdirSync(dir).filter(f=>/^\d{8}T\d{6}Z\.json$/.test(f)).sort();
 if(!files.length)throw Error("No original frozen research snapshots");
 const frames=files.map(file=>{
  const relative="outputs/research/snapshots/"+file;
  const firstCommittedAt=execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","--",relative],
   {cwd:root,encoding:"utf8",timeout:12000}).trim()||null;
  const gitHistoryCount=Number(execFileSync("git",["rev-list","--count","HEAD","--",relative],
   {cwd:root,encoding:"utf8",timeout:12000}).trim());
  return {snapshot:read(relative),firstCommittedAt,gitHistoryCount,path:relative};
 });
 const schedule=read("outputs/official-nhl/season-schedules/2026-27.json");
 if(schedule.complete!==true||!Array.isArray(schedule.games))throw Error("Official season schedule unverified");
 const selections=freezeIndividualPreferences(frames,schedule.games);
 const history=read("outputs/history/players.json");
 const frozenAudit=read("outputs/grading/nhl-latest.json").individualPropAudit;
 const results=[];
 const dest=path.join(root,"outputs/backtests");
 fs.mkdirSync(dest,{recursive:true});
 for(const day of ["2026-11-02","2026-11-03"]){
  const report={...auditDay(selections.legacy,history,frozenAudit,day),
   generatedAt:new Date().toISOString(),
   input:{originalSnapshotCount:frames.length,
    sourceOriginalGitCommitsVerified:frames.filter(x=>x.gitHistoryCount===1).length,
    fullyOfficialScheduleVerified:true,normalizedFromOriginalArchiveOnly:true}};
  if(report.oldModel.evaluatedDecisions<1||report.oldModel.distinctOfficialGames<1)
   throw Error("No valid "+day+" pregame quoted lines and official results");
  if(frozenAudit?.legacyRetrospective?.byGameDate?.[day]?.decided!==report.oldModel.evaluatedDecisions)
   throw Error(day+" cohort mismatch against original grader");
  const filename=path.join(dest,"nhl-"+day+"-original-line-diagnostic.json");
  fs.writeFileSync(filename,JSON.stringify(report,null,2)+"\n");
  results.push({date:day,decisions:report.oldModel.evaluatedDecisions,
   correct:report.oldModel.correct,observedRate:report.oldModel.observedRate,
   meanEstimatedProbability:report.oldModel.meanUncalibratedProbability,
   alwaysLower:report.oldModel.alwaysLowerRate,
   challengerRows:report.alternativeModels.eligibleSameLineDecisions,
   prospectivePrecommittedDecisions:0,modelPromoted:false});
 }
 const aggregate={schemaVersion:1,kind:"nhl_nov2_nov3_retrospective_reliability_report",
  generatedAt:new Date().toISOString(),dates:results,
  decisionCount:results.reduce((s,x)=>s+x.decisions,0),
  correct:results.reduce((s,x)=>s+x.correct,0),
  combinedObservedRate:results.reduce((s,x)=>s+x.correct,0)/results.reduce((s,x)=>s+x.decisions,0),
  precommittedSelectionCount:0,
  modelPromotionApproved:false,calibrationApproved:false,bettingProfitVerified:false,
  notes:"Original pregame quoted directions were selected using a rule finalized after games. No future-game data in candidate estimates. Dates and correlated props are not independent held-out datasets; illustrative retrospective diagnostics only."};
 fs.writeFileSync(path.join(dest,"nhl-nov2-nov3-retrospective-summary.json"),
  JSON.stringify(aggregate,null,2)+"\n");
 console.log(JSON.stringify({...aggregate,providerRequests:0}));
 return aggregate;
}
if(require.main===module)try{main()}catch(e){console.error("Nov 2 retrospective diagnostic failed: "+e.message);process.exitCode=1;}
module.exports={main};
