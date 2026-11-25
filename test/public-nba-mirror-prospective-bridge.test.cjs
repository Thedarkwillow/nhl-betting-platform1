'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{choose}=require('../scripts/public-nba-mirror-prospective-bridge.cjs');
const clock='2026-11-25T14:00:00Z',start='2026-11-25T23:00:00Z';
const rows=Array.from({length:20},(_,i)=>({gameId:22400001+i,playerId:7,player:'Fixture',gameDate:'2026-11-'+String(i+1).padStart(2,'0'),team:'BOS',opponent:'NYK',home:true,wl:'W',minutes:30,points:20,rebounds:5,assists:4,threePointersMade:2,steals:1,blocks:0,turnovers:2,pointsReboundsAssists:29,pointsRebounds:25,pointsAssists:24,reboundsAssists:9}));
const input={archive:{invalid:[],latest:[]},historyRows:rows,reviewRows:[],schedule:{kind:'nba_official_schedule_v1',capturedAt:'2026-11-25T13:50:00Z',games:[{gameId:1,startAt:start,home:'BOS',away:'NYK',status:1}]},clock,revision:'a'.repeat(40),digests:Array(4).fill('b'.repeat(64))};
test('no reviewed identity, no forecast',()=>{assert.equal(choose(input).reason,'no_independently_reviewed_crosswalk');assert.equal(choose(input).rows.length,0)});
test('stale schedule rejected',()=>assert.equal(choose({...input,schedule:{...input.schedule,capturedAt:'2026-11-25T12:00:00Z'}}).reason,'no_fresh_committed_official_schedule'));
test('invalid manifest or missing source digest fails closed',()=>{assert.throws(()=>choose({...input,archive:{invalid:['bad'],latest:[]}}));assert.throws(()=>choose({...input,digests:[]}))});
