'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classify,auditProfiles,auditBoards}=require('../scripts/pickfinder-archived-model-inputs.cjs');
const clock='2026-11-25T22:00:00Z',observedAt='2026-11-25T20:00:00Z';
test('profile categories remain observed evidence and reject future fields',()=>{
 const fields=[{origin:'prop_history',observedAt},{origin:'line_movement',observedAt},{origin:'profile',tab:'Game Logs',observedAt},{origin:'profile',tab:'Injuries',observedAt},{origin:'profile',tab:'Opponent splits',observedAt},{origin:'profile',tab:'Map statistics',observedAt},{origin:'profile',observedAt:'2026-11-26T00:00:00Z'}];
 const r=auditProfiles([{digest:'fixture',doc:{records:[{sport:'nba',research:fields}]}}],clock).summary;
 assert.equal(r.fields,7);assert.equal(r.invalid,1);assert.equal(r.bySport.nba.observed.historical_prop,1);assert.equal(r.bySport.nba.observed.game_logs,1);assert.equal(r.bySport.nba.observed.availability_workload,1);assert.equal(r.bySport.nba.observed.matchup_splits,1);assert.equal(r.bySport.nba.observed.esports_scope,1);assert.equal(r.usableCacheKeys,0);
});
test('historical odds require exact threshold and pre-archive clock',()=>{
 const o={sport:'nba',book:'prizepicks',detailId:'p',eventId:'e',market:'points',line:20.5,side:'Higher',tier:'standard',observedAt,startAt:'2026-11-25T23:00:00Z'};
 const q={...o,book:'draftkings',quoteLine:20.5,price:'-110'};
 const b={m:{sport:'nba'},first:'2026-11-25T20:01:00Z',digest:'fixture',offers:[o,o],sportsbookQuotes:[q,{...q,side:'Lower'}],researchObservations:[]};
 const r=auditBoards({manifests:[b]},clock);
 assert.equal(r.summary.distinctObservations,1);assert.equal(r.summary.quoteMatches,2);assert.equal([...r.history.values()][0].quotes[0].higher,.5);assert.equal([...r.history.values()][0].modelApproved,false);
 assert.equal(auditBoards({manifests:[{...b,sportsbookQuotes:[q,{...q,side:'Lower',quoteLine:21.5}]}]},clock).summary.quoteMatches,0);
 assert.equal(auditBoards({manifests:[{...b,first:'2026-11-26T00:00:00Z'}]},clock).summary.observations,0);
});
