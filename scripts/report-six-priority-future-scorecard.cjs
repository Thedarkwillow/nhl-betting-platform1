"use strict";
/** Automated read-only prospective scorer. No paid APIs, screenshots,
 * modifications to original frozen snapshots or retroactive predictions.
 * Results archived privately; sanitized public count publisher is separate.
 */
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const {evaluate}=require("../src/six-priority-future-scorecard.cjs");
const {review:reviewNhlAbstention}=require("../src/nhl-standard-abstention-audit.cjs");
const {audit:reviewNhlInputAB}=require("../src/nhl-standard-input-ab-future-scorecard-v1.cjs");
const {audit:reviewIndependent}=require("../src/nhl-standard-independent-duel-scorecard-v1.cjs");
const {review:reviewHistorical}=require("../src/nhl-standard-historical-holdout-review-v1.cjs");
const {audit:reviewEightAccuracy}=require("../src/nhl-eight-accuracy-forward-audit-v1.cjs");
const {audit:reviewStrictDirectional}=require("../src/nhl-strict-directional-forward-audit-v1.cjs");
const root=path.resolve(__dirname,"..");
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const optional=p=>fs.existsSync(path.join(root,p))?json(p):null;
function frames(dir){
 const folder=path.join(root,dir);
 if(!fs.existsSync(folder))return [];
 const files=fs.readdirSync(folder).filter(n=>
  /^\d{8}T\d{6,9}Z\.json$/.test(n)&&n.slice(0,8)>="20261121").sort();
 const accepted=[];
 for(const file of files){
  const p=dir+"/"+file;
  try{
   const git=args=>cp.execFileSync("git",args,{cwd:root,encoding:"utf8",
     timeout:10000}).trim();
   const first=git(["log","--diff-filter=A","-1","--format=%cI","--",p]);
   const revisions=Number(git(["rev-list","--count","HEAD","--",p]));
   if(revisions!==1||!Number.isFinite(Date.parse(first)))continue;
   accepted.push({firstGitCommittedAt:first,gitHistoryCount:revisions,
    snapshot:json(p)});
  }catch{continue;}
 }
 return accepted;
}
function main(){
 const nhlFrames=frames("outputs/research/snapshots");
 const nflFrames=frames("outputs/nfl/prospective");
 const history=optional("outputs/history/players.json");
 const report=evaluate({nhlFrames,nflFrames,history,
  grade:optional("outputs/nfl/backtests/pregame-forecast-proof-latest.json")});
 report.nhlStandardAbstention=reviewNhlAbstention(nhlFrames,history);
 let abPolicyCommittedAt=null;
 try{
  const created=cp.execFileSync("git",[
   "log","--diff-filter=A","-1","--format=%cI",
   "--","src/nhl-standard-input-frozen-ab-v1.cjs"],{
   cwd:root,encoding:"utf8",timeout:12000
  }).trim();
  if(Number.isFinite(Date.parse(created)))abPolicyCommittedAt=created;
 }catch{}
 let statisticalCommittedAt=null;
 try{
  const created=cp.execFileSync("git",[
   "log","--diff-filter=A","-1","--format=%cI",
   "--","src/nhl-standard-statistical-quality-v1.cjs"],{
   cwd:root,encoding:"utf8",timeout:12000
  }).trim();
  if(Number.isFinite(Date.parse(created)))statisticalCommittedAt=created;
 }catch{}
 report.nhlStandardInputAB=reviewNhlInputAB(
  nhlFrames,history,abPolicyCommittedAt,statisticalCommittedAt);
 let independentPolicyAt=null;
 try{
  const created=cp.execFileSync("git",[
   "log","--diff-filter=A","-1","--format=%cI",
   "--","src/nhl-standard-independent-duel-v1.cjs"
  ],{cwd:root,encoding:"utf8",timeout:12000}).trim();
  if(Number.isFinite(Date.parse(created)))independentPolicyAt=created;
 }catch{}
 report.nhlIndependentModelDuel=reviewIndependent(
  nhlFrames,history,abPolicyCommittedAt,independentPolicyAt);
 report.nhlIndependentHistoricalHoldout=reviewHistorical(
  optional("outputs/health/nhl-position-multiseason-v3-latest.json"));
 let eightPolicyAt=null;
 try{
  const created=cp.execFileSync("git",[
   "log","--diff-filter=A","-1","--format=%cI",
   "--","src/nhl-eight-accuracy-research-v1.cjs"
  ],{cwd:root,encoding:"utf8",timeout:12000}).trim();
  if(Number.isFinite(Date.parse(created)))eightPolicyAt=created;
 }catch{}
 report.nhlEightAccuracyResearch=reviewEightAccuracy(
  nhlFrames,history,abPolicyCommittedAt,eightPolicyAt);
 let directionalPolicyAt=null;
 try{
  const stamp=cp.execFileSync("git",[
   "log","--diff-filter=A","-1","--format=%cI",
   "--","src/nhl-strict-directional-abstention-v1.cjs"
  ],{cwd:root,encoding:"utf8",timeout:12000}).trim();
  if(Number.isFinite(Date.parse(stamp)))directionalPolicyAt=stamp;
 }catch{}
 report.nhlStrictDirectionalForwardV1=reviewStrictDirectional(
  nhlFrames,history,{abPolicyAt:abPolicyCommittedAt,
    policyAt:directionalPolicyAt});


 const out="outputs/health/six-priority-future-evidence-latest.json";
 const abs=path.join(root,out);
 const old=optional(out);
 const comparable=old?((({generatedAt,...r})=>r)(old)):null;
 if(!comparable||JSON.stringify(comparable)!==JSON.stringify(report)){
  fs.mkdirSync(path.dirname(abs),{recursive:true});
  fs.writeFileSync(abs,JSON.stringify({...report,generatedAt:new Date().toISOString()},null,2)+"\n");
 }
 console.log(JSON.stringify({report:out,
  nhlDecided:report.nhl.all.decided,nhlDistinctGames:report.nhl.all.distinctGames,
  nflDecided:report.nfl.all.decided,nflDistinctGames:report.nfl.all.distinctGames,
  nhlAbstentionOriginals:report.nhlStandardAbstention.acceptedOriginalFrozenThresholds,
  nhlAbstentionSelected:report.nhlStandardAbstention.selected.registered,
  nhlInputABRegistered:report.nhlStandardInputAB.originalExactThresholds,
  nhlInputABControlSelected:report.nhlStandardInputAB.control.selected.registered,
  nhlInputABEnrichedSelected:report.nhlStandardInputAB.enhanced.selected.registered,
  nhlInputABEnrichedDecided:report.nhlStandardInputAB.enhanced.selected.decided,
  nhlStatisticalABOriginals:report.nhlStandardInputAB.statisticalConditional.originalExactThresholds,
  nhlStatisticalABCurrentSelected:report.nhlStandardInputAB.statisticalConditional.currentOnly.selected.registered,
  nhlStatisticalABEnrichedSelected:report.nhlStandardInputAB.statisticalConditional.enriched.selected.registered,
  nhlStatisticalABEnrichedDecided:report.nhlStandardInputAB.statisticalConditional.enriched.selected.decided,
  nhlIndependentDuelOriginals:report.nhlIndependentModelDuel.originals,
  nhlIndependentDuelPairedDecided:report.nhlIndependentModelDuel.overall.strictSameLineHeadToHead.decided,
  nhlEightOriginals:report.nhlEightAccuracyResearch.originals,
  nhlEightDecided:report.nhlEightAccuracyResearch.officialDecided,
  nhlEightResearchSelected:report.nhlEightAccuracyResearch.overall.selectedResearch,
  nhlStrictDirectionalOriginals:report.nhlStrictDirectionalForwardV1.pregameFrozenOriginals,
  nhlStrictDirectionalKept:report.nhlStrictDirectionalForwardV1.all.kept.registered,
  nhlStrictDirectionalDecided:report.nhlStrictDirectionalForwardV1.all.kept.selections,
  calibrated:false,autoPicks:false,modelPromoted:false,paidCalls:0}));
 return report;
}
if(require.main===module)try{main()}catch(e){console.error(e.stack);process.exitCode=1;}
module.exports={main,frames};
