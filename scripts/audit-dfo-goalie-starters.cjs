"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const {verifyReportedGoalies}=require("../src/nhl-dfo-goalie-starter-audit.cjs");
const root=path.resolve(__dirname,".."),base="outputs/approved-nhl-sources/snapshots";
function firstGit(pathName){
 const line=cp.execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","--",pathName],
  {cwd:root,encoding:"utf8",timeout:15000}).trim();
 const count=Number(cp.execFileSync("git",["rev-list","--count","HEAD","--",pathName],
  {cwd:root,encoding:"utf8",timeout:15000}).trim());
 return {firstCommittedAt:line||null,historyCount:count};
}
function main(){
 const dir=path.join(root,base),files=fs.readdirSync(dir)
  .filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort().slice(-100);
 if(!files.length)throw Error("No original DFO source snapshots archived");
 const snapshots=files.map(file=>{
  const relative=path.posix.join(base,file);
  return {snapshot:JSON.parse(fs.readFileSync(path.join(root,relative),"utf8")),
   ...firstGit(relative)};
 });
 const usage=JSON.parse(fs.readFileSync(path.join(root,"outputs/nhl-usage/latest.json"),"utf8"));
 const result=verifyReportedGoalies(snapshots,usage);
 const summary={...result,outcomes:undefined,generatedAt:new Date().toISOString(),
  originalSourceSnapshots:files.length};
 const output=path.join(root,"outputs/backtests/nhl-dfo-goalie-starter-audit-latest.json");
 fs.writeFileSync(output,JSON.stringify(summary,null,2)+"\n");
 console.log(JSON.stringify({snapshots:files.length,gradedStarts:result.gradedStarts,
  reportConfirmed:result.dfoConfirmedReportsVerifiedAfterFinal,
  missingOfficialStart:result.officialStarterFlagMissing,
  officialTeamStarterConfirmationVerified:false}));
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={main};
