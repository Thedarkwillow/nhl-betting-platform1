'use strict';
// Private append-only page journal. A recovered page is historical evidence,
// never proof of a current board, a completed traversal or a forecast.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const git=(root,args,raw=false)=>execFileSync('git',['-C',root,'-c','user.name=PickFinder research runner','-c','user.email=research-runner@users.noreply.github.com',...args],{stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024,...(raw?{}:{encoding:'utf8'})});
function mkdir(root,rel){
 let dir=root;for(const segment of rel.split('/')){if(!/^[a-zA-Z0-9_-]+$/.test(segment))throw Error('unsafe journal segment');dir=path.join(dir,segment);if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});const st=fs.lstatSync(dir);if(st.isSymbolicLink()||!st.isDirectory())throw Error('unsafe journal directory');}return dir;
}
function createJournal({root,day,slot,attempt,book,sport,interval=10,maxAgeMs=30000,clock=Date.now,log=console.log}){
 if(process.env.RESTRICTED_DESTINATION_VERIFIED!=='1'||!fs.existsSync(path.join(root,'.git')))throw Error('private checkout required');
 if(!/^\d{4}-\d\d-\d\d$/.test(day)||!['manual','0600','0900'].includes(slot)||!['prizepicks','underdog'].includes(book)||!Number.isSafeInteger(interval)||interval<1||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1)throw Error('journal contract');
 const prefix=['research','pickfinder-page-journal',day,slot,attempt,book,sport].join('/');
 const dir=mkdir(root,prefix),pending=[];let lastFlush=clock(),lastPage=0,verified=0,poisoned=false;
 async function flush(){
  if(poisoned)throw Error('journal checkpoint already failed');
  if(!pending.length)return;
  try{
   const files=pending.map(x=>x.file);
   git(root,['add','--',...files]);
   const staged=git(root,['diff','--cached','--name-status']).trim().split('\n').sort();
   if(JSON.stringify(staged)!==JSON.stringify(files.map(f=>'A\t'+f).sort()))throw Error('unexpected staged paths');
   git(root,['commit','-m','Archive private PickFinder page checkpoint']);
   let revision=null;
   for(let i=0;i<3;i++){
    git(root,['fetch','origin','main']);
    try{git(root,['rebase','FETCH_HEAD']);}catch(e){try{git(root,['rebase','--abort']);}catch{}throw e;}
    const head=git(root,['rev-parse','HEAD']).trim();
    const changed=git(root,['diff-tree','--no-commit-id','--name-status','-r',head]).trim().split('\n').sort();
    if(JSON.stringify(changed)!==JSON.stringify(staged))throw Error('unexpected rebased paths');
    try{git(root,['push','origin','HEAD:refs/heads/main']);revision=head;break;}catch(e){if(i===2)throw e;await new Promise(r=>setTimeout(r,1000*(i+1)));}
   }
   if(!revision)throw Error('journal push failed');
   git(root,['fetch','origin','main']);git(root,['merge-base','--is-ancestor',revision,'FETCH_HEAD']);
   for(const x of pending)if(digest(git(root,['show','FETCH_HEAD:'+x.file],true))!==x.sha)throw Error('journal digest mismatch');
   verified+=pending.length;pending.length=0;lastFlush=clock();
   log(JSON.stringify({state:'page_checkpoint_verified',book,sport,pages:verified,sha:revision,rawRowsPublished:0}));
  }catch(e){poisoned=true;throw e;}
 }
 async function append(snapshot){
  if(poisoned)throw Error('journal checkpoint already failed');
  if(!snapshot||snapshot.book!==book||snapshot.sport!==sport||!Number.isSafeInteger(snapshot.page?.number)||snapshot.page.number!==lastPage+1||!Array.isArray(snapshot.page.rows)||!snapshot.page.rows.length||snapshot.page.rows.some(r=>r.sport!==sport))throw Error('page journal scope');
  const payload={schema:'pickfinder-page-journal-v1',attempt,day,slot,book,sport,startedAt:snapshot.startedAt,displayedPageCount:snapshot.displayedPageCount,accepted:snapshot.accepted===true,observedAt:new Date().toISOString(),page:snapshot.page,fullBoardCertified:false,modelInputsApproved:false};
  const raw=JSON.stringify(payload),sha=digest(raw),name='page-'+String(snapshot.page.number).padStart(7,'0')+'-'+sha+'.json',file=prefix+'/'+name;
  const fd=fs.openSync(path.join(dir,name),'wx',0o600);
  try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  pending.push({file,sha});lastPage++;
  if(pending.length>=interval||clock()-lastFlush>=maxAgeMs)await flush();
 }
 return {append,flush,status:()=>({lastPage,verified,pending:pending.length,poisoned})};
}
module.exports={createJournal,digest};
