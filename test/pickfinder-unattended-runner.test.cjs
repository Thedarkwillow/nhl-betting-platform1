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

test('scheduled research pilot needs prior proof and original Pacific slot',()=>{const a={...env,PICKFINDER_SCHEDULE_ENABLED:'0',PICKFINDER_SCHEDULE_RESEARCH_PILOT:'1'};assert.equal(plan(a,now).allowed,false);assert.equal(plan({...a,PICKFINDER_PRIOR_AUTH_PROOF:'1'},now).allowed,true);assert.equal(plan({...a,PICKFINDER_PRIOR_AUTH_PROOF:'1'},new Date('2026-11-25T17:07:00Z')).allowed,false);assert.equal(plan({...a,GITHUB_EVENT_NAME:'push',REQUESTED_MODE:'full_reconcile_now',PICKFINDER_PRIOR_AUTH_PROOF:'1'},now).full,true);});

test('deep research is authorized and isolated from scheduled capture',()=>{
 const a={...env,GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'deep_research_now',PICKFINDER_PRIOR_AUTH_PROOF:'1'};
 assert.equal(plan(a,now).deep,true);
 assert.throws(()=>plan({...a,PICKFINDER_AUTOMATION_AUTHORIZED:'0'},now),/authorization/);
 assert.throws(()=>plan({...a,PICKFINDER_PRIOR_AUTH_PROOF:'0'},now));
});
test('deep queue deduplicates exact scopes and rotates sports, excludes unpriced and unsafe links',()=>{
 const {queue}=require('../scripts/pickfinder-deep-research.cjs');
 const row=(sport,n)=>({sport,player:'fixture',market:'points',eventId:'e'+n,detailId:'/players/'+sport+'/p?prop=fixture:'+n,apps:[{book:'prizepicks',line:2,side:'Higher',displayedPrice:'-110'}]});
 const a=row('nba',1),b=row('nba',2),c=row('cs2',3);
 const batches=[{book:'prizepicks',sport:'nba',pages:[{rows:[a,a,b,{...a,detailId:'https://example.com/players/x?prop=x'},{...a,detailId:'/players/nba/x?prop=x',apps:[]}]}]},{book:'prizepicks',sport:'cs2',pages:[{rows:[c]}]}];
 const q=queue(batches);assert.equal(q.total,3);assert.deepEqual(q.pending.map(x=>x.sport),['nba','cs2','nba']);
 assert.equal(queue(batches,new Set([q.pending[0].key])).pending.length,2);
});

test('targeted CS2 recovery is authorized and never a morning capture',()=>{const x=plan({...env,GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'cs2_reconcile_now',PICKFINDER_PRIOR_AUTH_PROOF:'1'},now);assert.equal(x.targeted,true);assert.equal(x.expected,'manual');assert.equal(x.full,true);assert.throws(()=>plan({...env,GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'cs2_reconcile_now'},now));});

test('separate afternoon research schedule requires authorization, prior proof and exact hour',()=>{
 const e={...env,GITHUB_EVENT_SCHEDULE:'7 12 * * *',PICKFINDER_PRIOR_AUTH_PROOF:'1'},t=new Date('2026-11-25T20:07:00Z');
 assert.equal(plan(e,t).deep,true);assert.equal(plan(e,t).expected,'manual');
 assert.equal(plan({...e,PICKFINDER_SCHEDULE_ENABLED:'0'},t).allowed,false);
 assert.equal(plan({...e,PICKFINDER_PRIOR_AUTH_PROOF:'0'},t).allowed,false);
 assert.equal(plan(e,now).allowed,false);
});
test('full profile collection preserves visible observations and flags failed tabs',async()=>{
 const {enrich}=require('../scripts/pickfinder-player-research.cjs');
 const visible=new Set(['Line Movement','Prop History','Matchup','Defense']);
 const page={getByRole:(role,{name})=>{const x={isVisible:async()=>visible.has(name),waitFor:async()=>{},click:async()=>{if(name==='Defense')throw Error('fixture');}};x.or=()=>x;x.first=()=>x;return x;},evaluate:async(fn,args)=>Array.from({length:900},()=>({tab:args.tab,value:'fixture'}))};
 const row={detailId:'/players/nba/example?prop=a:b:c',research:[]};
 await enrich(page,row,{navigate:async()=>{},maxFields:Infinity});
 assert.equal(row.research.length,3600);
 assert.equal(row.profileCollection.truncated,true);
 assert.ok(row.profileCollection.tabAudit.some(t=>t.tab==='Defense'&&t.state==='failed'));
});

test('dashboard traversal checkpoints every explicit page and never infers full filter coverage',async()=>{
 const {traverseDashboard}=require('../scripts/pickfinder-dashboard-research.cjs');
 let i=1,saved=[];
 const page={url:()=> 'https://www.pickfinder.app/games',evaluate:async()=>({tables:[],cards:[{page:i}],clocks:[],controls:[],pagination:[{page:i,total:3}]}),getByRole:(role,opts)=>({count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,click:async()=>{assert.equal(opts.name,'Next page');i++;}}),waitForFunction:async()=>{}};
 const out=await traverseDashboard(page,'Games',{onSnapshot:async x=>saved.push(x.cards[0].page)});
 assert.deepEqual(saved,[1,2,3]);assert.equal(out.state,'explicit_last_page_observed');assert.equal(out.filtersExhausted,false);
 await assert.rejects(traverseDashboard(page,'Popular'),/route/);
});

test('verified unpriced modifier scopes enter research queue without inventing an offer',()=>{
 const {queue}=require('../scripts/pickfinder-deep-research.cjs');
 const r={sport:'nba',player:'fixture',market:'points',eventId:'e',detailId:'/players/nba/p?prop=a:b:c',apps:[],appEvidence:[{book:'prizepicks',line:12,tier:'goblin',icons:['prizepicks','goblin']}]};
 const q=queue([{book:'prizepicks',sport:'nba',pages:[{rows:[r,{...r,detailId:'/players/nba/q?prop=a:b:c',appEvidence:[{...r.appEvidence[0],icons:['prizepicks','goblin','demon']}]}]}]}]);
 assert.equal(q.total,1);assert.equal(r.apps.length,0);
});
test('dashboard duplicate links are accepted only for one safe destination',async()=>{
 const {verifiedNavigation}=require('../scripts/pickfinder-dashboard-research.cjs');
 const good='https://www.pickfinder.app/games';
 assert.equal(await verifiedNavigation({evaluate:async()=>[good,good]},'Games',['/games']),good);
 assert.equal(await verifiedNavigation({evaluate:async()=>['https://example.com/games']},'Games',['/games']),null);
});
