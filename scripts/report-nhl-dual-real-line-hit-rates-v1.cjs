"use strict";
/** Offline original-line backtest AND separate precommitted prospective report.
 * No provider calls, wager, retroactive snapshot edit or model promotion.
 */
const fs=require("node:fs"),path=require("node:path"),
 {execFileSync}=require("node:child_process");
const {mergeHistory}=require("../src/nhl-specialist-history-recovery.cjs");
const {replay,forward}=require("../src/nhl-dual-real-line-hit-rates-v1.cjs");
const {analyze:diagnoseDirectional}=require("../src/nhl-original-line-directional-bias-diagnostic-v1.cjs");
const codeRoot=path.resolve(__dirname,"..");
const root=process.env.RESEARCH_ARCHIVE_ROOT?path.resolve(process.env.RESEARCH_ARCHIVE_ROOT):codeRoot;
const reportRoot=process.env.RESEARCH_REPORT_ROOT?path.resolve(process.env.RESEARCH_REPORT_ROOT):root;
const externalArchive=root!==codeRoot;
if(externalArchive&&(!process.env.RESEARCH_REPORT_ROOT||reportRoot===root||reportRoot===codeRoot||
 reportRoot.startsWith(root+path.sep)||reportRoot.startsWith(codeRoot+path.sep)))
 throw Error("External archives require a separate ephemeral report directory");
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const abs=p=>path.join(root,p);
const exists=p=>fs.existsSync(abs(p));
const read=p=>JSON.parse(fs.readFileSync(abs(p),"utf8"));
const git=args=>execFileSync("git",args,{
 cwd:root,encoding:"utf8",timeout:25000,maxBuffer:8*1024*1024}).trim();
function list(dir){
 return exists(dir)?fs.readdirSync(abs(dir))
  .filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort():[];
}
function policy(){
 if(externalArchive){
  const model="src/nhl-eight-accuracy-research-v1.cjs";
  const archived=execFileSync("git",["show","HEAD:"+model],{cwd:root,timeout:25000,maxBuffer:8*1024*1024});
  if(!archived.equals(fs.readFileSync(path.join(codeRoot,model))))
   throw Error("Public policy differs from archived original recipe; cannot reuse old policy timestamp");
 }
 const stamp=git(["log","--diff-filter=A","-1","--format=%cI",
  "--","src/nhl-eight-accuracy-research-v1.cjs"]);
 if(!Number.isFinite(at(stamp)))throw Error("New-model historical policy first-Git commit absent");
 return stamp;
}
function archive(){
 const dir="outputs/research/snapshots";
 const names=fs.readdirSync(abs(dir)).filter(n=>
  /^\d{8}T\d{6,9}Z\.json$/.test(n)&&n.slice(0,8)>="20261108").sort();
 const frames=[],errors={uncommitted:0,modifiedOriginal:0,badJSON:0};
 for(const n of names){
  const file=dir+"/"+n;
  let first,count;
  try{
   first=git(["log","--diff-filter=A","-1","--format=%cI","--",file]);
   count=Number(git(["rev-list","--count","HEAD","--",file]));
  }catch{errors.uncommitted++;continue;}
  if(!Number.isFinite(at(first))||count!==1){
   if(count!==1)errors.modifiedOriginal++;
   else errors.uncommitted++;
   continue;
  }
  try{frames.push({snapshot:read(file),firstGitCommittedAt:first,
   gitHistoryCount:count,archivePath:file});}
  catch{errors.badJSON++;}
 }
 return {frames,sourceFiles:names.length,rejected:errors};
}
function history(){
 const current=read("outputs/history/players.json");
 const previous=list("outputs/period-stats/training-source")
  .map(n=>read("outputs/period-stats/training-source/"+n));
 const load=(dir,kind)=>list(dir).flatMap(n=>{
  const v=read(dir+"/"+n);
  return v.kind===kind&&Array.isArray(v.rows)?v.rows:[];
 });
 const pp=load("outputs/research/nhl-pp-history","official_nhl_exact_game_pp_time_v1"),
  sh=load("outputs/research/nhl-sh-history","official_nhl_exact_game_sh_time_v1");
 return mergeHistory(current,previous,pp,sh);
}
function save(file,report){
 const target=path.join(reportRoot,file);
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
}
function main(){
 const p=policy(),h=history(),f=archive(),
  raw=read("outputs/health/six-priority-future-evidence-latest.json");
 if(!raw.nhlEightAccuracyResearch)throw Error("No prospective original-line proof");
 const hist=replay(f.frames,h.history,{policyAt:p,includeDiagnosticRows:true});
 const directionalDiagnostic=diagnoseDirectional(hist.diagnosticRows);
 delete hist.diagnosticRows;
 const future=forward(raw.nhlEightAccuracyResearch,{generatedAt:raw.generatedAt});
 // Historical replay's post-policy sources must not leak into its sample.
 if(hist.replayPolicyAt!==future.policyAt||hist.prospectiveResultsNotMerged!==true||
   future.noRetrospectiveReconstructionInThisCohort!==true)
  throw Error("Historical and forward NHL cohorts cannot be mixed");
 const strict=raw.nhlStrictDirectionalForwardV1;
 if(strict?.kind!=="nhl_strict_directional_abstention_first_git_future_scorecard_v1")
  throw Error("True first-Git strict directional scorecard unavailable");
 const generatedAt=new Date().toISOString();
 const historical={...hist,generatedAt,
  originalArchiveFilesSeen:f.sourceFiles,archiveRejects:f.rejected,
  historicalMerge:{uniquePlayerGames:h.counts.uniquePlayerGames,
   officialPriorSeasonFiles:previousCount(),
   shorthandedSecondsJoined:h.counts.shBackfillMatched??0}};
 const prospective={...future,generatedAt};
 const hisPath="outputs/health/nhl-real-line-retrospective-hit-rate-latest.json",
  prosPath="outputs/health/nhl-real-line-prospective-hit-rate-latest.json";
 save(hisPath,historical);save(prosPath,prospective);
 save("outputs/health/nhl-directional-bias-diagnostic-latest.json",
  {...directionalDiagnostic,generatedAt});
 save("outputs/health/nhl-strict-directional-future-hit-rate-latest.json",
  {...strict,generatedAt});
 const stats=r=>({
  eligible:r?.all?.exactSameLinePaired?.selections||0,
  winNew:r?.all?.exactSameLinePaired?.newModel?.wins||0,
  lossNew:r?.all?.exactSameLinePaired?.newModel?.losses||0,
  rateNew:r?.all?.exactSameLinePaired?.newModel?.hitRate??null,
  winOriginal:r?.all?.exactSameLinePaired?.originalOnTheseLines?.wins||0,
  rateOriginal:r?.all?.exactSameLinePaired?.originalOnTheseLines?.hitRate??null,
  higher:r?.all?.exactSameLinePaired?.alwaysHigher??null,
  lower:r?.all?.exactSameLinePaired?.alwaysLower??null,
  byMarket:Object.fromEntries(Object.entries(r?.byMarket||{}).map(([m,z])=>
   [m,{new:z.exactSameLinePaired?.newModel,
    original:z.exactSameLinePaired?.originalOnTheseLines,
    alwaysHigher:z.exactSameLinePaired?.alwaysHigher,
    alwaysLower:z.exactSameLinePaired?.alwaysLower,
    researchSelected:z.exploratorySelected}]))
 });
 const output={generatedAt,kind:"nhl_original_lines_separate_historical_and_forward_summary_v1",
  historicalReport:hisPath,prospectiveReport:prosPath,
  historical:stats(historical),prospective:stats(prospective),
  strictDirectionalFuture:{
   originals:strict.pregameFrozenOriginals,
   kept:strict.all.kept.registered,
   keptDecided:strict.all.kept.selections,
   keptWins:strict.all.kept.wins,
   keptHitRate:strict.all.kept.hitRate,
   keptAlwaysHigher:strict.all.kept.alwaysHigherSameLines,
   keptAlwaysLower:strict.all.kept.alwaysLowerSameLines,
   withheld:strict.all.skipped.registered
  },
  retrospectiveDirectionalBias:{
   originalDecided:directionalDiagnostic.overall.decided,
   higherOnSameLines:directionalDiagnostic.overall.alwaysHigherSameLines,
   lowerOnSameLines:directionalDiagnostic.overall.alwaysLowerSameLines,
   modelHigherForecasts:directionalDiagnostic.overall.newModelHigherPredictions,
   modelLowerForecasts:directionalDiagnostic.overall.newModelLowerPredictions
  },
  historicalReconstructionNotPregameFrozen:true,
  prospectiveModelPredictionsMustHaveBeenFrozenBeforeEvent:true,
  calibrated:false,accuracyImprovementVerified:false,
  modelPromoted:false,bettingEligible:false,placedWagers:0};
 save("outputs/health/nhl-real-line-dual-hit-rate-summary-latest.json",output);
 console.log(JSON.stringify({historical:output.historical,
  prospective:output.prospective,rejectedHistoricalSources:historical.archiveRejects,
  historicalScopes:{firstGitFrames:historical.validatedFirstGitFrames,
   authenticOriginalLines:historical.originalEligible},
  strictForwardOriginals:strict.pregameFrozenOriginals,
  strictForwardKept:strict.all.kept.registered,
  diagnosticMarketSides:Object.keys(directionalDiagnostic.byMarketOriginalSide).length,
  originalGameAndLineUnchanged:true,modelPromoted:false,paidCalls:0}));
 return output;
}
function previousCount(){return list("outputs/period-stats/training-source").length;}
if(require.main===module)try{main()}catch(e){
 console.error(e.stack||e);process.exitCode=1;
}
module.exports={main,archive,policy,history};
