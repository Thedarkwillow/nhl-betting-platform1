"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {originalFrames}=require("./report-nhl-standard-triple-challengers.cjs");
const {shadowFrames}=require("../src/nhl-standard-triple-challenger-grader.cjs");
const {evaluate}=require("../src/nhl-selective-standard-tier-trial.cjs");
const root=path.resolve(__dirname,".."),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
function main(){
 const policyAt=execFileSync("git",["log","--first-parent","--diff-filter=A","-1","--format=%cI","HEAD","--","src/nhl-selective-standard-tier-trial.cjs"],{cwd:root,encoding:"utf8",timeout:10000}).trim();
 const history=read("outputs/history/players.json"),ledger=read("outputs/research/registry/nhl-precommitted-ledger-latest.json");
 if(ledger.kind!=="private_immutable_source_linked_nhl_selected_predictions")throw Error("Wrong original ledger");
 const rows=shadowFrames(originalFrames(),history,{mode:"original_precommitted_only"}).rows;
 const report=evaluate(rows,ledger,{policyAt});
 report.generatedAt=new Date().toISOString();
 report.firstObservedCalibration={status:"not_available"};
 try{
  const prior=read("outputs/health/nhl-standard-forward-improvement-latest.json");
  const h=prior.hierarchicalCalibration?.byMarketTierSide||{};
  report.firstObservedCalibration={reportedAt:prior.generatedAt,observedByTier:{},matchedByTier:{},approval:false};
  for(const [k,v] of Object.entries(h)){
   const tier=JSON.parse(k)[2];if(!["Standard","Goblin","Demon"].includes(tier))continue;
   for(const [name,value] of [["observedByTier",v.observed],["matchedByTier",v.matchedHeldout]])if(Number.isInteger(value)&&value>=0)report.firstObservedCalibration[name][tier]=(report.firstObservedCalibration[name][tier]||0)+value;
  }
 }catch{}
 const out=path.join(root,"outputs/health/nhl-selective-tier-trial-latest.json");
 fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({kind:report.kind,standardDecided:report.standard.all.decided,standardSelected:report.standard.all.selected,calibrationApproved:false}));
}
if(require.main===module)try{main();}catch{console.error("Selective NHL trial report refused");process.exitCode=1;}
