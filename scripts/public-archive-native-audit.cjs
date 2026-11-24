"use strict";
const fs=require("node:fs"),path=require("node:path");
const nfl=require("./backtest-nfl-historical-stats.cjs");
const count=x=>{if(!Number.isSafeInteger(x)||x<0)throw Error("Invalid aggregate count");return x;};
function nflSummary(loaded,replay){
 if(replay?.counts?.sameWeekWithheld!==true)throw Error("Chronology contract failed");
 return {kind:"public_native_nfl_archive_replay_v1",classification:"retrospective_stats_only_not_original_prop_hit_rate",
  seasons:loaded.sourceCounts.map(x=>({year:count(x.year),weeklyRows:count(x.weeklyRows),kickerGameRows:count(x.kickerGameRows)})),
  inputRows:count(replay.counts.inputRows),evaluated2025:count(replay.counts.yearsScored[2025]??0),
  evaluated2026:count(replay.counts.yearsScored[2026]??0),sameWeekWithheld:true,
  paidRequests:0,rawRowsPublished:0,modelPromoted:false,calibrationApproved:false};
}
function nhlSummary(r){
 if(r?.kind!=="nhl_original_lines_separate_historical_and_forward_summary_v1"||
  r.historicalReconstructionNotPregameFrozen!==true||
  r.prospectiveModelPredictionsMustHaveBeenFrozenBeforeEvent!==true||
  r.calibrated!==false||r.modelPromoted!==false||r.placedWagers!==0)
  throw Error("NHL original-line cohort contract failed");
 const cohort=x=>{const eligible=count(x.eligible),wins=count(x.winNew),losses=count(x.lossNew);
  if(wins+losses!==eligible)throw Error("Inconsistent NHL cohort counts");
  return {eligible,wins,losses,hitRate:eligible?wins/eligible:null};};
 return {kind:"public_native_nhl_archive_replay_v1",historical:cohort(r.historical),prospective:cohort(r.prospective),
  cohortsSeparate:true,paidRequests:0,rawRowsPublished:0,modelPromoted:false,calibrationApproved:false};
}
function main(){
 const [sport,archiveRoot,reportRoot]=process.argv.slice(2);
 if(!["NHL","NFL"].includes(sport)||!archiveRoot||!reportRoot)throw Error("Explicit archive and report roots required");
 const a=fs.realpathSync(archiveRoot),out=fs.realpathSync(reportRoot),code=path.resolve(__dirname,"..");
 if(a===code||out===code||out===a||out.startsWith(a+path.sep)||out.startsWith(code+path.sep))
  throw Error("Archive/report roots must be separate from public code");
 if(sport==="NFL"){
  const d=nfl.loadObservations(a);
  return nflSummary(d,nfl.chronology(d.observations));
 }
 process.env.RESEARCH_ARCHIVE_ROOT=a;process.env.RESEARCH_REPORT_ROOT=out;
 const prior=console.log;let r;
 try{console.log=()=>{};r=require("./report-nhl-dual-real-line-hit-rates-v1.cjs").main();}
 finally{console.log=prior;}
 return nhlSummary(r);
}
if(require.main===module){try{console.log(JSON.stringify(main()));}catch{console.error("Public-native archive audit failed closed; raw diagnostics withheld");process.exitCode=1;}}
module.exports={nflSummary,nhlSummary};
