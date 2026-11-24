"use strict";
/** Offline, automatically recurring future-only four-market research scorecard. */
const fs=require("node:fs"),path=require("node:path"),
 {execFileSync}=require("node:child_process");
const {originalFrames}=require("./report-nhl-standard-triple-challengers.cjs");
const {audit}=require("../src/nhl-market-specific-forward-audit-v1.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const git=a=>execFileSync("git",a,{cwd:root,encoding:"utf8",
 timeout:15000,maxBuffer:32*1024*1024}).trim();
function run(){
 const src="src/nhl-market-direction-research-v1.cjs";
 const first=git(["log","--diff-filter=A","--format=%H","HEAD","--",src])
  .split("\n").filter(Boolean);
 if(first.length!==1)throw Error("No unique first-Git challenger policy");
 const policyAt=git(["show","-s","--format=%cI",first[0]]);
 if(!Number.isFinite(Date.parse(policyAt)))
  throw Error("No trustworthy first-Git policy timestamp");
 const report={...audit(originalFrames(),read("outputs/history/players.json"),policyAt),
  generatedAt:new Date().toISOString()};
 const rel="outputs/health/nhl-market-specific-future-scorecard-latest.json",
  dst=path.join(root,rel);
 fs.mkdirSync(path.dirname(dst),{recursive:true});
 fs.writeFileSync(dst,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({file:rel,policyAt,firstGitFrames:report.acceptedFrames,
  originals:report.originalLines,graded:report.overall.all.decided,
  marketSpecific:report.overall.modeled.decided,
  researchWatchlist:report.overall.watchlist.decided,
  productionPromotions:0,calibrated:false}));
 return report;
}
if(require.main===module)try{run()}catch(e){
 console.error("Cannot grade future shadow without first-Git proof:",e.message);
 process.exitCode=1;
}
module.exports={run};
