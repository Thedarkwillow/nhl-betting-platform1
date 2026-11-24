"use strict";
/**
 * Offline, official FINAL only; grades the originally committed new-policy
 * research arm against unchanged incumbent and same-threshold Higher/Lower.
 * It DOES NOT reconstruct live context after games or backdate a trial.
 */
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {grade,KIND}=require("../src/nhl-multifactor-future-v1.cjs");
const root=path.resolve(__dirname,".."),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",
 timeout:30000,maxBuffer:80*1024*1024}).trim();
function firstGitOf(file){
 try{
  const commits=git(["log","--format=%H","HEAD","--",file]).split("\n").filter(Boolean);
  if(commits.length!==1)return null; // original file must not be rewritten after freeze
  const sha=commits[0],firstGitCommittedAt=git(["show","-s","--format=%cI",sha]);
  const s=JSON.parse(git(["show",sha+":"+file]));
  if(s?.multifactorFutureV1?.kind!==KIND)return null;
  return {snapshot:s,firstGitCommittedAt,gitHistoryCount:1};
 }catch{return null}
}
function collectFrames(){
 const dir="outputs/research/snapshots",abs=path.join(root,dir);
 if(!fs.existsSync(abs))return [];
 const dates=fs.readdirSync(abs).filter(n=>/^\d{8}T\d{6}Z\.json$/.test(n)&&n>="20261121").sort().slice(-350);
 return dates.map(n=>firstGitOf(dir+"/"+n)).filter(Boolean);
}
function policyTime(){
 const t=git(["log","--diff-filter=A","-1","--format=%cI",
  "HEAD","--","src/nhl-multifactor-future-v1.cjs"]);
 if(!Number.isFinite(Date.parse(t)))throw Error("New prospective policy first Git proof missing");
 return t;
}
function main(){
 const policyFirstGitAt=policyTime(),frames=collectFrames(),
  history=read("outputs/history/players.json");
 if(!history?.players)throw Error("Official NHL player-history source unavailable");
 const r=grade(frames,history,{policyFirstGitAt});
 const output={...r,generatedAt:new Date().toISOString(),originalFramesSeen:frames.length,
  asOfHistoricalQuoteAvailabilityVerified:false,
  onlyOfficialFinalAppearanceOutcomes:true,zeroPaidProviderCalls:true,
  originalPlatformSettlementVerified:false,highConfidenceApproved:false,
  newPolicyWinRatePendingIfNoDecisions:true,automaticWagersPlaced:0};
 const file="outputs/health/nhl-multifactor-future-scorecard-latest.json";
 fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
 fs.writeFileSync(path.join(root,file),JSON.stringify(output,null,2)+"\n");
 console.log(JSON.stringify({kind:KIND,status:r.status,originalFrames:frames.length,
  accepted:r.originalRowsAccepted??0,
  incumbentDecided:r.existingStrictModel?.decided??0,
  multifactorDecided:r.multifactorKept?.decided??0,
  higherSameLine:r.multifactorKept?.alwaysHigherSameLines??null,
  lowerSameLine:r.multifactorKept?.alwaysLowerSameLines??null,
  output:file,modelPromoted:false,realWagers:0}));
 return output;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={firstGitOf,collectFrames,policyTime,main};
