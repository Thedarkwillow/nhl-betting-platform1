'use strict';
// Update only disposable, public PickFinder website reports. Immutable inputs and ledgers
// are not eligible. Build each candidate atop the current remote tree, without a rebase.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const files={
 'data/pickfinder-public-activity.json':'public_pickfinder_activity_readiness_v1',
 'data/prizepicks-model-rankings.json':'public_prizepicks_model_ranking_v1'
};
const git=(root,args,opts={})=>execFileSync('git',['-C',root,...args],{stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024,timeout:120000,...opts});
const sha=x=>/^[a-f0-9]{40}$/.test(x);
function validate(raw,file,at){
 if(!Object.hasOwn(files,file)||raw.length>8e6)throw Error('report allowlist');
 const x=JSON.parse(raw),t=Date.parse(x.generatedAt);
 if(x.kind!==files[file]||x.paidRequests!==0||x.modelApproved!==false||x.originalPlatformVerified!==false||!Number.isFinite(t)||t>at)throw Error('public report contract');
 if(file==='data/pickfinder-public-activity.json'){
  if(!Array.isArray(x.events)||!x.readiness||!x.delivery||x.delivery.nativePickFinder!=='unverified')throw Error('activity contract');
 }else if(!Array.isArray(x.rows)||x.researchOnly!==true||x.privateRepoUsed!==false||x.calibrated!==false){
  throw Error('ranking contract');
 }
 return {t};
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function publish(root,file,{now=Date.now,backoff=ms=>sleep(ms),beforePush=()=>{}}={}){
 if(!Object.hasOwn(files,file))throw Error('report allowlist');
 const report=fs.readFileSync(path.join(root,file));
 const wanted=validate(report,file,now());
 const checkout=git(root,['rev-parse','HEAD']).toString().trim();
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-derived-index-'));
 const env={...process.env,GIT_INDEX_FILE:path.join(tmp,'index')};
 const remote=()=>{git(root,['fetch','--no-tags','origin','main']);return git(root,['rev-parse','FETCH_HEAD']).toString().trim();};
 const read=(rev)=>{try{return git(root,['show',rev+':'+file]);}catch{return null;}};
 const equivalentOrNewer=old=>{
  if(!old)return false;
  if(report.equals(old))return true;
  try{return validate(old,file,now()).t>wanted.t;}catch{return false;}
 };
 try{
  const blob=git(root,['hash-object','-w','--stdin'],{input:report,stdio:['pipe','pipe','pipe']}).toString().trim();
  for(let i=0;i<8;i++){
   const parent=remote();
   if(!sha(parent)||!sha(blob))throw Error('git revision');
   git(root,['merge-base','--is-ancestor',checkout,parent]);
   if(equivalentOrNewer(read(parent)))return {status:'already_current_or_newer',commit:parent};
   git(root,['read-tree',parent],{env});
   git(root,['update-index','--add','--cacheinfo','100644,'+blob+','+file],{env});
   const tree=git(root,['write-tree'],{env}).toString().trim();
   const commit=git(root,['-c','user.name=Public PickFinder reporting','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit-tree',tree,'-p',parent,'-m','Publish validated PickFinder website report']).toString().trim();
   if(git(root,['diff-tree','--no-commit-id','--name-only','-r',commit]).toString().trim()!==file)throw Error('report staged paths');
   await beforePush({i,parent,commit});
   try{git(root,['push','origin',commit+':refs/heads/main']);}
   catch{if(i<7)await backoff(1000*(i+1));continue;}
   const confirmed=remote();
   git(root,['merge-base','--is-ancestor',commit,confirmed]);
   if(!equivalentOrNewer(read(confirmed)))throw Error('remote report changed after publication');
   return {status:'published_and_verified',commit};
  }
  throw Error('concurrent main update exhausted publication retries');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
module.exports={publish,validate};
if(require.main===module)publish(process.cwd(),process.argv[2]).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('Public PickFinder publisher failed closed: '+e.message.split('\n')[0]);process.exitCode=1;});
