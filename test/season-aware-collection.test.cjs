'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registry,classify,scheduleStatus,orderedPartitions,contextGate}=require('../scripts/season-aware-collection.cjs');
const {discover}=require('../scripts/season-aware-discovery.cjs');
const now=new Date('2026-11-25T10:00:00Z');
const evidence={status:'ok',source:'fixture',observedAt:now.toISOString(),coverageUntil:'2026-11-27T10:00:00Z',upcoming:0,complete:true,phase:'offseason'};
test('all known traditional and esports leagues have common policy',()=>{assert.equal(Object.keys(registry).length,14);for(const code of Object.keys(registry))assert.equal(contextGate(code,null,{}).needsRevalidation,true);});
test('empty, disabled, partial and failed are distinct; a break cannot conceal a failure',()=>{
 const x={authenticated:true,boardState:'empty',explicitEmpty:true,schedule:evidence};
 assert.equal(classify(x,now).state,'verified_empty_board');assert.equal(classify(x,now).competition,'verified_offseason');assert.equal(classify(x,now).healthy,true);
 assert.equal(classify({...x,explicitEmpty:false},now).state,'collector_failed');
 assert.equal(classify({...x,failure:'timeout'},now).state,'collector_failed');
 assert.equal(classify({...x,boardState:'disabled',disabledConfirmed:true},now).state,'verified_disabled_board');
 assert.equal(classify({...x,boardState:'partial',pages:1},now).state,'partial_board');
 assert.equal(classify({...x,boardState:'populated',offers:0},now).state,'unresolved_offer_evidence');
 assert.equal(classify({...x,boardState:'populated',offers:1},now).state,'offers_observed');
 assert.equal(classify({...x,authenticated:false},now).healthy,false);
});
test('stale or partial schedule does not prove inactivity',()=>{
 assert.equal(scheduleStatus({...evidence,complete:false},now),'unknown');
 assert.equal(scheduleStatus({...evidence,status:'unavailable'},now),'unknown');
 assert.equal(scheduleStatus({...evidence,observedAt:'2026-11-24T10:00:00Z'},now),'unknown');
 assert.equal(scheduleStatus({...evidence,upcoming:1,complete:false},now),'competition_scheduled');
});
test('verified scheduled sport goes first; priority order never excludes unknown or offday sports',()=>{
 const codes=Object.keys(registry),r=orderedPartitions(codes,['prizepicks','underdog'],{MLB:{...evidence,upcoming:1},COD:evidence},now);
 assert.equal(r[0].code,'MLB');assert.equal(r[2].code,'NBA');assert.equal(r.at(-1).code,'COD');assert.equal(r.length,28);
});
test('roster, patch, map pool and format changes invalidate prior context without automatic promotion',()=>{
 const a={rosterVersion:'a',patchVersion:'1',mapPoolVersion:'m1',formatVersion:'bo3',rulesVersion:'r1'};
 const r=contextGate('VAL',a,{...a,patchVersion:'2',mapPoolVersion:'m2',formatVersion:'bo5'});
 assert.deepEqual(r.changed,['patchVersion','mapPoolVersion','formatVersion']);assert.equal(r.needsRevalidation,true);assert.equal(r.modelPromotionAllowed,false);
});
test('key-free discovery is bounded and esports credentials require no-charge and authorization flags',async()=>{
 const urls=[];const client=async url=>{urls.push(url);return new Response(JSON.stringify({events:[{id:'1',date:'2026-11-25T18:00:00Z',status:{type:{state:'pre'}}}]}))};
 const r=await discover({env:{PANDASCORE_API_KEY:'fixture'},now,client});assert.equal(urls.length,9);assert.equal(r.NBA.upcoming,1);assert.equal(r.VAL.status,'unavailable');assert.equal(r.NBA.complete,false);
 const bad=await discover({env:{},now,client:async()=>{throw Error('network')}});
 assert.equal(scheduleStatus(bad.NBA,now),'unknown');
});

test('official NHL fallback supplies positive dated evidence only',async()=>{const r=await discover({env:{},now,client:async url=>url.includes('api-web.nhle.com')?new Response(JSON.stringify({gameWeek:[{games:[{id:123,gameState:'FUT',startTimeUTC:'2026-11-25T18:00:00Z'}]}]})):new Response('',{status:403})});assert.equal(r.NHL.upcoming,1);assert.equal(r.NHL.source,'nhl:official_week');assert.equal(r.NBA.failure,'http_403');assert.equal(scheduleStatus(r.NHL,now),'competition_scheduled');});

test('offseason prevents paid and live calls for every registered sport; restart requires fresh competition',async()=>{
 const {lifecycle,guardLive}=require('../scripts/season-aware-collection.cjs');let calls=0;
 for(const code of Object.keys(registry)){
  for(const paid of [true,false])assert.equal((await guardLive({code,signal:evidence,paid,now},()=>{calls++;})).providerCalls,0);
  assert.equal(lifecycle(code,evidence,now).label,'Offseason');
  assert.equal(lifecycle(code,evidence,now).gradingAllowed,true);
  assert.equal((await guardLive({code,signal:{...evidence,status:'unavailable'},paid:true,now},()=>{calls++;})).providerCalls,0);
  const active={...evidence,phase:'regular',upcoming:1};
  assert.equal(lifecycle(code,active,now,'Offseason').label,'Resuming');
  await guardLive({code,signal:active,paid:true,now},()=>{calls++;});
 }
 assert.equal(calls,Object.keys(registry).length);
});
test('restart qualification separates phases, coaching and role versions',()=>{
 const {restartGate}=require('../scripts/season-aware-collection.cjs');
 const c={rosterVersion:'a',seasonVersion:'b',formatVersion:'c',rulesVersion:'d',coachingVersion:'e',playerRoleVersion:'f',contextVersion:'g'};
 const v={regular:{independent:true,contextVersion:'g'}};
 assert.equal(restartGate('MLB',c,c,v,'regular').eligibleForFurtherQualification,true);
 assert.equal(restartGate('MLB',c,c,v,'playoffs').requiresRevalidation,true);
 assert.equal(restartGate('MLB',c,{...c,coachingVersion:'new'},v,'regular').requiresRevalidation,true);
 assert.equal(restartGate('MLB',c,c,v,'regular').modelPromotionAllowed,false);
});
test('explicit dated offseason is distinct from an empty board',async()=>{
 const r=await discover({env:{},now,client:async url=>url.includes('api-web.nhle.com')?new Response(JSON.stringify({gameWeek:[{games:[]}]})):new Response(JSON.stringify({season:{type:4},events:[]}))});
 assert.equal(scheduleStatus(r.MLB,now),'verified_offseason');assert.equal(scheduleStatus(r.NFL,now),'verified_offseason');assert.equal(scheduleStatus(r.SOCCER,now),'unknown');
});
