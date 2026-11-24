"use strict";
/** Automated private future-first-Git context challenger vs champion results. */
const fs=require("node:fs"),path=require("node:path"),
 {original,filesIn}=require("./grade-nfl-precommitted.cjs"),
 {grade}=require("../src/nfl-matchup-shadow-grading.cjs");
const ROOT=path.resolve(__dirname,"..");
function empiricalPolicyCommit(file="src/nfl-empirical-threshold-shadow.cjs"){
 try{
  const t=require("node:child_process").execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","HEAD","--",file],{cwd:ROOT,encoding:"utf8",timeout:10000}).trim();
  return Number.isFinite(Date.parse(t))?t:null;
 }catch{return null;}
}
function main(){
 const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
 const originals=filesIn("outputs/nfl/prospective",/^\d{8}T\d{6}Z\.json$/)
  .map(p=>({...original(p),snapshot:read(p)}));
 const shadows=filesIn("outputs/nfl/context-shadow",/^\d{8}T\d{6}Z\.json$/)
  .map(p=>({...original(p),snapshot:read(p)}));
 const result=grade({
  originalGrade:read("outputs/nfl/backtests/pregame-forecast-proof-latest.json"),
  originalSnapshots:originals,snapshots:shadows,empiricalPolicyAt:empiricalPolicyCommit(),positionPolicyAt:empiricalPolicyCommit('src/nfl-position-opportunity-matchup.cjs')});
 result.generatedAt=new Date().toISOString();
 result.futureContextCapturePending=shadows.length===0;
 const file="outputs/nfl/backtests/matchup-context-forward-grade-latest.json";
 fs.mkdirSync(path.dirname(path.join(ROOT,file)),{recursive:true});
 fs.writeFileSync(path.join(ROOT,file),JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({status:"original_NFL_first_Git_context_research_only",
  filename:file,originalFutureShadowCommits:result.originalFirstGitSnapshotsVerified,
  evaluatedDecided:result.combined.decided,
  independentGames:result.combined.distinctFinalGames,
  originalMAE:result.combined.originalMAE,
  contextMAE:result.combined.contextMAE,
  newFutureEvidence:shadows.length>0,liveApproved:false,
  expectedValue:null,placedWagers:0}));
 return result;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
