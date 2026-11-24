"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {dataset}=require("./build-nfl-partner-board-research.cjs");
const {score,KIND}=require("../src/nfl-independent-forward-evidence.cjs");
const {reconcile,compare}=require("../src/nfl-kicker-reconciled-appearances.cjs");
const root=path.resolve(__dirname,".."),dir="outputs/nfl/independent-source/forward-snapshots";
function git(args){return execFileSync("git",args,{cwd:root,encoding:"utf8",maxBuffer:32*1024*1024,timeout:20000}).trim();}
function frames(){
 const files=fs.existsSync(path.join(root,dir))?fs.readdirSync(path.join(root,dir)).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)):[];
 const out=[];
 for(const file of files){
  const rel=dir+"/"+file,commits=git(["log","--format=%H","--",rel]).split("\n").filter(Boolean);
  if(commits.length!==1)continue;
  const hash=commits[0],snapshot=JSON.parse(git(["show",hash+":"+rel]));
  if(snapshot.kind!==KIND)continue;
  out.push({snapshot,firstCommittedAt:git(["show","-s","--format=%cI",hash]),gitHistoryCount:1});
 }
 return out;
}
function main(){
 const policyAt=git(["log","--diff-filter=A","-1","--format=%cI","HEAD","--","src/nfl-independent-forward-evidence.cjs"]);
 const weeklyRows=[2024,2025,2026].flatMap(y=>dataset(y,"player_weekly")),schedule=dataset(2026,"schedule");
 const result=score(frames(),{weeklyRows,schedule,policyAt});
 const all={rows:[],reject:{}},kickerSchedule=[],kickerEvents=[];
 for(const y of [2024,2025,2026]){
  const schedule=dataset(y,"schedule"),kicks=dataset(y,"kicking_pbp");
  kickerSchedule.push(...schedule);kickerEvents.push(...kicks);
  const r=reconcile({schedule,rosters:dataset(y,"weekly_rosters"),snaps:dataset(y,"snap_counts"),kicks,teams:dataset(y,"team_weekly")});
  all.rows.push(...r.rows);for(const [k,v] of Object.entries(r.reject))all.reject[k]=(all.reject[k]||0)+v;
 }
 const kicking=compare(all);
 kicking.opportunityResearch=require("../src/nfl-kicker-opportunity-lab.cjs").study(all.rows,kickerSchedule,kickerEvents);
 const output={generatedAt:new Date().toISOString(),forward:result,kicking,retrospectiveGameScriptDependence:require("../src/lineup-dependence-bounds-research.cjs").nflProxy(kickerSchedule,weeklyRows),researchOnly:true,modelPromoted:false};
 output.playerContextCoverage=require("../src/nfl-player-context-evidence.cjs").report(weeklyRows,kickerSchedule,output.generatedAt.slice(0,10));
 output.offenseDefenseUsageAblation=require("../src/nfl-offense-defense-ablation.cjs").study(weeklyRows,kickerSchedule,[2024,2025,2026].flatMap(y=>dataset(y,"team_weekly")));
 output.dedicatedCoreHistoricalResearch=require("../src/nfl-dedicated-core-market-lab.cjs").study(weeklyRows,kickerSchedule);
 output.dedicatedComponentHistoricalResearch=require("../src/nfl-dedicated-component-lab.cjs").study(weeklyRows,kickerSchedule);
 output.standardReferencePaperSimulation=require("../src/standard-paper-reference.cjs").study(result.resolvedScenarioObservations);
 const eventInput={events:[2024,2025,2026].flatMap(y=>dataset(y,"pbp_specialty_events")),weekly:weeklyRows,schedule:kickerSchedule,kickers:all.rows};
 output.dedicatedPeriodHistoricalResearch=require("../src/nfl-dedicated-period-lab.cjs").study(eventInput);
 output.dedicatedOrderedEventResearch=require("../src/nfl-ordered-event-lab.cjs").study(eventInput);
 const target=path.join(root,"outputs/nfl/backtests/independent-source-forward-latest.json");
 let previous=null,priorEvidence=null;try{const old=JSON.parse(fs.readFileSync(target,"utf8"));previous=old.lineupCalibrationResearch;priorEvidence=old.firstObservedCalibrationState;}catch{}
 const lab=require("../src/forward-calibration-evidence.cjs");
 output.firstObservedCalibrationState=lab.observe(result.firstObservationInputs,priorEvidence,output.generatedAt);
 delete result.firstObservationInputs;
 output.hierarchicalCalibration=lab.study(output.firstObservedCalibrationState);
 output.originalPairDependence= require("../src/forward-pair-evidence.cjs").study(output.firstObservedCalibrationState);
 output.sameGameCopulaResearch=require('../src/same-game-frozen-copula-research-v1.cjs').study(output.firstObservedCalibrationState);
 output.sameGameCopulaPooledTierSensitivity=require('../src/same-game-frozen-copula-research-v1.cjs').study(output.firstObservedCalibrationState,{grouping:'market_side_pooled'});
 output.fixedTrial=require("../src/fixed-trial-evidence-gates.cjs").releaseReview({now:output.generatedAt});
 output.lineupCalibrationResearch=require("../src/lineup-count-mass-calibration-lab.cjs").observe(result.resolvedScenarioObservations,previous,output.generatedAt);
 output.lineupSlateCoverage=require("../src/lineup-evidence-slate-audit.cjs").audit(output.lineupCalibrationResearch);
 output.formatCoverage=require("../src/lineup-dependence-bounds-research.cjs").formatCoverage(result.formats,output.lineupCalibrationResearch);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(output,null,2)+"\n");
 console.log(JSON.stringify({registered:result.registered,resolved:result.resolved,contextPaired:result.contextPaired,
  formatGroups:Object.keys(result.formats).length,kicker: kicking.bySeason,calibrated:false,modelPromoted:false}));
 return output;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main,frames};
