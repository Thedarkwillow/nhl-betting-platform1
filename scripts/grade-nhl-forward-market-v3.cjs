"use strict";
/** Free offline scorer for first-Git-frozen prospective market-trained NHL v3
 * against the unchanged champion, on identical originally observed lines.
 */
const fs=require("node:fs"),path=require("node:path"),
 {execFileSync}=require("node:child_process");
const {evaluateForwardMarketV3}=require("../src/nhl-forward-market-v3-grader.cjs");
const root=path.resolve(__dirname,"..");
function firstCommit(file){
 try{return execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","--",file],
  {cwd:root,encoding:"utf8",timeout:10000}).trim()||null;}
 catch{return null;}
}
function commitCount(file){
 try{return Number(execFileSync("git",["rev-list","--count","HEAD","--",file],
  {cwd:root,encoding:"utf8",timeout:10000}).trim());}
 catch{return 0;}
}
function main(){
 const dir=path.join(root,"outputs/projections/distribution-snapshots");
 const files=fs.existsSync(dir)?fs.readdirSync(dir).
  filter(f=>/^\d{8}T\d{6}Z\.json$/.test(f)).sort():[];
 const frames=files.map(name=>{
  const rel="outputs/projections/distribution-snapshots/"+name;
  return {path:rel,firstCommittedAt:firstCommit(rel),
   gitHistoryCount:commitCount(rel),
   snapshot:JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"))};
 });
 const history=JSON.parse(fs.readFileSync(path.join(root,"outputs/history/players.json"),"utf8"));
 const schedule=JSON.parse(fs.readFileSync(path.join(root,
  "outputs/official-nhl/season-schedules/2026-27.json"),"utf8"));
 const report={...evaluateForwardMarketV3(frames,history,schedule),
  generatedAt:new Date().toISOString(),sourceArchiveFiles:files.length,
  privateResearchOnly:true,modelReleaseAllowed:false,noPaidApiCalls:true,noWagersPlaced:true};
 const destination=path.join(root,"outputs/backtests/nhl-forward-market-v3-latest.json");
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.writeFileSync(destination,JSON.stringify(report,null,2)+"\n");
 const result={sourceSnapshots:files.length,eligibleSameLineDecisions:report.summary.decisions,
  pending:report.pending,pushes:report.pushes,distinctGames:report.summary.distinctGames,
  championBrier:report.summary.championBrier,marketV3Brier:report.summary.shadowBrier,
  improvement:report.summary.championMinusShadowBrier,
  modelPromoted:false,originalPlatformSettlementsVerified:false};
 console.log(JSON.stringify(result));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  "### NHL v3 original-line frozen-forward shadow (research only)\n"+
  "Eligible distinct exact player/game/stat/line decisions: "+result.eligibleSameLineDecisions+
  "; distinct official games: "+result.distinctGames+
  "; original-score comparison: "+JSON.stringify({championBrier:result.championBrier,
   marketV3Brier:result.marketV3Brier})+
  ". NO model promotion or original-platform settlement claim.\n");
 return report;
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={main,firstCommit,commitCount};
