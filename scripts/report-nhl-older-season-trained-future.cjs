"use strict";
/** First-Git frozen, genuinely future-only prior-season-trained NHL audit. */
const fs=require("node:fs"),path=require("node:path"),
 {execFileSync}=require("node:child_process");
const {originalFrames}=require("./report-nhl-standard-triple-challengers.cjs");
const {audit}=require("../src/nhl-older-season-trained-forward-v1.cjs");
const root=path.resolve(__dirname,"..");
function run(){
 const policy="src/nhl-older-season-trained-shadow-v1.cjs";
 const git=a=>execFileSync("git",a,{cwd:root,encoding:"utf8",timeout:15000}).trim(),
  first=git(["log","--diff-filter=A","--format=%H","HEAD","--",policy])
   .split("\n").filter(Boolean);
 if(first.length!==1)throw Error("Missing unique Git first-commit training policy");
 const time=git(["show","-s","--format=%cI",first[0]]);
 const history=JSON.parse(fs.readFileSync(path.join(root,"outputs/history/players.json")));
 const r={...audit(originalFrames(),history,time),generatedAt:new Date().toISOString()};
 const rel="outputs/health/nhl-older-season-trained-future-latest.json",dst=path.join(root,rel);
 fs.mkdirSync(path.dirname(dst),{recursive:true});
 fs.writeFileSync(dst,JSON.stringify(r,null,2)+"\n");
 console.log(JSON.stringify({file:rel,acceptedFrames:r.acceptedFrames,
  prospectiveFrozenOriginalOffers:r.uniqueOriginalOffers,
  modelDecided:r.overall.trained.decided,
  originalSideDecided:r.overall.originalOfferedSide.decided,
  bettingEligible:false,modelPromoted:false}));
 return r;
}
if(require.main===module)try{run()}catch(e){
 console.error("Older-season future proof failed:",e.message);process.exitCode=1;
}
module.exports={run};
