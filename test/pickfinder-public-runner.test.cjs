'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{safe}=require('../scripts/pickfinder-public-archive.cjs'),{invocation,queue,publicProfile}=require('../scripts/pickfinder-public-runner.cjs');
test('publication excludes credentials and account state',()=>{assert.deepEqual(safe({player:'Fixture Player',price:'-110'}),{player:'Fixture Player',price:'-110'});for(const x of [{password:'secret'},{value:'user@example.com'},{cookie:'abc'},{value:'Bearer abc'}])assert.throws(()=>safe(x));});
test('morning is actual-hour only, no private token',()=>{const e={PICKFINDER_AUTOMATION_AUTHORIZED:'1',PICKFINDER_PUBLIC_DATA_AUTHORIZED:'1',GITHUB_EVENT_NAME:'schedule',GITHUB_EVENT_SCHEDULE:'7 6 * * *'};assert.equal(invocation(e,new Date('2026-11-25T14:07:00Z')).allowed,true);assert.equal(invocation(e,new Date('2026-11-25T17:07:00Z')).allowed,false);});
test('queue resumes only current completed profile scopes',()=>{const b={book:'prizepicks',sport:'nba',offers:[{player:'Fixture',detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A5',market:'points',eventId:'e'}]};const q=queue([b],[]);assert.equal(q.total,1);const x=q.pending[0];const p=publicProfile({...x,research:[{origin:'profile',metric:'displayed panel',value:'not published'},{origin:'profile',metric:'row 1',value:'5',scope:'Stats'}],profileCollection:{truncated:false}});assert.equal(p.research.length,1);assert.equal(queue([b],[{records:[p]}]).pending.length,0);});

test('board chunks retain individual records and manifest separates them',()=>{const {splitBoard}=require('../scripts/pickfinder-public-runner.cjs');const x=splitBoard({book:'prizepicks',sport:'nba',sourceDigest:'a',offers:[{line:1}],researchObservations:[],unpricedTierObservations:[],sportsbookQuotes:[]});assert.equal(x.parts.length,1);assert.equal(x.parts[0].rows.length,1);assert.equal(x.meta.offers,undefined);});

test('exact shared detail scopes deduplicate across books but preserve line and context',()=>{const offer={player:'Fixture',detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A5',market:'points',eventId:'e'};const a={book:'prizepicks',sport:'nba',offers:[offer]},b={book:'underdog',sport:'nba',offers:[offer,{...offer,detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A6'},{...offer,period:'1st_half'}]};const q=queue([a,b],[]);assert.equal(q.total,3);assert.equal(q.sharedAcrossBooks,1);const shared=q.pending.find(x=>x.books.length===2);assert.deepEqual(shared.books,['prizepicks','underdog']);const p=publicProfile({...shared,research:[{origin:'profile',metric:'row 1',scope:'Stats',value:'5'}],profileCollection:{truncated:false}});assert.equal(p.bookCoverageVerified,false);assert.equal(queue([a,b],[{records:[p]}]).pending.length,2);});

test('scheduled provenance must match an independently verified successful actual-hour workflow attempt',()=>{
 const {captureOrigin}=require('../scripts/pickfinder-public-runner.cjs'),{scheduledRunMatches}=require('../scripts/pickfinder-public-morning-audit.cjs');
 const env={GITHUB_EVENT_NAME:'schedule',GITHUB_EVENT_SCHEDULE:'7 6 * * *',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40)};
 const p={expected:'06:00'},o=captureOrigin(env,p),day='2026-11-25',slot='06:00',first='2026-11-25T14:20:00Z';
 const run={id:123,run_attempt:1,event:'schedule',head_sha:env.GITHUB_SHA,head_branch:'main',repository:{full_name:'Thedarkwillow/nhl-betting-platform1'},path:'.github/workflows/pickfinder-premium-hosted.yml',status:'completed',conclusion:'success',run_started_at:'2026-11-25T14:07:00Z'};
 assert.equal(scheduledRunMatches(o,run,day,slot,first),true);
 assert.equal(scheduledRunMatches(o,{...run,event:'workflow_dispatch'},day,slot,first),false);
 assert.equal(scheduledRunMatches(o,{...run,run_started_at:'2026-11-25T17:07:00Z'},day,slot,first),false);
 assert.equal(scheduledRunMatches(o,{...run,conclusion:'failure'},day,slot,first),false);
 assert.equal(scheduledRunMatches(o,{...run,run_attempt:2},day,slot,first),false);
 assert.equal(captureOrigin({...env,GITHUB_RUN_ID:'bad'},p),null);
 assert.equal(captureOrigin(env,{expected:'09:00'}),null);
 assert.equal(scheduledRunMatches(null,run,day,slot,first),false);
});
