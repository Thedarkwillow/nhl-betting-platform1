"use strict";
/** Reconcile every graded NFL Higher/Lower row with immutable first Git additions. */
const fs=require("node:fs"),path=require("node:path"),
 {execFileSync}=require("node:child_process");
const {diagnose}=require("../src/nfl-frozen-direction-diagnostic.cjs");
const ROOT=path.resolve(__dirname,"..");
function firstGit(relative){
 const git=(...args)=>execFileSync("git",args,{cwd:ROOT,encoding:"utf8",timeout:15000}).trim();
 const stamp=git("log","--diff-filter=A","-1","--format=%cI","--",relative);
 const history=Number(git("rev-list","--count","HEAD","--",relative));
 if(history!==1||!stamp||!Number.isFinite(Date.parse(stamp)))
  throw Error("NFL original selected direction was modified or not Git-precommitted: "+relative);
 return {firstCommittedAt:stamp,gitHistoryCount:history};
}
function main(){
 const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
 const relative="outputs/nfl/prospective",folder=path.join(ROOT,relative);
 const files=fs.readdirSync(folder).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort();
 if(!files.length)throw Error("No original frozen NFL directions");
 const snapshots=files.map(file=>{
  const pathName=relative+"/"+file;
  return {...firstGit(pathName),snapshot:read(pathName)};
 });
 const report=diagnose(read("outputs/nfl/backtests/pregame-forecast-proof-latest.json"),snapshots);
 const out=path.join(ROOT,"outputs/nfl/backtests/frozen-direction-bias-diagnostic-latest.json");
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({privateReport:"outputs/nfl/backtests/frozen-direction-bias-diagnostic-latest.json",
  originalGitVerified:true,decided:report.overall.decided,
  higherMissed:report.overall.higherWrong,
  higherCorrect:report.overall.higherCorrect,
  lowerCorrect:report.overall.lowerCorrect,
  distinctFinalGames:report.overall.distinctFinalGames,
  calibrated:false,edgeClaim:false,privateOnly:true}));
 return report;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={firstGit,main};
