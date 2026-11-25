'use strict';
// Public sports evidence only, with explicit owner-approved publication. No private remote or credentials.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const ROOT='research/pickfinder-public-v1',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(root,args,opts={})=>execFileSync('git',['-C',root,...args],{stdio:['ignore','pipe','pipe'],maxBuffer:128*1024*1024,timeout:120000,...opts});
function assertDestination(root){
 if(process.env.PICKFINDER_PUBLIC_DATA_AUTHORIZED!=='1'||process.env.GITHUB_REPOSITORY!=='Thedarkwillow/nhl-betting-platform1')throw Error('public publication not authorized');
 if(!/^https:\/\/github\.com\/Thedarkwillow\/nhl-betting-platform1(?:\.git)?$/i.test(git(root,['remote','get-url','origin']).toString().trim()))throw Error('not designated public remote');
 if(git(root,['status','--porcelain']).toString().trim())throw Error('archive not clean');
}
function safe(v,depth=0){
 if(depth>14)throw Error('data depth');
 if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v;
 if(typeof v==='string'){
  if(v.length>4000||/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:Bearer\s+\S+|gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:password|access.token|session.token|api.key|authorization|cookie)\s*[:=]\s*\S+)/i.test(v))throw Error('unsafe text');
  return v;
 }
 if(Array.isArray(v))return v.map(x=>safe(x,depth+1));
 if(v&&Object.getPrototypeOf(v)===Object.prototype){
  const o={};for(const [k,x] of Object.entries(v)){if(/^(?:__proto__|prototype|constructor|authorization|cookie|cookies|password|token|storageState|email|session|apiKey|html)$/i.test(k))throw Error('unsafe key');if(x!==undefined)o[k]=safe(x,depth+1);}return o;
 }throw Error('unsafe value');
}
async function persist(root,kind,data){
 assertDestination(root);
 if(!['boards','board-parts','profiles','dashboards','directory','capabilities'].includes(kind))throw Error('invalid archive kind');
 const raw=Buffer.from(JSON.stringify(safe(data))+'\n');if(raw.length>8e6)throw Error('archive size');
 const digest=sha(raw),file=ROOT+'/'+kind+'/'+digest+'.json';
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-public-index-'));const env={...process.env,GIT_INDEX_FILE:path.join(tmp,'index')};
 try{
  const blob=git(root,['hash-object','-w','--stdin'],{input:raw,stdio:['pipe','pipe','pipe']}).toString().trim();
  for(let i=0;i<6;i++){
   git(root,['fetch','origin','main']);const parent=git(root,['rev-parse','FETCH_HEAD']).toString().trim();
   if(git(root,['ls-tree',parent,'--',file]).toString().trim()){
    if(sha(git(root,['show',parent+':'+file]))!==digest)throw Error('digest mismatch');
    git(root,['merge','--ff-only','FETCH_HEAD']);return {file,digest,commit:parent};
   }
   git(root,['read-tree',parent],{env});git(root,['update-index','--add','--cacheinfo','100644,'+blob+','+file],{env});const tree=git(root,['write-tree'],{env}).toString().trim();
   const rev=git(root,['-c','user.name=Public sports evidence runner','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit-tree',tree,'-p',parent,'-m','Append authorized PickFinder sports evidence']).toString().trim();
   if(git(root,['diff-tree','--no-commit-id','--name-status','-r',rev]).toString().trim()!=='A\t'+file)throw Error('non append-only');
   try{git(root,['push','origin',rev+':refs/heads/main']);}catch{await new Promise(r=>setTimeout(r,1000*(i+1)));continue;}
   git(root,['fetch','origin','main']);git(root,['merge-base','--is-ancestor',rev,'FETCH_HEAD']);
   if(sha(git(root,['show','FETCH_HEAD:'+file]))!==digest)throw Error('remote mismatch');
   git(root,['merge','--ff-only','FETCH_HEAD']);return {file,digest,commit:rev};
  }throw Error('public push rejected');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
function read(root,kind){
 const dir=ROOT+'/'+kind,files=git(root,['ls-tree','-r','--name-only','HEAD','--',dir]).toString().trim().split('\n').filter(p=>new RegExp('^'+dir+'/[a-f0-9]{64}\\.json$').test(p));
 const out=[];for(const file of files){const raw=git(root,['show','HEAD:'+file]);if(sha(raw)!==path.basename(file,'.json'))throw Error('archive digest mismatch');out.push(JSON.parse(raw));}return out;
}
module.exports={ROOT,sha,safe,assertDestination,persist,read};
