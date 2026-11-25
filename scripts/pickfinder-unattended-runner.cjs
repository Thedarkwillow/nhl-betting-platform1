'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {pacific,decide}=require('./pacific-morning-capture-gate.cjs');
const {collect,ORIGIN}=require('./pickfinder-browser.cjs');
const {enrich}=require('./pickfinder-player-research.cjs');
const {archive,normalize}=require('./pickfinder-premium-archive.cjs');
const {loadPilot,compare,inputAudit,missingDisposition,loadVerifiedAttempt}=require('./pickfinder-pilot-reconcile.cjs');
const {registry,classify,orderedPartitions}=require('./season-aware-collection.cjs');
const {discover}=require('./season-aware-discovery.cjs');
const SPORTS=['NBA','CS2','VAL','LOL','DOTA2','COD','NHL','NFL'];
const BOOKS=['prizepicks','underdog'];
const partitions=()=>SPORTS.flatMap(code=>BOOKS.map(book=>({code,book})));
const scheduledResearchPilot=env=>env.GITHUB_EVENT_NAME==='schedule'&&env.PICKFINDER_SCHEDULE_RESEARCH_PILOT==='1'&&env.PICKFINDER_PRIOR_AUTH_PROOF==='1';
function plan(env,now=new Date()){
 if(env.PICKFINDER_AUTOMATION_AUTHORIZED!=='1')throw Error('authorization_required');
 if(['workflow_dispatch','push'].includes(env.GITHUB_EVENT_NAME)&&env.REQUESTED_MODE==='probe_now')return {probe:true};
 if(['workflow_dispatch','push'].includes(env.GITHUB_EVENT_NAME)&&env.REQUESTED_MODE==='cs2_reconcile_now'&&env.PICKFINDER_PRIOR_AUTH_PROOF==='1')return {allowed:true,reconcile:true,full:true,targeted:true,expected:'manual',clock:pacific(now)};
 if(['workflow_dispatch','push'].includes(env.GITHUB_EVENT_NAME)&&env.REQUESTED_MODE==='deep_research_now'&&env.PICKFINDER_PRIOR_AUTH_PROOF==='1')return {allowed:true,reconcile:true,deep:true,expected:'manual',clock:pacific(now)};
 if((env.GITHUB_EVENT_NAME==='workflow_dispatch'||env.GITHUB_EVENT_NAME==='push'&&env.PICKFINDER_PRIOR_AUTH_PROOF==='1')&&['reconcile_now','full_reconcile_now'].includes(env.REQUESTED_MODE))return {allowed:true,reconcile:true,full:env.REQUESTED_MODE==='full_reconcile_now',expected:'manual',clock:pacific(now)};
 if(env.GITHUB_EVENT_NAME==='schedule'&&env.PICKFINDER_SCHEDULE_ENABLED!=='1'&&!scheduledResearchPilot(env))return {allowed:false,state:'schedule_disabled'};
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
async function checkpoint(root,prefix,batches,attempt,p){
  git(root,['add','--',prefix]);
  if(!safeAddedFiles(git(root,['diff','--cached','--name-status']),prefix))throw Error('non append-only staging refused');
  git(root,['-c','user.name=PickFinder research runner','-c','user.email=research-runner@users.noreply.github.com','commit','-m','Archive PickFinder private research '+p.clock.day+' '+p.expected]);
  // Other authorized archive jobs may append while a long board collection is in flight.
  // Rebase only our append-only commit; never force-push or overwrite an existing source.
  const sha=await stage('private_archive_push',async()=>{
   for(let attempt=0;attempt<3;attempt++){
    git(root,['fetch','origin','main']);
    try{git(root,['rebase','FETCH_HEAD']);}catch(e){try{git(root,['rebase','--abort']);}catch{}throw e;}
    const revision=git(root,['rev-parse','HEAD']);
    if(!safeAddedFiles(git(root,['diff-tree','--no-commit-id','--name-status','-r',revision]),prefix))throw Error('rebased commit not append-only');
    try{git(root,['push','origin','HEAD:refs/heads/main']);return revision;}catch(e){const detail=String(e?.stderr||'');const category=/non-fast-forward|fetch first|failed to push some refs/i.test(detail)?'remote_rejected_or_advanced':/authentication failed|permission denied|403/i.test(detail)?'permission_or_authentication':/large files|exceeds.*limit|GH001/i.test(detail)?'file_size_rejected':'other_git_failure';console.log(JSON.stringify({state:'private_archive_push_retry',attempt:attempt+1,category,rawDataLogged:false}));if(attempt===2)throw e;await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));}
   }
   throw Error('archive push retry exhausted');
  });
  await stage('private_archive_fetch',()=>git(root,['fetch','origin','main']));
  await stage('private_archive_ancestry',()=>git(root,['merge-base','--is-ancestor',sha,'FETCH_HEAD']));
  await stage('private_archive_remote_readback',()=>{
   for(const b of batches){const base=prefix+'/'+b.book+'/'+b.sport+'/'+attempt;
    const raw=execFileSync('git',['-C',root,'show','FETCH_HEAD:'+base+'/source.json'],{maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']});
    const n=JSON.parse(execFileSync('git',['-C',root,'show','FETCH_HEAD:'+base+'/normalized.json'],{maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']}));
    if(crypto.createHash('sha256').update(raw).digest('hex')!==n.sourceDigest||raw.toString()!==JSON.stringify(b))throw Error('archive mismatch');
   }
  });

 return sha;
}
async function submitLoginStep(page,field,phase){
 // Only use the normal visible submit control associated with this credential field.
 const form=field.locator('xpath=ancestor::form[1]');
 // The observed PickFinder flow has a header Sign in button and a form Continue button.
 // Password visibility toggles and other buttons must not count as submit candidates.
 const label=/^continue(?:\s*[→▶▸])?$/i;
 const scoped=form.getByRole('button',{name:label});
 const native=form.locator('button[type=submit]:visible, input[type=submit]:visible');
 const named=page.getByRole('button',{name:label});
 const button=await stage(phase+'_control_lookup',async()=>{
  if(await form.count()===1){
   const count=await scoped.count();
   if(count===1)return scoped;
   if(count>1)throw new RunnerStageError(phase+'_ambiguous_continue_controls');
   const n=await native.count();
   if(n===1)return native;
   if(n>1)throw new RunnerStageError(phase+'_ambiguous_form_controls');
  }
  if(await named.count()!==1)throw new RunnerStageError(phase+'_unique_continue_unavailable');
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
 const pilotSchedule=hosted&&scheduledResearchPilot(env);
 if(pilotSchedule)await stage('prior_private_archive_digest_proof',()=>loadVerifiedAttempt(root,'168bd736ee99157891fcf87b766ffcae49170dd2'));
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
  if(env.PICKFINDER_HOSTED_AUTH_VERIFIED!=='1'&&!((p.reconcile||pilotSchedule)&&env.PICKFINDER_PRIOR_AUTH_PROOF==='1'))throw Error('fresh hosted probe required');
  if(env.GITHUB_EVENT_NAME==='schedule'&&env.PICKFINDER_HOSTED_CAPTURE_VERIFIED!=='1'&&!pilotSchedule)throw Error('manual capture proof required');
 }else{
  if(!receiptValid(receipt,env.RUNNER_NAME))throw Error('recent runner probe required');
  if(env.GITHUB_EVENT_NAME==='schedule'&&!receipt.captureVerifiedAt)throw Error('manual in-window remote archive proof required');
 }
 if(p.deep){
  const {context,page}=await open();
  const until=Date.now()+15*60000;
  try{console.log(JSON.stringify(await stage('deep_research',()=>require('./pickfinder-deep-research.cjs').run({root,context,page,enrich,collect,limit:20,shouldContinue:()=>Date.now()<until}))));}
  finally{await context.close();}return;
 }
 const prefix='research/pickfinder-premium/'+p.clock.day+'/'+p.expected.replace(':','');
 const deadline=Date.now()+(p.full?40:20)*60000;
 const remaining=()=>{const t=pacific(new Date());return p.reconcile?Date.now()<deadline&&t.day===p.clock.day:t.day===p.clock.day&&t.hour===p.clock.hour&&t.minute<55;};
 const evidence=await discover({env});
 const preferredTargets=orderedPartitions(SPORTS,BOOKS,evidence);
 const optionalCodes=Object.keys(registry).filter(code=>!SPORTS.includes(code));
 // Adjacent NBA books reduce clock separation without asserting simultaneous capture.
 const nbaPair=BOOKS.map(book=>({book,code:'NBA'}));
 const other=preferredTargets.filter(p=>p.code!=='NBA');
 const targets=p.targeted?BOOKS.map(book=>({book,code:'CS2'})):[...nbaPair,...(p.reconcile?[...['NFL','NHL'].map(code=>({book:'prizepicks',code})),...other.filter(p=>p.book!=='prizepicks'||!['NFL','NHL'].includes(p.code))]:other)];
 console.log(JSON.stringify({state:'competition_discovery',sports:Object.fromEntries(Object.keys(registry).map(code=>[code,{source:evidence[code]?.source,status:evidence[code]?.status,upcoming:evidence[code]?.upcoming}])),paidEndpointsCalled:0}));
 const attempt=crypto.randomUUID();
 const counts=[],batches=[],normalized=[],checkpointShas=[];let failed=false;
 process.env.RESTRICTED_DESTINATION_VERIFIED='1';
 const {context,page}=await open();
 try{
  const detail=await context.newPage();detail.setDefaultTimeout(5000);
  // Probe optional league controls only after verified authentication. Missing optional sports are not proof of an offseason.
  for(const code of p.targeted?[]:optionalCodes){const b=page.getByRole('button',{name:code,exact:true});if(await b.count()===1&&await b.isVisible())targets.push(...BOOKS.map(book=>({code,book})));else console.log(JSON.stringify({state:'optional_board_not_exposed',code,competition:'unknown'}));}
  for(const {book,code} of targets){
   if(!remaining()){failed=true;break;}
   try{
    await stage('board_navigation',()=>page.goto(ORIGIN+'/props',{timeout:20000}));
    const batch=await stage('board_collection',()=>collect(page,{book,code,slot:p.expected,maxPages:p.reconcile&&!p.full?2:Infinity,shouldContinue:remaining}));
    // A bounded profile sample preserves board coverage. Separate deep research is still required.
    const sample=batch.pages.flatMap(pg=>pg.rows).find(r=>r.apps.length);
    if(sample&&remaining())try{await enrich(detail,sample,{navigate:url=>detail.goto(url,{timeout:8000})});}catch{sample.profileCollection={status:'unavailable'};}
    batch.endedAt=new Date().toISOString();
    const summary=await stage('partition_archive_validation',()=>archive(batch,root,attempt));
    const checkpointSha=await stage('partition_checkpoint',()=>checkpoint(root,prefix,[batch],attempt,p));
    checkpointShas.push(checkpointSha);batches.push(batch);normalized.push(normalize(batch));
    console.log(JSON.stringify({state:'partition_checkpoint_verified',book,code,sha:checkpointSha,remoteDigestVerified:true}));
    const health=classify({boardState:batch.boardState,offers:summary.health.distinctOfferKeys,pages:summary.health.pages,authenticated:batch.authenticated===true,explicitEmpty:batch.explicitEmpty===true,disabledConfirmed:batch.disabledConfirmed===true,failure:batch.failure,schedule:evidence[code]});
    counts.push({book,code,seasonStatus:health.state,competition:health.competition,boardState:summary.boardState,withinSlot:summary.withinSlot,offers:summary.health.distinctOfferKeys,unresolved:summary.health.unresolvedRows,unresolvedEvidence:summary.health.unresolvedEvidence,pages:summary.health.pages,traversal:summary.pageTraversalComplete,failure:batch.failure||null});
    if(batch.failure==='session_expired'){failed=true;break;}
    if(!p.reconcile&&(!summary.withinSlot||!health.healthy||summary.health.unresolvedRows||summary.health.priceConflictKeys||summary.health.repeatOrUnresolvedLinks))failed=true;
    if(p.reconcile&&summary.boardState==='partial')failed=true;
   }catch(e){counts.push({book,code,state:'partition_failed',stage:e instanceof RunnerStageError?e.stage:'unclassified'});failed=true;if(e instanceof RunnerStageError&&e.stage.startsWith('private_archive')||e instanceof RunnerStageError&&['partition_checkpoint','partition_archive_validation'].includes(e.stage)){console.log(JSON.stringify({state:'partition_status',...counts.at(-1)}));break;}}
   console.log(JSON.stringify({state:'partition_status',...counts.at(-1)}));
  }
 }finally{await context.close();}
 console.log(JSON.stringify({state:'collection_attempt_summary',attempted:counts.length,expected:targets.length,partitions:counts,rawRowsPublished:0}));
 if(counts.some(c=>typeof c.offers==='number')){
  const sha=checkpointShas.at(-1);
  if(checkpointShas.length!==batches.length||!sha)throw Error('partition checkpoint incomplete');
  if(p.reconcile){const pilot=loadPilot(root);console.log(JSON.stringify({state:'fresh_reconciliation',...compare(pilot,batches)}));
   console.log(JSON.stringify({state:'prior_missing_disposition',...missingDisposition(pilot,loadVerifiedAttempt(root,'168bd736ee99157891fcf87b766ffcae49170dd2'))}));
   console.log(JSON.stringify({state:'current_missing_disposition',...missingDisposition(pilot,batches)}));
  }
  console.log(JSON.stringify({state:'nba_esports_input_audit',...inputAudit(normalized)}));
  if(!p.reconcile&&!hosted&&counts.length===targets.length&&counts.every(c=>c.withinSlot===true)&&counts.some(c=>c.offers>0)){
   fs.writeFileSync(receiptPath,JSON.stringify({...receipt,captureVerifiedAt:new Date().toISOString(),archiveSha:sha}),{mode:0o600});
  }
  console.log(JSON.stringify({state:'remote_archive_verified',sha,slot:p.expected,partitions:counts,allPartitionsAttempted:counts.length===targets.length,remoteDigestVerified:true,researchOnly:true,scheduledPilot:pilotSchedule,boundedSample:p.reconcile===true&&!p.full,allVisibleBoardsTraversed:counts.length===targets.length&&counts.every(c=>c.traversal||['verified_empty_board','verified_disabled_board'].includes(c.seasonStatus)),fullBoardCertified:false,modelInputsApproved:false}));
 }else failed=true;
 if(p.reconcile&&!counts.some(c=>c.offers>0))failed=true;
 if(p.full&&counts.some(c=>!c.traversal&&!['verified_empty_board','verified_disabled_board'].includes(c.seasonStatus)))failed=true;
 if(failed||counts.length!==targets.length)process.exitCode=1;
}
module.exports={checkpoint,plan,receiptValid,safeAddedFiles,partitions,passwordLogin,submitLoginStep,stage,RunnerStageError};
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({state:'runner_failed',stage:e instanceof RunnerStageError?e.stage:'unclassified',rawDataLogged:false}));process.exitCode=1;});
