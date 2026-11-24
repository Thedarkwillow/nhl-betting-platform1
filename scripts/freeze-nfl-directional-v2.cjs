"use strict";
// Future-only NFL Standard abstention audit. No new provider requests.
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const {freeze}=require("../src/nfl-directional-v2-prospective.cjs");
const root=path.resolve(__dirname,".."),dir=path.join(root,"outputs/nfl/prospective"),dest=path.join(root,"outputs/nfl/directional-v2");
function git(...args){return cp.execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:12000}).trim();}
function main(now=new Date().toISOString()){
 const files=fs.readdirSync(dir).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort().reverse();
 const selected=files.map(filename=>({filename,snapshot:JSON.parse(fs.readFileSync(path.join(dir,filename),"utf8"))})).find(x=>{
  const age=Date.parse(now)-Date.parse(x.snapshot.sourceBoardAsOfAt);
  return age>=0&&age<=30*60000;
 });
 if(!selected)return {status:"no_current_original_board",newProviderRequests:0};
 const relative="outputs/nfl/prospective/"+selected.filename,stamp=git("log","--diff-filter=A","-1","--format=%cI","--",relative),
 count=Number(git("rev-list","--count","HEAD","--",relative));
 if(count!==1)throw Error("Original NFL frozen source changed or not verified");
 fs.mkdirSync(dest,{recursive:true});
 for(const name of fs.readdirSync(dest).filter(x=>x.endsWith(".json"))){
  const existing=JSON.parse(fs.readFileSync(path.join(dest,name),"utf8"));
  if(existing.originalSourcePath===relative)return {status:"already_frozen",newProviderRequests:0};
 }
 let availability=null;try{availability=JSON.parse(fs.readFileSync(path.join(root,"outputs/nfl/availability/official-report-latest.json"),"utf8"));}catch{}
 const firstPolicy=git("log","--diff-filter=A","--format=%cI","--","src/nfl-market-usage-selective-future-v1.cjs").split("\n").filter(Boolean);
 const selectivePolicyFirstGitAt=firstPolicy.length===1?firstPolicy[0]:null;
 const report=freeze(selected.snapshot,{firstGitCommittedAt:stamp,now,injuries:availability,selectivePolicyFirstGitAt});
 report.originalSourcePath=relative;
 const name=now.slice(0,19).replace(/[-:]/g,"")+"Z.json";
 const rel="outputs/nfl/directional-v2/"+name;
 fs.writeFileSync(path.join(root,rel),JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 return {status:"created_pending_original_git_commit",path:rel,summary:report.summary,
  noPlatformOfferAuthenticated:true,autoPicks:0,newProviderRequests:0};
}
if(require.main===module){try{console.log(JSON.stringify(main()));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={main};
