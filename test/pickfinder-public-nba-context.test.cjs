'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{queue,normalize}=require('../scripts/pickfinder-public-nba-context.cjs');
const at='2026-11-25T15:10:00Z',start='2026-11-25T23:00:00Z';
const o={sport:'nba',player:'Fixture',eventId:'e',market:'player_points',detailId:'/players/nba/abc?prop=x%3Aplayer_points%3Ae%3A5'};
const archive={latest:[{offers:[o,{...o,detailId:o.detailId.replace(/5$/,'6')}]},{offers:[o]}]};
test('deduplicates player event across lines and books',()=>{const q=queue(archive,[],at);assert.equal(q.total,1);assert.equal(q.offerReferences,3);assert.equal(q.pending.length,1)});
test('explicit context only with labeled player route, distinct teams and timezone-aware future game clock',()=>{const target=queue(archive,[],at).pending[0];const s={routeVerified:true,playerLabelVerified:true,entries:[{label:'Team',value:'BOS'},{label:'Opponent',value:'NYK'}],clocks:[{label:'Game start',value:start}]};const x=normalize(target,s,at);assert.equal(x.state,'explicit_context_observed');assert.equal(x.independentReviewVerified,false);assert.equal(queue(archive,[{schema:'pickfinder-public-nba-context-v1',records:[x]}],at).pending.length,0);assert.equal(normalize(target,{...s,clocks:[{label:'Game start',value:'7:00 PM'}]},at).state,'context_incomplete');assert.equal(normalize(target,{...s,playerLabelVerified:false},at).state,'context_incomplete')});
test('conflicting clocks and labels remain incomplete',()=>{const t=queue(archive,[],at).pending[0];assert.equal(normalize(t,{routeVerified:true,playerLabelVerified:true,entries:[{label:'Team',value:'BOS'},{label:'Team',value:'NYK'},{label:'Opponent',value:'PHI'}],clocks:[{label:'Game time',value:start}]},at).state,'context_incomplete')});

test('archived local clock is preserved but never promoted to UTC',()=>{
 const target=queue(archive,[],at).pending[0];
 const snap={routeVerified:true,playerLabelVerified:true,entries:[{label:'Team',value:'BOS'},{label:'Opponent',value:'NYK'},{label:'Matchup',value:'BOS @ NYK • Thu @ 12:00AM'}],clocks:[]};
 const x=normalize(target,snap,at);
 assert.equal(x.state,'context_incomplete');assert.equal(x.startAt,null);
 assert.equal(x.clockEvidenceState,'local_clock_zone_unverified');
 assert.deepEqual(x.localMatchup,{team:'BOS',opponent:'NYK',homeAway:'away',weekday:'Thu',hour:12,minute:0,dayPeriod:'AM'});
 assert.equal(normalize(target,{...snap,entries:[...snap.entries,{label:'Matchup',value:'BOS vs NYK • Wed @ 7:00PM'}]},at).localMatchup,null);
});

test('browser timezone evidence never verifies provider clock or changes context eligibility',()=>{
 const target=queue(archive,[],at).pending[0];const snap={routeVerified:true,playerLabelVerified:true,entries:[{label:'Team',value:'BOS'},{label:'Opponent',value:'NYK'},{label:'Matchup',value:'BOS @ NYK • Thu @ 12:00AM'}],clocks:[],browserClock:{zone:'UTC',offsetMinutes:0}};
 const x=normalize(target,snap,at);assert.deepEqual(x.browserClock,{zone:'UTC',offsetMinutes:0,providerDisplayZoneVerified:false});assert.equal(x.startAt,null);assert.equal(x.state,'context_incomplete');assert.equal(normalize(target,{...snap,browserClock:{zone:'not-a-zone',offsetMinutes:0}},at).browserClock,null);
});

test('defers a confirmed missing-clock profile read only against unchanged recent board evidence',()=>{
 const boardAt='2026-11-25T15:01:00Z',attemptAt='2026-11-25T15:04:00Z';
 const a={latest:[{m:{lastObservedAt:boardAt},offers:[o]}]};
 const item=queue(a,[],at).pending[0];
 const read=normalize(item,{routeVerified:true,playerLabelVerified:true},attemptAt);
 const q=(archive,record=read,clock=at)=>queue(archive,[{schema:'pickfinder-public-nba-context-v1',records:[record]}],clock);
 assert.equal(q(a).pending.length,0);
 assert.equal(q(a).deferredUnchangedContext,1);
 assert.equal(q({latest:[...a.latest,{m:{lastObservedAt:'2026-11-25T15:05:00Z'},offers:[o]}]}).pending.length,1);
 assert.equal(q(archive).pending.length,1);
 assert.equal(q(a,{...read,routeVerified:false}).pending.length,1);
 assert.equal(q(a,{...read,playerLabelVerified:false}).pending.length,1);
 assert.equal(q(a,{...read,detailId:read.detailId.replace(/5$/,'6')}).pending.length,1);
 assert.equal(q(a,{...read,observedAt:'2026-11-25T15:11:00Z'}).pending.length,1);
 assert.equal(q(a,read,'2026-11-25T21:04:00Z').pending.length,1);
});
