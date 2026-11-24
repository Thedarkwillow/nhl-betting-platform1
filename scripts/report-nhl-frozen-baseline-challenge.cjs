"use strict";
const fs=require("node:fs"),path=require("node:path"),
 {execFileSync}=require("node:child_process");
const {evaluate}=require("../src/nhl-frozen-baseline-challenge.cjs");
const {audit}=require("../src/nhl-standard-market-diagnostics.cjs");
const {audit:tierReliability}=require("../src/nhl-all-tier-reliability.cjs");
const {audit:dualBaselineAudit}=require("../src/nhl-prospective-slate-baseline-audit.cjs");
const root=path.resolve(__dirname,"..");
function originalPolicyCommitTime(){
 try{
  const when=execFileSync("git",["log","--diff-filter=A","-1",
   "--format=%cI","HEAD","--","src/nhl-frozen-baseline-challenge.cjs"],
   {cwd:root,encoding:"utf8",timeout:10000}).trim();
  return when&&Number.isFinite(Date.parse(when))?when:null;
 }catch{return null;}
}
function main(){
 const source=path.join(root,"outputs/research/registry/nhl-precommitted-ledger-latest.json");
 if(!fs.existsSync(source))throw Error("Refusing missing original frozen-pick registry");
 const ledger=JSON.parse(fs.readFileSync(source,"utf8"));
 const report=evaluate(ledger,{baselinePolicyGitCommittedAt:originalPolicyCommitTime()});
 const marketGate=audit(report);
 const standardVsBoth=dualBaselineAudit(ledger,report.baselinePolicyGitCommittedAt);
 const standardLossPriority=require("../src/nhl-standard-market-loss-priority-v1.cjs").audit(standardVsBoth);
 if(!report.evidenceValid)throw Error("Refusing unverified model-vs-Higher cohort: "+report.status);
 if(standardVsBoth.status!=="original_pregame_research_only")
  throw Error("Refusing inconsistent original Standard dual-baseline evidence");
 // Store only anonymized aggregate counts and strict statistical caveats.
 const file=path.join(root,"outputs/health/nhl-frozen-baseline-challenge-latest.json");
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify({...report,forwardStandardMarketGate:marketGate,
  futureStandardVsBothBaselines:standardVsBoth,
  futureStandardMarketLossPriority:standardLossPriority,
  allTierReliability:tierReliability(ledger),generatedAt:new Date().toISOString(),
  policyFirstGitCommitReadFromRepository:report.baselinePolicyGitCommittedAt!==null,
  noPaidProviderRequests:true},null,2)+"\n");
 console.log(JSON.stringify({status:report.status,
  sample:report.historicalSameSelectedLines.standardDirectional,
  future:report.postPolicySameSelectedLines.standardDirectional,
  sampleGate:report.postPolicyGameClusterModelMinusHigher95.status,
  modelBeatsBothSameLineBaselines:standardVsBoth.beatsBothBaselinesConsistently,
  automaticPromotion:false,originalPlatformPayoutVerified:false}));
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1}
module.exports={main,originalPolicyCommitTime};
