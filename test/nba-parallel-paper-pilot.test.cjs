'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{build,PIN}=require('../scripts/nba-parallel-paper-pilot.cjs');
test('parallel pilot fails closed without fresh prior evidence and does not certify original platform',()=>{
 const now='2026-11-25T12:20:00Z',old='2026-11-25T12:00:00Z',proof={first:old},board={doc:{kind:'nba_private_partner_board_v1',capturedAt:old,completePagination:true},proof},schedule={doc:{kind:'nba_official_schedule_v1',capturedAt:old},proof};
 const args={core:{indexHistory:()=>({}),board:()=>[],rankings:()=>[{researchOnly:true,sourceObservedAt:old,gameStartAt:'2026-11-25T20:00:00Z',rawSelectedEstimate:.6}]},board,schedule,histories:Array.from({length:4},()=>({doc:{capturedAt:old,rows:[]},proof})),now,revision:PIN,tree:'a'.repeat(40)};
 assert.equal(build({...args,board:null}).state,'no_fresh_partner_board');assert.equal(build({...args,histories:[]}).state,'prior_history_not_verified');
 const x=build(args);assert.equal(x.rows.length,1);assert.equal(x.originalAppAvailabilityVerified,false);assert.equal(x.formalUntouchedCohort,false);assert.equal(x.actualWagersPlaced,0);
});
