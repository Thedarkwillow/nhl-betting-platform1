'use strict';
const test=require('node:test'),a=require('node:assert/strict'),{capture}=require('../scripts/prizepicks-nba-0600-20261127.cjs');
const now='2026-11-27T14:45:00Z';
const coverage=()=>({status:'authenticated_independent_metadata',chargedCredits:0,quota:{usageUnit:'requests',remainingRequests:120,resetAt:'2026-12-01T00:00:00Z'},traditionalSportRows:[{code:'NBA',offers:2,freshnessVerified:true}]});
const response=(at=now,next_cursor=null)=>new Response(JSON.stringify({meta:{mode:'live',source_status:'fresh',next_cursor,observed_at:at},data:[
 {league:'NBA',id:'fixture-id',player:'fixture-player',stat:'Points',line:20,period:'full',starts_at:'2026-11-27T23:00:00Z',observed_at:at,tier:'standard',status:'active',sides:['more','less']}] }),{headers:{'X-Usage-Unit':'requests','X-Requests-Remaining':'119','X-Credits-Cost':'0'}});
test('one real-shaped in-window page qualifies but only counts and provenance persist',async()=>{
 const calls=[];const r=await capture({key:'fixture',clock:()=>now,coverage:()=>{calls.push('coverage');return coverage();},client:async u=>{calls.push(new URL(u).searchParams.get('league'));return response();}});
 a.deepEqual(calls,['coverage','NBA']);a.equal(r.status,'captured_in_0600_window');
 a.equal(r.requestQuotaUsed,1);a.equal(r.acceptedInWindow,1);a.equal(r.completeUpcomingNbaPage,true);
 a.equal(r.appOfferVerified,false);a.ok(!JSON.stringify(r).includes('fixture-'));
});
test('never calls outside the approved hour/day or above the 55-minute start cutoff',async()=>{
 for(const t of ['2026-11-27T13:45:00Z','2026-11-27T14:56:00Z','2026-11-27T15:00:00Z','2026-11-28T14:45:00Z']){
  const r=await capture({key:'fixture',clock:()=>t,coverage:()=>a.fail('request'),client:()=>a.fail('request')});a.equal(r.coverageAttempts,0);
 }
});
test('does not accept an earlier provider snapshot nor imply pagination completeness',async()=>{
 const args={key:'fixture',clock:()=>now,coverage};
 a.equal((await capture({...args,client:async()=>response('2026-11-27T13:59:59Z')})).status,'provider_observation_outside_window');
 a.equal((await capture({...args,client:async()=>response(now,'next')})).completeUpcomingNbaPage,false);
});
test('stops before a projection if quota is at the reserve',async()=>{
 const r=await capture({key:'fixture',clock:()=>now,coverage:()=>{const c=coverage();c.quota.remainingRequests=100;return c;},client:()=>a.fail('request')});
 a.equal(r.projectionAttempts,0);a.equal(r.status,'coverage_or_quota_not_verified');
});
