"use strict";
/** Archive strictly future-first-Git precommitted NFL margin abstention trials. */
const fs=require("node:fs"),path=require("node:path"),
 {gradeProspectiveShadows}=require("../src/nfl-shadow-postgame-grade.cjs"),
 {original,filesIn}=require("./grade-nfl-precommitted.cjs");
const ROOT=path.resolve(__dirname,"..");
function main(){
 const read=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),"utf8"));
 const orig=filesIn("outputs/nfl/prospective",/^\d{8}T\d{6}Z\.json$/)
  .map(p=>({...original(p),snapshot:read(p)}));
 const shadow=filesIn("outputs/nfl/shadow",/^\d{8}T\d{6}Z\.json$/)
  .map(p=>({...original(p),shadow:read(p)}));
 const report=gradeProspectiveShadows({
  grade:read("outputs/nfl/backtests/pregame-forecast-proof-latest.json"),
  shadowSources:shadow,originalSnapshots:orig});
 report.generatedAt=new Date().toISOString();
 report.pendingOriginalShadowCapture=shadow.length===0;
 const relative="outputs/nfl/backtests/frozen-shadow-prospective-grading-latest.json";
 fs.mkdirSync(path.dirname(path.join(ROOT,relative)),{recursive:true});
 fs.writeFileSync(path.join(ROOT,relative),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({privateReport:relative,
  firstGitFrozenShadows:report.originalGitShadowSnapshotsVerified,
  uniqueResearchOffers:report.uniqueOriginalFrozenQuotes,
  decided:Object.fromEntries(Object.entries(report.byPolicy).map(([k,v])=>[k,v.decided])),
  shadowNotYetAvailable:report.pendingOriginalShadowCapture,
  historicalNovember9RetrospectivelyRelabeled:false,edgeApproved:false}));
 return report;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
