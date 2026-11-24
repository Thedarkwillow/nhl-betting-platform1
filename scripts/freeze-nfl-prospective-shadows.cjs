"use strict";
/**
 * Build future-only NFL Standard research challenger from the SAME newly
 * original-Git-frozen numeric/selected sides. This is a PRIVATE shadow,
 * not a retroactive re-grade of November 9 and not a betting slip.
 */
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const {createShadow}=require("../src/nfl-prospective-shadow.cjs");
const ROOT=path.resolve(__dirname,"..");
const relative="outputs/nfl/prospective",dest="outputs/nfl/shadow";
function firstGit(file){
 const git=(...args)=>cp.execFileSync("git",args,{cwd:ROOT,encoding:"utf8",timeout:15000}).trim();
 const time=git("log","--diff-filter=A","-1","--format=%cI","--",file);
 const count=Number(git("rev-list","--count","HEAD","--",file));
 if(count!==1||!Number.isFinite(Date.parse(time)))
  throw Error("Original NFL file must be first-Git immutable: "+file);
 return time;
}
function main({now=new Date().toISOString()}={}){
 const dir=path.join(ROOT,relative);
 if(!fs.existsSync(dir))throw Error("No original NFL future-pick snapshot directory");
 const candidates=fs.readdirSync(dir).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort().reverse();
 if(!candidates.length)throw Error("No original NFL pregame selections");
 const recent=candidates.map(name=>{
  const file=relative+"/"+name;
  const snapshot=JSON.parse(fs.readFileSync(path.join(ROOT,file),"utf8"));
  return {file,snapshot};
 }).find(x=>{const age=Date.parse(now)-Date.parse(x.snapshot.sourceBoardAsOfAt);
  return Number.isFinite(age)&&age>=0&&age<=30*60000;});
 if(!recent){
  console.log(JSON.stringify({status:"skipped_no_recent_original_frozen_nfl_board",
   genuinelyNewPrecommittedShadow:0,olderResearchNeverRelabeled:true}));
  return {status:"skipped_no_recent_original_frozen_nfl_board"};
 }
 const current=recent.file,orig=firstGit(current);
 const outputFolder=path.join(ROOT,dest);
 if(fs.existsSync(outputFolder)){
  for(const filename of fs.readdirSync(outputFolder).filter(s=>s.endsWith(".json"))){
   try{
    const prev=JSON.parse(fs.readFileSync(path.join(outputFolder,filename),"utf8"));
    if(prev.sourceSnapshotFile===current){
     console.log(JSON.stringify({status:"skipped_existing_original_shadow",
      original:current,neverDuplicateOriginalProof:true}));
     return {status:"skipped_existing_original_shadow"};
    }
   }catch{}
  }
 }
 const shadow=createShadow(recent.snapshot,{sourceFirstGitCommittedAt:orig,now});
 shadow.sourceSnapshotFile=current;
 const filename=now.slice(0,19).replace(/[-:]/g,"")+"Z.json";
 const relativeOutput=dest+"/"+filename;
 fs.mkdirSync(outputFolder,{recursive:true});
 fs.writeFileSync(path.join(ROOT,relativeOutput),JSON.stringify(shadow,null,2)+"\n",{flag:"wx"});
 console.log(JSON.stringify({status:"created_pending_first_remote_git_precommit",
  output:relativeOutput,original:current,
  eligible:shadow.selected.length,firstGitVerified:false,
  policyDesignedAfterEarlierFinishedGame:true,automatedWagers:0}));
 return {status:"created_pending_first_remote_git_precommit",output:relativeOutput};
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={firstGit,main};
