'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {plan,receiptValid,safeAddedFiles,partitions,passwordLogin,submitLoginStep,stage,RunnerStageError}=require('../scripts/pickfinder-unattended-runner.cjs');
const {collect}=require('../scripts/pickfinder-browser.cjs');
const now=new Date('2026-11-25T14:07:00Z');
const env={PICKFINDER_AUTOMATION_AUTHORIZED:'1',PICKFINDER_SCHEDULE_ENABLED:'1',GITHUB_EVENT_NAME:'schedule',GITHUB_EVENT_SCHEDULE:'7 6 * * *'};
test('authorization and opt-in fail closed; probe separate',()=>{
 assert.throws(()=>plan({...env,PICKFINDER_AUTOMATION_AUTHORIZED:'0'},now),/authorization/);
 assert.equal(plan({...env,PICKFINDER_SCHEDULE_ENABLED:'0'},now).allowed,false);
 assert.deepEqual(plan({...env,GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'probe_now'},now),{probe:true});
 assert.deepEqual(plan({...env,GITHUB_EVENT_NAME:'push',REQUESTED_MODE:'probe_now'},now),{probe:true});
 assert.throws(()=>plan({...env,GITHUB_EVENT_NAME:'push',REQUESTED_MODE:'capture_0600'},now));
 assert.equal(plan({...env,GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'reconcile_now'},now).expected,'manual');
});
test('6 and 9 Pacific schedules are distinct, including summer time',()=>{
 assert.equal(plan(env,now).expected,'06:00');
 assert.equal(plan(env,new Date('2026-11-25T17:07:00Z')).allowed,false);
 assert.equal(plan({...env,GITHUB_EVENT_SCHEDULE:'7 9 * * *'},new Date('2026-07-25T16:07:00Z')).expected,'09:00');
 assert.equal(plan(env,new Date('2026-11-25T14:56:00Z')).allowed,false);
});
test('two browser launches, same runner and recent receipt required',()=>{
 const r={runner:'fixture',launches:2,checkedAt:now.toISOString()};
 assert.ok(receiptValid(r,'fixture',now));assert.equal(receiptValid(r,'other',now),false);
 assert.equal(receiptValid({...r,launches:1},'fixture',now),false);
 assert.equal(receiptValid(r,'fixture',new Date('2026-12-04T14:07:00Z')),false);
 assert.equal(receiptValid(r,'fixture',new Date('2026-11-25T14:06:00Z')),false);
});
test('only appended capture files can be committed',()=>{
 const p='research/pickfinder-premium/2026-11-25/0600';
 assert.ok(safeAddedFiles('A\t'+p+'/nba/a/source.json\nA\t'+p+'/nba/a/normalized.json',p));
 for(const x of ['','M\t'+p+'/x','A\tREADME.md','A\t'+p+'-other/x','D\t'+p+'/x'])assert.equal(safeAddedFiles(x,p),false);
});
test('16 distinct priority partitions and no claims of active boards',()=>{
 const p=partitions();assert.equal(p.length,16);assert.equal(new Set(p.map(x=>x.code+':'+x.book)).size,16);
});
test('deadline prevents another board read or next-page action',async()=>{
 let reads=0,clicks=0;
 const control={click:async()=>{clicks++;},isEnabled:async()=>true,waitFor:async()=>{},getByRole:()=>control};
 const page={getByRole:()=>control,evaluate:async()=>{reads++;return {authenticated:true};}};
 const result=await collect(page,{book:'prizepicks',code:'NBA',shouldContinue:()=>false});
 assert.equal(reads,0);assert.equal(clicks,0);assert.equal(result.boardState,'partial');assert.equal(result.pages.length,0);
});

function loginFixture({twoStep=true,challenge=false,formControls=1,continueControls=1,disabled=false,origin='https://www.pickfinder.app/sign-in'}={}){
 let submissions=0,filled=[];
 const button={count:async()=>formControls,waitFor:async()=>{},click:async()=>{if(disabled)throw Error('disabled fixture');submissions++;}};
 const continueButton={...button,count:async()=>continueControls};
 const form={count:async()=>1,locator:()=>button,getByRole:(role,opts)=>{assert.ok(opts.name.test('Continue'));assert.ok(!opts.name.test('Sign in'));assert.ok(!opts.name.test('Show password'));return continueButton;}};
 const page={goto:async()=>{},url:()=>origin,locator(selector){const isPassword=selector.includes('type=password');return {locator:()=>form,waitFor:async()=>{if(isPassword&&challenge)throw Error('sensitive fixture text');},isVisible:async()=>!twoStep||submissions>0,fill:async v=>{filled.push([isPassword?'password':'email',v]);}};},getByRole(role,opts){return {waitFor:async()=>{},click:async()=>{submissions++;}};}};
 return {page,filled,get submissions(){return submissions;}};
}
test('normal one-step and two-step password forms are supported',async()=>{
 for(const twoStep of [true,false]){const f=loginFixture({twoStep});await passwordLogin(f.page,{PICKFINDER_EMAIL:'fixture',PICKFINDER_PASSWORD:'fixture-secret'});assert.deepEqual(f.filled,[['email','fixture'],['password','fixture-secret']]);assert.equal(f.submissions,twoStep?2:1);}
});
test('verification and unexpected origin fail closed without leaking errors',async()=>{
 const f=loginFixture({challenge:true});await assert.rejects(passwordLogin(f.page,{PICKFINDER_EMAIL:'fixture',PICKFINDER_PASSWORD:'fixture-secret'}),e=>e instanceof RunnerStageError&&e.stage==='password_step_unavailable_or_verification_required'&&!e.message.includes('sensitive'));
 assert.equal(f.submissions,1);assert.equal(f.filled.length,1);
 const g=loginFixture({origin:'https://example.org'});await assert.rejects(passwordLogin(g.page,{PICKFINDER_EMAIL:'fixture',PICKFINDER_PASSWORD:'fixture-secret'}),/login_origin_not_supported/);assert.equal(g.filled.length,0);
 await assert.rejects(stage('safe_stage',()=>{throw Error('private text');}),e=>e.message==='safe_stage');
});

test('ambiguous and disabled form controls are not bypassed',async()=>{
 const a=loginFixture({twoStep:false,formControls:2,continueControls:0});await assert.rejects(passwordLogin(a.page,{PICKFINDER_EMAIL:'fixture',PICKFINDER_PASSWORD:'fixture-secret'}),/password_submit_ambiguous_form_controls/);assert.equal(a.submissions,0);
 const b=loginFixture({twoStep:false,disabled:true});await assert.rejects(passwordLogin(b.page,{PICKFINDER_EMAIL:'fixture',PICKFINDER_PASSWORD:'fixture-secret'}),/password_submit_control_click/);assert.equal(b.submissions,0);
});

test('unique Continue is selected even with multiple other form buttons',async()=>{
 const f=loginFixture({twoStep:true,formControls:3,continueControls:1});await passwordLogin(f.page,{PICKFINDER_EMAIL:'fixture',PICKFINDER_PASSWORD:'fixture-secret'});assert.equal(f.submissions,2);
 const g=loginFixture({twoStep:false,continueControls:2});await assert.rejects(passwordLogin(g.page,{PICKFINDER_EMAIL:'fixture',PICKFINDER_PASSWORD:'fixture-secret'}),/password_submit_ambiguous_continue_controls/);assert.equal(g.submissions,0);
});

test('marked push reconciliation requires verified prior authentication',()=>{assert.throws(()=>plan({...env,GITHUB_EVENT_NAME:'push',REQUESTED_MODE:'reconcile_now'},now));assert.equal(plan({...env,GITHUB_EVENT_NAME:'push',REQUESTED_MODE:'reconcile_now',PICKFINDER_PRIOR_AUTH_PROOF:'1'},now).reconcile,true);});
