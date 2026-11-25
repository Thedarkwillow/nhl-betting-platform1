'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {pacific,decide}=require('./pacific-morning-capture-gate.cjs');
const {collect,ORIGIN}=require('./pickfinder-browser.cjs');
const {enrich}=require('./pickfinder-player-research.cjs');
const {archive}=require('./pickfinder-premium-archive.cjs');
const SPORTS=['NBA','CS2','VAL','LOL','DOTA2','COD','NHL','NFL'];
const BOOKS=['prizepicks','underdog'];
const partitions=()=>SPORTS.flatMap(code=>BOOKS.map(book=>({code,book})));
function plan(env,now=new Date()){
 if(env.PICKFINDER_AUTOMATION_AUTHORIZED!=='1')throw Error('authorization_required');
 if(env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.REQUESTED_MODE==='probe_now')return {probe:true};
 if(env.GITHUB_EVENT_NAME==='schedule'&&env.PICKFINDER_SCHEDULE_ENABLED!=='1')return {allowed:false,state:'schedule_disabled'};
 return decide({eventName:env.GITHUB_EVENT_NAME,mode:env.REQUESTED_MODE,schedule:env.GITHUB_EVENT_SCHEDULE,now});
}
function receiptValid(receipt,runner,now=new Date()){
 const age=now.getTime()-Date.parse(receipt?.checkedAt);
 return !!runner&&receipt?.runner===runner&&receipt?.launches===2&&Number.isFinite(age)&&age>=0&&age<=7*86400000;
}
function safeAddedFiles(lines,prefix){
 const records=lines.trim().split('\n').filter(Boolean);
 return records.length>0&&records.every(r=>r.startsWith('A\t'+prefix+'/')&&!r.includes('..'));
}
function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function destination(env){
 const root=fs.realpathSync(env.PICKFINDER_PRIVATE_ROOT),profile=fs.realpathSync(env.PICKFINDER_PROFILE_DIR);
 if(root===profile||profile.startsWith(root+path.sep)||root.startsWith(profile+path.sep))throw Error('separate profile required');
 if(!/^(https:\/\/github\.com\/|git@github\.com:)Thedarkwillow\/nhl-betting-platform(?:\.git)?$/i.test(git(root,['remote','get-url','origin'])))throw Error('unexpected remote');
 const v=execFileSync('gh',['api','repos/Thedarkwillow/nhl-betting-platform','--jq','.visibility'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 if(v!=='private'||git(root,['status','--porcelain']))throw Error('private clean archive required');
 return {root,profile};
}
async function openBoard(chromium,profile){
 const context=await chromium.launchPersistentContext(profile,{headless:true});
 try{
  const page=await context.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(ORIGIN+'/props',{timeout:20000});
  await page.getByRole('button',{name:'Open user menu'}).waitFor({timeout:15000});
  if(!await page.evaluate(()=>document.body.innerText.split('\n').some(l=>l.trim()==='Premium')))throw Error('premium session unavailable');
  return {context,page};
 }catch(e){await context.close();throw e;}
}
async function main(env=process.env){
 const p=plan(env);
 if(!p.probe&&!p.allowed){console.log(JSON.stringify(p));return;}
 const {root,profile}=destination(env);
 const {chromium}=require('playwright');
 const receiptPath=path.join(profile,'.pickfinder-automation-probe.json');
 if(p.probe){
  if(!env.RUNNER_NAME)throw Error('private runner name required');
  try{fs.unlinkSync(receiptPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  for(let i=0;i<2;i++){const {context}=await openBoard(chromium,profile);await context.close();}
  fs.writeFileSync(receiptPath,JSON.stringify({runner:env.RUNNER_NAME,launches:2,checkedAt:new Date().toISOString()}),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({state:'two_browser_relaunches_authenticated',hostRebootVerified:false,offers:0}));return;
 }
 const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
 if(!receiptValid(receipt,env.RUNNER_NAME))throw Error('recent runner probe required');
 if(env.GITHUB_EVENT_NAME==='schedule'&&!receipt.captureVerifiedAt)throw Error('manual in-window remote archive proof required');
 const prefix='research/pickfinder-premium/'+p.clock.day+'/'+p.expected.replace(':','');
 const remaining=()=>{const t=pacific(new Date());return t.day===p.clock.day&&t.hour===p.clock.hour&&t.minute<55;};
 const attempt=crypto.randomUUID();
 const counts=[];let failed=false;
 process.env.RESTRICTED_DESTINATION_VERIFIED='1';
 const {context,page}=await openBoard(chromium,profile);
 try{
  const detail=await context.newPage();detail.setDefaultTimeout(5000);
  for(const {book,code} of partitions()){
   if(!remaining()){failed=true;break;}
   try{
    await page.goto(ORIGIN+'/props',{timeout:20000});
    const batch=await collect(page,{book,code,slot:p.expected,maxPages:100,shouldContinue:remaining});
    // A bounded profile sample preserves board coverage. Separate deep research is still required.
    const sample=batch.pages.flatMap(pg=>pg.rows).find(r=>r.apps.length);
    if(sample&&remaining())try{await enrich(detail,sample,{navigate:url=>detail.goto(url,{timeout:8000})});}catch{sample.profileCollection={status:'unavailable'};}
    batch.endedAt=new Date().toISOString();
    const summary=archive(batch,root,attempt);
    counts.push({book,code,boardState:summary.boardState,withinSlot:summary.withinSlot,offers:summary.health.distinctOfferKeys,unresolved:summary.health.unresolvedRows,pages:summary.health.pages,traversal:summary.pageTraversalComplete});
    if(batch.failure==='session_expired'){failed=true;break;}
    if(!summary.withinSlot||summary.boardState==='partial'||summary.health.unresolvedRows||summary.health.priceConflictKeys||summary.health.repeatOrUnresolvedLinks)failed=true;
   }catch{counts.push({book,code,state:'partition_failed'});failed=true;}
  }
 }finally{await context.close();}
 if(counts.some(c=>typeof c.offers==='number')){
  git(root,['add','--',prefix]);
  if(!safeAddedFiles(git(root,['diff','--cached','--name-status']),prefix))throw Error('non append-only staging refused');
  git(root,['-c','user.name=PickFinder research runner','-c','user.email=research-runner@users.noreply.github.com','commit','-m','Archive PickFinder private research '+p.clock.day+' '+p.expected]);
  const sha=git(root,['rev-parse','HEAD']);
  git(root,['push','origin','HEAD:refs/heads/main']);
  git(root,['fetch','origin','main']);
  git(root,['merge-base','--is-ancestor',sha,'FETCH_HEAD']);
  if(counts.length===partitions().length&&counts.every(c=>c.withinSlot===true)&&counts.some(c=>c.offers>0)){
   fs.writeFileSync(receiptPath,JSON.stringify({...receipt,captureVerifiedAt:new Date().toISOString(),archiveSha:sha}),{mode:0o600});
  }
  console.log(JSON.stringify({state:'remote_archive_verified',sha,slot:p.expected,partitions:counts,allPartitionsAttempted:counts.length===partitions().length,fullBoardCertified:false,modelInputsApproved:false}));
 }else failed=true;
 if(failed||counts.length!==partitions().length)process.exitCode=1;
}
module.exports={plan,receiptValid,safeAddedFiles,partitions};
if(require.main===module)main().catch(()=>{console.error('Private PickFinder runner failed; inspect runner provisioning, session, clock or archive access. No raw data logged.');process.exitCode=1;});
