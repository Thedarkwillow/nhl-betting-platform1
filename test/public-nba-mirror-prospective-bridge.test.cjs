'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{choose}=require('../scripts/public-nba-mirror-prospective-bridge.cjs');
const clock='2026-11-25T14:00:00Z',start='2026-11-25T23:00:00Z';
const rows=Array.from({length:20},(_,i)=>({gameId:22400001+i,playerId:7,player:'Fixture',gameDate:'2026-11-'+String(i+1).padStart(2,'0'),team:'BOS',opponent:'NYK',home:true,wl:'W',minutes:30,points:20,rebounds:5,assists:4,threePointersMade:2,steals:1,blocks:0,turnovers:2,pointsReboundsAssists:29,pointsRebounds:25,pointsAssists:24,reboundsAssists:9}));
const input={archive:{invalid:[],latest:[]},historyRows:rows,reviewRows:[],schedule:{kind:'nba_official_schedule_v1',capturedAt:'2026-11-25T13:50:00Z',games:[{gameId:1,startAt:start,home:'BOS',away:'NYK',status:1}]},clock,revision:'a'.repeat(40),digests:Array(4).fill('b'.repeat(64))};
test('no reviewed identity, no forecast',()=>{assert.equal(choose(input).reason,'no_independently_reviewed_crosswalk');assert.equal(choose(input).rows.length,0)});
test('stale schedule rejected',()=>assert.equal(choose({...input,schedule:{...input.schedule,capturedAt:'2026-11-25T12:00:00Z'}}).reason,'no_fresh_committed_official_schedule'));
test('invalid manifest or missing source digest fails closed',()=>{assert.throws(()=>choose({...input,archive:{invalid:['bad'],latest:[]}}));assert.throws(()=>choose({...input,digests:[]}))});

test('review receipt derives exact full-game scope but cannot supply missing board clock',()=>{
 const {reviewedScopes}=require('../scripts/public-nba-mirror-prospective-bridge.cjs');
 const eventId='pf1',playerPath='/players/nba/p1',detailId=playerPath+'?prop=abc%3Aplayer_points%3Apf1%3A20.5';
 const offer={sport:'nba',player:'Fixture',eventId,detailId,market:'player_points',line:20.5,side:'Higher',book:'prizepicks',observedAt:'2026-11-25T13:50:00Z',startAt:null};
 const game={eventId,sourceUrl:'https://www.pickfinder.app/game-lines?game=pf1',nbaGameId:'0000000001',espnGameId:'10',home:'BOS',away:'NYK',displayedClock:'Wed 11/25, 3:00 PM',observedAt:'2026-11-25T13:10:00Z',scheduleStartAt:start};
 const player={eventId,player:'Fixture',playerPath,sourceUrl:'https://www.pickfinder.app'+detailId,nbaPlayerId:'7',espnPlayerId:'8',team:'BOS',opponent:'NYK',displayedMatchup:'BOS vs NYK',independentRosterVerified:true,observedAt:'2026-11-25T13:11:00Z'};
 const doc={schema:'pickfinder-independent-nba-matchup-review-v1',clockComparisonZone:'America/Los_Angeles',games:[game],records:[player]};
 const receipt={doc,digest:'c'.repeat(64),commit:'d'.repeat(40),first:'2026-11-25T13:30:00Z'};
 const archive={invalid:[],latest:[{m:{sport:'nba',book:'prizepicks',health:{unresolvedRows:0},lastObservedAt:offer.observedAt},offers:[offer],unpricedTierObservations:[],sportsbookQuotes:[],researchObservations:[],first:receipt.first,digest:'e'.repeat(64)}]};
 const args={archive,schedule:input.schedule,clock,receipts:[receipt]};
 const derived=reviewedScopes(args);assert.equal(derived.length,1);assert.equal(derived[0].nativePlayerId,7);assert.equal(derived[0].identityEvidenceSha256,receipt.digest);
 assert.equal(reviewedScopes({...args,receipts:[{...receipt,doc:{...doc,records:[{...player,independentRosterVerified:false}]}}]}).length,0);
 assert.equal(reviewedScopes({...args,receipts:[receipt,{...receipt,doc:{...doc,records:[{...player,nbaPlayerId:'9'}]}}]}).length,0);
 assert.equal(reviewedScopes({...args,schedule:{...input.schedule,games:[{...input.schedule.games[0],startAt:'2026-11-25T23:30:00Z'}]}}).length,0);
 assert.equal(reviewedScopes({...args,explicit:derived}).length,0);
 assert.equal(choose({...input,archive,reviewRows:derived}).rows.length,0);
});
