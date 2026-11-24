"use strict";
/* Offline exact-first-Git weekend preflight. Archives only a small PRIVATE
 * health summary. Never rewrites predictions, imports results, requests vendor
 * credits, publishes player props or places entries.
 */
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const {evaluate}=require("../src/weekend-offday-preflight.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const optional=p=>{try{return read(p);}catch{return null;}};
const git=args=>cp.execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:20000,maxBuffer:4*1024*1024}).trim();
function latest(dir){
 const folder=path.join(root,dir);
 if(!fs.existsSync(folder))return null;
 for(const file of fs.readdirSync(folder).filter(x=>/^\d{8}T\d{6,9}Z\.json$/.test(x)).sort().reverse()){
  const relative=dir+"/"+file;
  try{
   const rev=Number(git(["rev-list","--count","HEAD","--",relative]));
   const first=git(["log","--diff-filter=A","-1","--format=%cI","HEAD","--",relative]);
   if(rev!==1||!Number.isFinite(Date.parse(first)))continue;
   // HEAD is authoritative: no uncommitted, altered or unproven file.
   const snapshot=JSON.parse(cp.execFileSync("git",["show","HEAD:"+relative],{
    cwd:root,encoding:"utf8",timeout:20000,maxBuffer:45*1024*1024}));
   return {snapshot,firstGitCommittedAt:first,gitHistoryCount:rev,relative};
  }catch{continue;}
 }
 return null;
}
function main(now=new Date().toISOString()){
 const a=latest("outputs/research/snapshots"),b=latest("outputs/nfl/prospective");
 const report=evaluate({nhlFrame:a,nflFrame:b,now,
  platform:optional("outputs/health/platform-quote-settlement-readiness-latest.json"),
  trial:optional("outputs/health/six-priority-future-evidence-latest.json"),
  historicalNhlStandard:optional("outputs/health/nhl-standard-proof-latest.json")});
 const rel="outputs/health/weekend-offday-readiness-latest.json",old=optional(rel),
  minimal=(({generatedAt,...rest})=>rest)(report);
 if(!old||JSON.stringify((({generatedAt,...rest})=>rest)(old))!==JSON.stringify(minimal)){
  fs.mkdirSync(path.join(root,"outputs/health"),{recursive:true});
  fs.writeFileSync(path.join(root,rel),JSON.stringify(report,null,2)+"\n");
 }
 console.log(JSON.stringify({file:rel,
  nhlFirstGit:report.nhl.proof.precommitValid,nhlOriginal:report.nhl.all.selectedOriginal,
  nhlChallengerResearch:report.nhl.all.shadowSelected,
  nflFirstGit:report.nfl.proof.precommitValid,nflOriginal:report.nfl.all.original,
  nflChallengerResearch:report.nfl.all.shadowSelected,
  unverifiedAppQuotes:true,bookablePicksApproved:0,providerCalls:0}));
 return report;
}
if(require.main===module)try{main();}catch(e){console.error(e.stack);process.exitCode=1;}
module.exports={main,latest};
