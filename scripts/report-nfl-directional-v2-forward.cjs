"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const root=path.resolve(__dirname,".."),dir="outputs/nfl/directional-v2",read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const git=(...args)=>cp.execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:20000}).trim();
function main(){
 const abs=path.join(root,dir),files=fs.existsSync(abs)?fs.readdirSync(abs).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort():[];
 const frames=files.map(name=>{const file=dir+"/"+name;return {snapshot:read(file),
  firstGitAt:git("log","--diff-filter=A","-1","--format=%cI","--",file),
  gitHistoryCount:Number(git("rev-list","--count","HEAD","--",file))};});
 const grade=read("outputs/nfl/backtests/pregame-forecast-proof-latest.json");
 const report=require("../src/nfl-directional-v2-forward-grade.cjs").audit(frames,grade);
 report.generatedAt=new Date().toISOString();report.originalShadowFiles=files.length;
 const out=path.join(root,"outputs/nfl/backtests/directional-v2-future-only-latest.json");
 fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({kind:report.kind,newPolicyFrozenFrames:files.length,uniqueThresholdDecided:report.uniqueThresholds.decided,
  originalOnePerPlayerMarketDecided:report.onePerPlayerMarket.decided,productionApproved:false,actualPlatformSettlementVerified:false}));
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
