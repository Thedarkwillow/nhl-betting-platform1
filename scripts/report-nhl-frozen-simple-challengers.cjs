"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {framesFromGit}=require("./build-nhl-private-ledger-and-labs.cjs");
const {evaluate}=require("../src/nhl-frozen-simple-challenger-grader.cjs");
const ROOT=path.resolve(__dirname,"..");
function firstCommittedFileDate(file){
 const x=execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","HEAD","--",file],{
  cwd:ROOT,encoding:"utf8",timeout:10000}).trim();
 if(!x||!Number.isFinite(Date.parse(x)))throw Error("Missing original Git-add registration for "+file);
 return x;
}
function main(){
 const ledger=JSON.parse(fs.readFileSync(path.join(ROOT,
  "outputs/research/registry/nhl-precommitted-ledger-latest.json"),"utf8"));
 const at=firstCommittedFileDate("src/nhl-simple-pregame-challengers.cjs");
 const doc=evaluate(ledger,framesFromGit(),{firstPolicyCommittedAt:at});
 const target=path.join(ROOT,"outputs/health/nhl-frozen-simple-challengers-latest.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify({...doc,generatedAt:new Date().toISOString(),
  noNewPaidSourceCalls:true},null,2)+"\n");
 console.log(JSON.stringify({frozenFutureStandard:doc.originalFrozenFutureStandardSelectionCount,
  withFrozenSimpleSides:doc.uniqueFrozenSelectedMatchCount,
  allFrozen:doc.fullyFrozenFutureCohort,
  comparable:Object.fromEntries(Object.entries(doc.strategyComparison).map(([k,v])=>[k,{
   decided:v.decidedOnCoveredLines,challenger:v.challengerWins,
   model:v.modelWinsOnSameCoveredLines,alwaysHigher:v.alwaysHigherWinsOnSameCoveredLines}])),
  promotions:0,providerRequests:0}));
 return doc;
}
if(require.main===module)try{main()}catch(e){console.error("::error::"+e.message);process.exitCode=1}
module.exports={main,firstCommittedFileDate};
