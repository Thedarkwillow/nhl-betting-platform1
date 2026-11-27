'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {preflight,backupPreflight}=require('../scripts/pickfinder-public-morning-preflight.cjs');

test('a delayed 6 AM start is refused even when it overlaps the 9 AM slot',()=>{
 const env={GITHUB_EVENT_NAME:'schedule',GITHUB_EVENT_SCHEDULE:'7 6 * * *'};
 const ready=preflight(env,'2026-11-26T14:07:00Z');
 assert.equal(ready.proceed,true);
 const late=preflight(env,'2026-11-26T17:11:00Z');
 assert.equal(late.proceed,false);
 assert.equal(late.expected,'06:00');
 assert.equal(late.providerRequests,0);
 assert.equal(late.originalSixToNineCaptureClaim,false);
 assert.equal(preflight(env,'2026-11-26T22:53:47Z').proceed,false);
 assert.throws(()=>preflight({...env,GITHUB_EVENT_SCHEDULE:'8 6 * * *'},'2026-11-26T14:08:00Z'));
});
test('the same gate rejects a start aged out during browser setup without affecting unrelated modes',()=>{
 const env={GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'capture_0900'};
 assert.equal(preflight(env,'2026-07-01T16:54:59Z').proceed,true);
 assert.equal(preflight(env,'2026-07-01T16:55:00Z').state,'board_collection_cutoff');
 assert.equal(preflight(env,'2026-07-01T16:55:00Z').proceed,false);
 assert.deepEqual(preflight({...env,REQUESTED_MODE:'timezone_validation'},'2026-07-01T15:59:00Z'),
  {proceed:true,state:'not_a_morning_capture'});
});
test('the hosted workflow serializes both actual-time gates and the archive-checked fallback',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/pickfinder-premium-hosted.yml','file://'+__filename),'utf8');
 assert.deepEqual([...workflow.matchAll(/cron: '([^']+)'/g)].map(m=>m[1]),['7 6 * * *','7 9 * * *','29 6 * * *','29 9 * * *','7 12 * * *','7 16 * * *']);
 assert.match(workflow,/id: opening_clock[\s\S]*?if: steps\.opening_clock\.outputs\.proceed == 'true'[\s\S]*?path: public-archive/);
 assert.match(workflow,/id: backup_archive[\s\S]*?Install pinned browser\n\s+if: steps\.backup_archive\.outputs\.proceed == 'true'/);
 assert.match(workflow,/id: closing_clock[\s\S]*?Authorized public-only sporting evidence collection\n\s+if: steps\.closing_clock\.outputs\.proceed == 'true'/);
});
test('same-hour fallback checks the exact immutable slot and never repeats a verified partition',()=>{
 const env={GITHUB_EVENT_NAME:'schedule',GITHUB_EVENT_SCHEDULE:'29 9 * * *'};
 const actual='2026-11-26T17:29:00Z';
 const check=(root,day,slot)=>{
  assert.deepEqual([root,day,slot],['archive','2026-11-26','09:00']);
  return true;
 };
 assert.equal(backupPreflight('archive',env,actual,check).proceed,false);
 assert.equal(backupPreflight('archive',env,actual,()=>false).proceed,true);
 assert.equal(backupPreflight('archive',env,'2026-11-26T17:28:59Z',()=>assert.fail('no early archive lookup')).state,'before_backup_minute');
 assert.equal(backupPreflight('archive',env,'2026-11-26T18:00:00Z',()=>assert.fail('no wrong hour archive lookup')).proceed,false);
 assert.equal(backupPreflight('archive',{...env,GITHUB_EVENT_SCHEDULE:'7 9 * * *'},actual,()=>assert.fail('primary unchanged')).proceed,true);
});
test('scheduled watchdog cannot pass on an empty, unverified, manual-only or unfinished slot',()=>{
 const {scheduledAuditExit}=require('../scripts/pickfinder-public-morning-audit.cjs');
 const state='public_pickfinder_morning_audit';
 assert.equal(scheduledAuditExit({state,partitions:{}}),1);
 assert.equal(scheduledAuditExit({state,corePartitionsVerified:true,scheduledCorePartitionsVerified:false}),1);
 assert.equal(scheduledAuditExit({state:'slot_not_finished',scheduledCorePartitionsVerified:true}),1);
 assert.equal(scheduledAuditExit({state,scheduledCorePartitionsVerified:true}),0);
});
test('watchdog keeps its original GitHub creation day after Pacific midnight',async()=>{
 const {auditContext}=require('../scripts/pickfinder-public-morning-audit.cjs');
 const env={GITHUB_EVENT_NAME:'schedule',GITHUB_RUN_ID:'123456',AUDIT_CRON:'20 7 * * *'};
 const run={id:123456,event:'schedule',path:'.github/workflows/morning-private-archive-health.yml',head_branch:'main',repository:{full_name:'Thedarkwillow/nhl-betting-platform1'},created_at:'2026-11-26T15:20:00Z'};
 const now=new Date('2026-11-27T09:00:00Z');
 const fake=(expected)=>async url=>{
  assert.equal(url,'https://api.github.com/repos/Thedarkwillow/nhl-betting-platform1/actions/runs/123456');
  return {ok:true,json:async()=>expected};
 };
 assert.deepEqual(await auditContext('06:00','',env,fake(run),now),{day:'2026-11-26',dayBasis:'github_run_created_at',auditRunId:'123456'});
 await assert.rejects(auditContext('06:00','',env,fake({...run,created_at:'2026-11-27T08:11:00Z'}),now),/unverified_scheduler_day/);
 await assert.rejects(auditContext('06:00','',env,fake({...run,event:'workflow_dispatch'}),now),/unverified_scheduler_run_metadata/);
 await assert.rejects(auditContext('06:00','',env,async()=>({ok:false}),now),/unverified_scheduler_run_metadata/);
 await assert.rejects(auditContext('09:00','',env,fake(run),now),/unverified_audit_trigger/);
 await assert.rejects(auditContext('06:00','2026-11-26',env,fake(run),now),/unverified_audit_trigger/);
});
test('manual date audit is calendar validated and does not need scheduler API',async()=>{
 const {auditContext}=require('../scripts/pickfinder-public-morning-audit.cjs');
 const now=new Date('2026-11-27T03:00:00Z'),client=()=>assert.fail('manual context makes no API requests');
 assert.deepEqual(await auditContext('09:00','',{},client,now),{day:'2026-11-26',dayBasis:'current_pacific_day'});
 assert.deepEqual(await auditContext('09:00','2026-11-25',{},client,now),{day:'2026-11-25',dayBasis:'explicit_pacific_day'});
 await assert.rejects(auditContext('09:00','2026-02-30',{},client,now),/invalid_requested_day/);
});
test('morning watchdog uploads the audit result even when source verification fails',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/morning-private-archive-health.yml','file://'+__filename),'utf8');
 assert.match(workflow,/AUDIT_OUTPUT: .*runner\.temp.*\/pickfinder-morning-audit\.json/);
 assert.match(workflow,/Preserve read-only morning evidence[^\n]*\n\s*if: \$\{\{ always\(\) \}\}\n\s*uses: actions\/upload-artifact@v4/);
 assert.deepEqual([...workflow.matchAll(/cron: '([^']+)'/g)].map(m=>m[1]),['20 7 * * *','20 10 * * *']);
});
