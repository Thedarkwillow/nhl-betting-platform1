'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const {ZONES,select,clockAt,classify,observe}=require('../scripts/pickfinder-controlled-clock.cjs');
const {invocation}=require('../scripts/pickfinder-public-runner.cjs');
const at='2026-11-25T15:00:00Z',startAt='2026-11-26T01:00:00Z';
const native={sport:'nba',providerEventId:'e',nativeEventId:'official-e',source:'fixture',independentReviewVerified:true,team:'BOS',opponent:'NYK',homeAway:'away',startAt};
const records=ZONES.map(z=>({sport:'nba',eventId:'e',player:'Fixture',playerPath:'/players/nba/a',detailId:'/players/nba/a?prop=x',routeVerified:true,playerLabelVerified:true,team:'BOS',opponent:'NYK',requestedZone:z,browserClock:{zone:z},localMatchup:{...clockAt(startAt,z),homeAway:'away'},observedAt:at}));
test('browser timezone shift and fixed clock require independently matched native event',()=>{
 a.equal(classify(records,native),'browser_local_matches_schedule');
 a.equal(classify(records,null),'independent_schedule_required');
 a.equal(classify(records,{...native,providerEventId:'other'}),'independent_schedule_required');
 a.equal(classify(records.map(r=>({...r,localMatchup:{...clockAt(startAt,'UTC'),homeAway:'away'}})),native),'fixed_clock_candidate:UTC');
 a.equal(classify(records.slice(0,2),native),'incomplete');
 a.equal(classify(records.map(r=>({...r,browserClock:{zone:'UTC'}})),native),'ambiguous');
 a.equal(classify(records.map(r=>({...r,displayedClocks:[{}],startAt:'2026-11-26T02:00:00Z'})),native),'conflicting_explicit_clock');
});
test('DST and midnight rollover use event date, not observation offset',()=>{
 a.equal(clockAt(startAt,'UTC').weekday,'Thu');a.equal(clockAt(startAt,'America/Los_Angeles').weekday,'Wed');
 a.equal(clockAt('2026-07-01T20:00:00Z','America/Los_Angeles').hour,1);
 a.equal(clockAt('2026-12-01T20:00:00Z','America/Los_Angeles').hour,12);
});
test('bounded distinct event sampling across three sports',()=>{
 const offers=['nba','nhl','nfl'].flatMap(sport=>Array.from({length:6},(_,i)=>({sport,player:'Fixture '+i,eventId:'e'+i,market:'points',detailId:'/players/'+sport+'/a'+i+'?prop=x%3Apoints%3Ae'+i+'%3A5'})));
 const targets=select({latest:[{offers}]},at);a.equal(targets.length,9);
 for(const sport of ['nba','nhl','nfl'])a.equal(targets.filter(x=>x.sport===sport).length,3);
});
test('manual mode protects morning hours',()=>{
 const env={PICKFINDER_AUTOMATION_AUTHORIZED:'1',PICKFINDER_PUBLIC_DATA_AUTHORIZED:'1',GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'timezone_validation'};
 a.equal(invocation(env,new Date('2026-11-25T20:00:00Z')).timezoneOnly,true);
 for(const h of [13,14,16,17])a.equal(invocation(env,new Date('2026-11-25T'+h+':00:00Z')).allowed,false);
 a.throws(()=>invocation({...env,GITHUB_EVENT_NAME:'push'},new Date(at)));
});
test('observation archives each requested zone separately and never qualifies',async()=>{
 const targets=[{sport:'nba',eventId:'e',player:'Fixture',playerPath:'/players/nba/a',detailId:'/players/nba/a?prop=x'}],out=[],opened=[],closed=[];
 const r=await observe({targets,alive:()=>true,origin:'https://www.pickfinder.app',premium:async()=>true,write:async x=>out.push(x),open:async zone=>{opened.push(zone);return {context:{close:async()=>closed.push(zone)},page:{goto:async()=>{},getByRole:()=>({waitFor:async()=>{}}),getByText:()=>({first:()=>({waitFor:async()=>{}})}),evaluate:async()=>({routeVerified:true,playerLabelVerified:true,browserClock:{zone,offsetMinutes:0},entries:[],clocks:[]})}}}});
 a.deepEqual(opened,ZONES);a.deepEqual(closed,ZONES);a.equal(out.length,3);a.equal(r.fullDesign,false);a.ok(out.every(x=>!x.modelInputsApproved&&!x.providerDisplayZoneVerified));
});
