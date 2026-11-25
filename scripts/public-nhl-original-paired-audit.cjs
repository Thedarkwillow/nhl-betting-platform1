"use strict";
const fs=require("node:fs"),path=require("node:path");
const {originalFrames}=require("./report-nhl-standard-triple-challengers.cjs");
const {shadowFrames}=require("../src/nhl-standard-triple-challenger-grader.cjs");
const {scoreboard}=require("../src/nhl-standard-forward-scoreboard.cjs");
const {execFileSync}=require("node:child_process");
function main(){
 const root=fs.realpathSync(process.env.RESEARCH_ARCHIVE_ROOT||".");
 if(root===path.resolve(__dirname,".."))throw Error("Original archive required");
 const h=JSON.parse(fs.readFileSync(path.join(root,"outputs/history/players.json"),"utf8"));
 const f=originalFrames(),s=shadowFrames(f,h,{mode:"original_precommitted_only"});
 const r=scoreboard(s.rows);
 const compact=x=>Object.fromEntries(Object.entries(x.byVariant).map(([k,v])=>[k,{n:v.decided,games:v.distinctGames,dates:v.distinctDates,championRate:v.championRate,challengerRate:v.challengerRate,alwaysHigher:v.decided?v.alwaysHigherOnSameLines/v.decided:null,alwaysLower:v.decided?v.alwaysLowerOnSameLines/v.decided:null,championBrier:v.championBrier,challengerBrier:v.challengerBrier,neutralBrier:v.neutralProbabilityBrier,skillVsNeutral:v.challengerBrierSkillVsNeutral,beatsBothConstantDirections:v.challengerBeatsBothConstantDirections,challengerLogLoss:v.challengerLogLoss,neutralLogLoss:v.neutralProbabilityLogLoss,intervals:v.pairedGameClusterBootstrap?.intervals??null,minimumSample:v.eligibleForMinimumSample}]));
 const out={kind:"public_nhl_original_paired_cluster_audit_v1",decided:r.all.gradedOriginalLines,all:compact(r.all),byMarket:Object.fromEntries(Object.entries(r.byMarket).map(([k,v])=>[k,compact(v)])),modelPromoted:false,platformSettlementVerified:false,rawRowsPublished:0,paidRequests:0};
 console.log(JSON.stringify(out));
 const sog=s.rows.filter(r=>r.market==="shotsOnGoal");
 const decided=sog.filter(r=>r.outcome.status==="decided");
 const from=require("../src/nhl-standard-forward-scoreboard.cjs").eligible;
 const gates={};
 for(const name of ["sogOpportunity","sogAttempts","sogMovement"]){
  const a=decided.filter(r=>from(r,"champion")&&from(r,name));
  const wins=a.filter(r=>r.shadow.decisions[name].side===r.outcome.side).length;
  const champion=a.filter(r=>r.shadow.decisions.champion.side===r.outcome.side).length;
  const high=a.filter(r=>r.outcome.side==="Higher").length;
  const games=new Set(a.map(r=>r.gameId)).size,dates=new Set(a.map(r=>r.gameDate)).size;
  gates[name]={n:a.length,games,dates,wins,champion,alwaysHigher:high,alwaysLower:a.length-high,coverage:decided.length?a.length/decided.length:0,minimumEvidence:a.length>=100&&games>=30&&dates>=10,beatsChampionAndDirections:wins>Math.max(champion,high,a.length-high)};
 }
 console.log(JSON.stringify({kind:"nhl_sog_original_forecast_coverage_v1",registered:sog.length,decided:decided.length,pending:sog.length-decided.length-sog.filter(r=>r.outcome.status==="push").length,variants:gates,firstGitFrozen:true,productionApproved:false,rawRowsPublished:0,paidRequests:0}));
 const {evaluate}=require("../src/nhl-standard-rolling-calibration-research.cjs");
 console.log(JSON.stringify(evaluate(s.rows)));
 console.log(JSON.stringify({...evaluate(s.rows,{minimumDayGap:2}),kind:"nhl_rolling_calibration_lag_sensitivity_v1"}));
}
if(require.main===module)try{main()}catch{console.error("Original paired audit failed closed");process.exitCode=1;}
