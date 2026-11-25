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
 if(['workflow_dispatch','push'].includes(env.GITHUB_EVENT_NAME)&&env.REQUESTED_MODE==='probe_now')return {probe:true};
 if(env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.REQUESTED_MODE==='reconcile_now')return {allowed:true,reconcile:true,expected:'manual',clock:pacific(now)};
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
class RunnerStageError extends Error {
 constructor(stage){super(stage);this.stage=stage;}
}
async function stage(name,fn){try{return await fn();}catch(e){if(e instanceof RunnerStageError)throw e;throw new RunnerStageError(name);}}
async function submitLoginStep(page,field,phase){
 // Only use the normal visible submit control associated with this credential field.
 const form=field.locator('xpath=ancestor::form[1]');
 const scoped=form.locator('button[type=submit]:visible, input[type=submit]:visible, button:not([type]):visible');
 const named=page.getByRole('button',{name:/^(sign in|log in|continue|next)(?: with (?:email|password))?(?:\s*→)?$/i,exact:true});
 const button=await stage(phase+'_control_lookup',async()=>{
  if(await form.count()===1){
   const count=await scoped.count();
   if(count===1)return scoped;
   if(count>1)throw new RunnerStageError(phase+'_ambiguous_form_controls');
  }
  if(await named.count()!==1)throw new RunnerStageError(phase+'_unique_control_unavailable');
  return named;
 });
 await stage(phase+'_control_visible',()=>button.waitFor({state:'visible',timeout:10000}));
 if(new URL(page.url()).origin!==ORIGIN)throw new RunnerStageError('login_origin_not_supported');
 // Do not force click, bypass disabled controls, or solve verification challenges.
 await stage(phase+'_control_click',()=>button.click({timeout:15000}));
}
async function passwordLogin(page,env){
 if(!env.PICKFINDER_EMAIL||!env.PICKFINDER_PASSWORD)throw new RunnerStageError('login_secrets_missing');
 await stage('login_page_navigation',()=>page.goto(ORIGIN+'/sign-in',{timeout:20000}));
 const sameOrigin=()=>new URL(page.url()).origin===ORIGIN;
 if(!sameOrigin())throw new RunnerStageError('login_origin_not_supported');
 const email=page.locator('input[type=email]:visible, input[name=identifier]:visible, input[autocomplete=username]:visible');
 const password=page.locator('input[type=password]:visible');
 await stage('email_field_not_visible',()=>email.waitFor({state:'visible',timeout:20000}));
 if(!sameOrigin())throw new RunnerStageError('login_origin_not_supported');
 await stage('email_field_fill',()=>email.fill(env.PICKFINDER_EMAIL));
 if(!await password.isVisible()){
  await submitLoginStep(page,email,'identifier_submit');
  await stage('password_step_unavailable_or_verification_required',()=>password.waitFor({state:'visible',timeout:20000}));
 }
 if(!sameOrigin())throw new RunnerStageError('login_origin_not_supported');
 await stage('password_field_fill',()=>password.fill(env.PICKFINDER_PASSWORD));
 await submitLoginStep(page,password,'password_submit');
 // No retry or alternate verification path. The provider may require an interactive challenge.
 await stage('login_completion_not_verified',()=>page.getByRole('button',{name:'Open user menu'}).waitFor({timeout:25000}));
}
async function openHostedBoard(chromium,env){
 const browser=await stage('browser_launch',()=>chromium.launch({headless:true}));
 try{
  const state=env.PICKFINDER_STORAGE_STATE;
  const context=await stage('browser_context_creation',()=>browser.newContext(state?{storageState:JSON.parse(state)}:{}));
  const page=await stage('browser_page_creation',()=>context.newPage());page.setDefaultTimeout(8000);
  if(!state)await passwordLogin(page,env);
  await stage('premium_board_navigation',()=>page.goto(ORIGIN+'/props',{timeout:20000}));
  await stage('premium_user_menu_unavailable',()=>page.getByRole('button',{name:'Open user menu'}).waitFor({timeout:15000}));
  await stage('premium_badge_unavailable',()=>page.waitForFunction(()=>document.body.innerText.split('\n').some(l=>l.trim()==='Premium'),null,{timeout:15000}));
  return {page,context:{newPage:()=>context.newPage(),close:()=>browser.close()}};
 }catch(e){await browser.close();throw e;}
}
async function main(env=process.env){
 const p=await stage('invocation_gate',()=>plan(env));
 if(!p.probe&&!p.allowed){console.log(JSON.stringify(p));return;}
 const {root,profile}=await stage('private_destination_validation',()=>destination(env));
 const {chromium}=await stage('playwright_module_load',()=>require('playwright'));
 const hosted=env.PICKFINDER_HOSTED==='1';
 const open=()=>hosted?openHostedBoard(chromium,env):openBoard(chromium,profile);
 const receiptPath=path.join(profile,'.pickfinder-automation-probe.json');
 if(p.probe){
  if(hosted){const {context}=await open();await context.close();console.log(JSON.stringify({state:'hosted_fresh_auth_verified',offers:0}));return;}
  if(!env.RUNNER_NAME)throw Error('private runner name required');
  try{fs.unlinkSync(receiptPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  for(let i=0;i<2;i++){const {context}=await openBoard(chromium,profile);await context.close();}
  fs.writeFileSync(receiptPath,JSON.stringify({runner:env.RUNNER_NAME,launches:2,checkedAt:new Date().toISOString()}),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({state:'two_browser_relaunches_authenticated',hostRebootVerified:false,offers:0}));return;
 }
 const receipt=hosted?null:JSON.parse(fs.readFileSync(receiptPath,'utf8'));
 if(hosted){
  if(env.PICKFINDER_HOSTED_AUTH_VERIFIED!=='1')throw Error('fresh hosted probe required');
  if(env.GITHUB_EVENT_NAME==='schedule'&&env.PICKFINDER_HOSTED_CAPTURE_VERIFIED!=='1')throw Error('manual capture proof required');
 }else{
  if(!receiptValid(receipt,env.RUNNER_NAME))throw Error('recent runner probe required');
  if(env.GITHUB_EVENT_NAME==='schedule'&&!receipt.captureVerifiedAt)throw Error('manual in-window remote archive proof required');
 }
 const prefix='research/pickfinder-premium/'+p.clock.day+'/'+p.expected.replace(':','');
 const deadline=Date.now()+20*60000;
 const remaining=()=>{const t=pacific(new Date());return p.reconcile?Date.now()<deadline&&t.day===p.clock.day:t.day===p.clock.day&&t.hour===p.clock.hour&&t.minute<55;};
 const targets=p.reconcile?['NBA','NFL','NHL'].map(code=>({book:'prizepicks',code})):partitions();
 const attempt=crypto.randomUUID();
 const counts=[];let failed=false;
 process.env.RESTRICTED_DESTINATION_VERIFIED='1';
 const {context,page}=await open();
 try{
  const detail=await context.newPage();detail.setDefaultTimeout(5000);
  for(const {book,code} of targets){
   if(!remaining()){failed=true;break;}
   try{
    await page.goto(ORIGIN+'/props',{timeout:20000});
    const batch=await collect(page,{book,code,slot:p.expected,maxPages:p.reconcile?2:100,shouldContinue:remaining});
    // A bounded profile sample preserves board coverage. Separate deep research is still required.
    const sample=batch.pages.flatMap(pg=>pg.rows).find(r=>r.apps.length);
    if(sample&&remaining())try{await enrich(detail,sample,{navigate:url=>detail.goto(url,{timeout:8000})});}catch{sample.profileCollection={status:'unavailable'};}
    batch.endedAt=new Date().toISOString();
    const summary=archive(batch,root,attempt);
    counts.push({book,code,boardState:summary.boardState,withinSlot:summary.withinSlot,offers:summary.health.distinctOfferKeys,unresolved:summary.health.unresolvedRows,unresolvedEvidence:summary.health.unresolvedEvidence,pages:summary.health.pages,traversal:summary.pageTraversalComplete});
    if(batch.failure==='session_expired'){failed=true;break;}
    if(!p.reconcile&&!summary.withinSlot||summary.boardState==='partial'||summary.health.unresolvedRows||summary.health.priceConflictKeys||summary.health.repeatOrUnresolvedLinks)failed=true;
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
  if(!p.reconcile&&!hosted&&counts.length===partitions().length&&counts.every(c=>c.withinSlot===true)&&counts.some(c=>c.offers>0)){
   fs.writeFileSync(receiptPath,JSON.stringify({...receipt,captureVerifiedAt:new Date().toISOString(),archiveSha:sha}),{mode:0o600});
  }
  console.log(JSON.stringify({state:'remote_archive_verified',sha,slot:p.expected,partitions:counts,allPartitionsAttempted:counts.length===targets.length,fullBoardCertified:false,modelInputsApproved:false}));
 }else failed=true;
 if(failed||counts.length!==targets.length)process.exitCode=1;
}
module.exports={plan,receiptValid,safeAddedFiles,partitions,passwordLogin,submitLoginStep,stage,RunnerStageError};
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({state:'runner_failed',stage:e instanceof RunnerStageError?e.stage:'unclassified',rawDataLogged:false}));process.exitCode=1;});
