"use strict";
/* Rebuild only from private original Git-evidenced ledger; zero provider calls. */
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {validate}=require("../src/nhl-prospective-validation.cjs");
const {assessNhlRecommendations}=require("../src/nhl-recommendation-readiness.cjs");
const root=path.resolve(__dirname,"..");
function policyCommit(){
 try{
  const t=execFileSync("git",["log","--diff-filter=A","-1","--format=%cI",
   "HEAD","--","src/nhl-prospective-validation.cjs"],
   {cwd:root,encoding:"utf8",timeout:10000}).trim();
  return Number.isFinite(Date.parse(t))?t:null;
 }catch{return null;}
}
function main(){
 const input=path.join(root,"outputs/research/registry/nhl-precommitted-ledger-latest.json");
 if(!fs.existsSync(input))throw Error("Missing Git-backed private original cohort");
 const ledger=JSON.parse(fs.readFileSync(input,"utf8"));
 const report=validate(ledger,{policyFirstCommittedAt:policyCommit()});
 report.tierProspectiveAudit=require("../src/nhl-tier-prospective-audit.cjs")
   .audit(ledger,policyCommit());
 // Release remains blocked pending separate independent market, payout,
 // calibration, role, correlation and actual app settlement evidence.
 report.recommendationAudit=assessNhlRecommendations({validation:report});
 report.originalSameLineSlateClusterBaseline=require("../src/nhl-prospective-slate-baseline-audit.cjs").audit(ledger,policyCommit());
 if(report.originalSameLineSlateClusterBaseline.status!=="original_pregame_research_only")throw Error("First-Git Standard slate baseline provenance unavailable");
 const output=path.join(root,"outputs/health/nhl-prospective-validation-latest.json");
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify({...report,generatedAt:new Date().toISOString(),
  zeroProviderCalls:true},null,2)+"\n");
 console.log(JSON.stringify({status:report.status,standardFutureDecisions:report.futureHoldout?.decided,
  training:report.training?.decided,calibrated:false,bettingRecommendationsApproved:false}));
 return report;
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main,policyCommit};
