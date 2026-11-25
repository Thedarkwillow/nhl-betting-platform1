'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {plan,receiptValid,safeAddedFiles,partitions}=require('../scripts/pickfinder-unattended-runner.cjs');
const {collect}=require('../scripts/pickfinder-browser.cjs');
const now=new Date('2026-11-25T14:07:00Z');
const env={PICKFINDER_AUTOMATION_AUTHORIZED:'1',PICKFINDER_SCHEDULE_ENABLED:'1',GITHUB_EVENT_NAME:'schedule',GITHUB_EVENT_SCHEDULE:'7 6 * * *'};
test('authorization and opt-in fail closed; probe separate',()=>{
 assert.throws(()=>plan({...env,PICKFINDER_AUTOMATION_AUTHORIZED:'0'},now),/authorization/);
 assert.equal(plan({...env,PICKFINDER_SCHEDULE_ENABLED:'0'},now).allowed,false);
 assert.deepEqual(plan({...env,GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'probe_now'},now),{probe:true});
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
