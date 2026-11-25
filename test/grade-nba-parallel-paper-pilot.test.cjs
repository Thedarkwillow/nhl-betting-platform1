'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{grade}=require('../scripts/grade-nba-parallel-paper-pilot.cjs'),{PIN}=require('../scripts/nba-parallel-paper-pilot.cjs');
test('conditional pilot grade uses frozen chronology and independently observed official stat',()=>{
 const start='2026-11-25T20:00:00Z',at='2026-11-25T12:00:00Z',now='2026-11-26T02:00:00Z';
 const p={gameId:1,playerId:2,team:'BOS',gameStartAt:start,researchOnly:true,sourceObservedAt:at,line:5.5,market:'points',tier:'Standard',offeredSide:'Higher',rawSelectedEstimate:.6};
 const f={commit:'fixture',first:at,doc:{kind:'nba_parallel_conditional_pilot_v1',modelRevision:PIN,researchOnly:true,formalUntouchedCohort:false,originalAppAvailabilityVerified:false,actualWagersPlaced:0,generatedAt:at,boardCapturedAt:at,rows:[p]}};
 const final=new Map([[1,new Map([[2,{gameId:1,playerId:2,team:'BOS',officialGameFinalVerified:true,identityVerified:true,appeared:true,points:6}]])]]);
 assert.equal(grade(f,final,now)[0].status,'correct');assert.equal(grade(f,new Map(),now)[0].status,'pending');assert.equal(grade({...f,first:'2026-11-25T19:50:00Z'},final,now).length,0);
});
