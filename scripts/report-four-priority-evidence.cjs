"use strict";
// Zero-network aggregate release scoreboard, run after official grading.
const fs=require("node:fs"),path=require("node:path");
const {build}=require("../src/four-priority-evidence-status.cjs");
const {audit:underdogAudit}=require("./audit-underdog-private-candidate-archives.cjs");
const root=path.resolve(__dirname,"..");
function read(relative){try{return JSON.parse(fs.readFileSync(path.join(root,relative),"utf8"));}catch{return null;}}
function sampleArchiveAudit(){
 const folder=path.join(root,"outputs/research/underdog-bounded-candidates");
 if(!fs.existsSync(folder))return null;
 const files=fs.readdirSync(folder).filter(n=>/^\d{8}T\d{9}Z-(NHL|NFL)\.json$/.test(n)).sort();
 const docs=files.slice(-100).map(n=>read("outputs/research/underdog-bounded-candidates/"+n));
 return underdogAudit(docs);
}
function main(){
 const report=build({
  nhl:read("outputs/health/nhl-prospective-validation-latest.json"),
  calibration:read("outputs/health/nhl-validation-and-paper-audit-latest.json"),
  nfl:read("outputs/nfl/backtests/pregame-forecast-proof-latest.json"),
  underdog:sampleArchiveAudit()
 });
 const output=path.join(root,"outputs/health/four-priority-evidence-latest.json");
 const json=JSON.stringify(report,null,2)+"\n";
 if(json.includes('"playerId"')||json.includes('"sourceOfferId"')||
  json.includes('"modelWeights"')||json.includes('"originalOfferId"')||
  report.acceptance.probabilityRelease!==false||
  report.acceptance.approvedOptimizedLineups!==false||
  report.underdog.publicRows!==0)throw Error("Four-track research output policy violated");
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,json);
 console.log(JSON.stringify({kind:report.kind,
  nhlOriginalStandard:report.grading.nhlOriginalFutureDecisions,
  nflOriginal:report.grading.nflOriginalDecided,
  genuineCalibratorPairs:report.calibration.totalGenuinelyFrozenTrialDecisions,
  legalReferenceFormats:report.lineups.legalFormatCount,
  underdogOfflineNHL:report.underdog.nhlArchives,
  underdogOfflineNFL:report.underdog.nflArchives,
  modelPromoted:false,paidRequests:0,officialWagers:0}));
 return report;
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main,sampleArchiveAudit};
