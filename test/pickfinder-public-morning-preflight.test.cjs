'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {preflight}=require('../scripts/pickfinder-public-morning-preflight.cjs');

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
test('the hosted workflow uses both gates and does not introduce additional schedules or bypasses',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/pickfinder-premium-hosted.yml','file://'+__filename),'utf8');
 assert.deepEqual([...workflow.matchAll(/cron: '([^']+)'/g)].map(m=>m[1]),['7 6 * * *','7 9 * * *','7 12 * * *','7 16 * * *']);
 assert.match(workflow,/id: opening_clock[\s\S]*?if: steps\.opening_clock\.outputs\.proceed == 'true'[\s\S]*?path: public-archive/);
 assert.match(workflow,/id: closing_clock[\s\S]*?Authorized public-only sporting evidence collection\n\s+if: steps\.closing_clock\.outputs\.proceed == 'true'/);
});
test('scheduled watchdog cannot pass on an empty, unverified, manual-only or unfinished slot',()=>{
 const {scheduledAuditExit}=require('../scripts/pickfinder-public-morning-audit.cjs');
 const state='public_pickfinder_morning_audit';
 assert.equal(scheduledAuditExit({state,partitions:{}}),1);
 assert.equal(scheduledAuditExit({state,corePartitionsVerified:true,scheduledCorePartitionsVerified:false}),1);
 assert.equal(scheduledAuditExit({state:'slot_not_finished',scheduledCorePartitionsVerified:true}),1);
 assert.equal(scheduledAuditExit({state,scheduledCorePartitionsVerified:true}),0);
});
