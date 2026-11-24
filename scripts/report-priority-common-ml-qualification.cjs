"use strict";
const fs=require("node:fs"),{execFileSync}=require("node:child_process"),path=require("node:path"),lab=require("../src/priority-common-ml-qualification-v1.cjs"),{dataset}=require("./build-nfl-partner-board-research.cjs");
const root=path.resolve(__dirname,".."),git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:15000,maxBuffer:32*1024*1024}).trim();
function main(){
 const artifact="outputs/research/priority-common-ml-artifact.json",commits=git(["log","--format=%H","HEAD","--",artifact]).split("\n").filter(Boolean);
 if(commits.length!==1)throw Error("Require single immutable ML training artifact");
 const artifactAt=git(["show","-s","--format=%cI",commits[0]]),a=JSON.parse(git(["show",commits[0]+":"+artifact]));
 if(a.kind!=="priority_common_features_logistic_v1"||a.modelPromoted!==false||a.researchOnly!==true||!(Date.parse(a.generatedAt)<=Date.parse(artifactAt)))throw Error("Invalid training artifact");
 const now=new Date().toISOString(),history=JSON.parse(fs.readFileSync(path.join(root,"outputs/history/players.json"),"utf8"));
 const nhlFrames=require("./report-nhl-standard-triple-challengers.cjs").originalFrames().filter(f=>Date.parse(f.firstCommittedAt)>=Date.parse(artifactAt));
 const nflFrames=require("./report-nfl-independent-forward.cjs").frames().filter(f=>Date.parse(f.firstCommittedAt)>=Date.parse(artifactAt));
 const h=lab.nhl(nhlFrames,history,artifactAt),f=nflFrames.length?lab.nfl(nflFrames,[2024,2025,2026].flatMap(y=>dataset(y,"player_weekly")),dataset(2026,"schedule"),artifactAt,git(["log","--diff-filter=A","-1","--format=%cI","HEAD","--","src/nfl-independent-forward-evidence.cjs"])):[];
 const report={kind:"priority_common_ml_original_line_qualification_v1",generatedAt:now,artifactCommit:commits[0],artifactFirstGitAt:artifactAt,registered:{NHL:h.length,NFL:f.length},pending:{NHL:h.filter(x=>x.y===null).length,NFL:f.filter(x=>x.y===null).length},byMarketLine:lab.summarize([...h,...f]),releaseRequiresIndependentReview:true,modelPromoted:false,calibrationApproved:false,platformSettlementVerified:false};
 const dest=path.join(root,"outputs/health/priority-common-ml-qualification-latest.json");fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(report));
}
if(require.main===module)main();module.exports={main};