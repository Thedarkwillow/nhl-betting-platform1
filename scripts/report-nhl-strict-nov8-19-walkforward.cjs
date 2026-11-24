"use strict";
/** Private, offline, after-the-fact Nov 8-19 NHL same-line diagnostic. */
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {originalFrames}=require("./report-nhl-standard-triple-challengers.cjs");
const {enrichHistory,enrichBlockHistory}=
 require("../src/nhl-strict-official-evidence-v1.cjs");
const {replay}=require("../src/nhl-strict-historical-walkforward-v1.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const git=a=>execFileSync("git",a,{cwd:root,encoding:"utf8",timeout:16000}).trim();
function officialArchives(dir,kind){
 const abs=path.join(root,dir);
 if(!fs.existsSync(abs))return [];
 const result=[];
 for(const name of fs.readdirSync(abs).filter(n=>/^\d{4}-\d\d-\d\d(?:__\d{10})?\.json$/.test(n)).sort()){
  const rel=dir+"/"+name;
  try{
   if(Number(git(["rev-list","--count","HEAD","--",rel]))!==1)continue;
   const firstGitAt=git(["log","--diff-filter=A","-1","--format=%cI","HEAD","--",rel]);
   const a=read(rel);
   if(a?.kind!==kind||a.date!==name.slice(0,10)||
      !Number.isFinite(Date.parse(a.observedAt))||
      Date.parse(a.observedAt)>Date.parse(firstGitAt)||
      !Array.isArray(a.rows)&&!Array.isArray(a.attemptRows))continue;
   result.push(a);
  }catch{}
 }
 return result;
}
function run(){
 const history=read("outputs/history/players.json");
 const pp=officialArchives("outputs/research/nhl-pp-scoring-history",
  "official_nhl_exact_game_pp_scoring_v1");
 const blocks=officialArchives("outputs/research/nhl-block-exposure-history",
  "official_nhl_exact_game_block_exposure_v1");
 const scored=enrichHistory(history,pp),
  exposure=enrichBlockHistory(scored.history,blocks);
 const frames=originalFrames();
 const result=replay(frames,exposure.history,{from:"2026-11-08",through:"2026-11-19"});
 const report={...result,generatedAt:new Date().toISOString(),
  sourceSummary:{scoringArchives:pp.length,blockArchives:blocks.length,
   verifiedPPGameRowsJoined:scored.counts.accepted,
   verifiedOpponentAttemptRowsJoined:exposure.counts.attemptRows,
   verifiedDefensiveStartRowsJoined:exposure.counts.zoneRows,
   exactPlayerGameReconciliation:true,
   officialSourceArtifactsWereRecoveredLater:true}};
 if(report.allOriginal.registered!==
    report.strictKept.registered+report.strictSkipped.registered||
    report.recomputedModel.registered>report.allOriginal.registered)
  throw Error("Reconstruction cohort accounting does not reconcile");
 const dst="outputs/health/nhl-strict-nov8-19-historical-replay-latest.json";
 fs.mkdirSync(path.dirname(path.join(root,dst)),{recursive:true});
 fs.writeFileSync(path.join(root,dst),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({file:dst,period:report.period,frames:report.validFirstGitFrames,
  originals:report.allOriginal.registered,decided:report.allOriginal.decided,
  originalWins:report.allOriginal.originalWins,
  originalRate:report.allOriginal.originalHitRate,
  alwaysHigher:report.allOriginal.alwaysHigherHitRate,
  alwaysLower:report.allOriginal.alwaysLowerHitRate,
  recomputed:report.recomputedModel,
  marketSpecific:report.marketSpecific,
  marketResearchWatchlist:report.marketResearchWatchlist,
  strictKept:report.strictKept,strictSkipped:report.strictSkipped,
  sources:report.sourceSummary,
  retrospectiveOnly:true,promoted:false}));
 return report;
}
if(require.main===module)try{run()}catch(e){
 console.error("Historical reconstruction failed, no selection promoted:",e.message);
 process.exitCode=1;
}
module.exports={run,officialArchives};
