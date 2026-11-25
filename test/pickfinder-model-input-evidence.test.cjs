'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{audit}=require('../scripts/pickfinder-model-input-evidence.cjs');
test('actual model comparison requires exact reviewed identity, archived before forecast, explicit two-sided line',()=>{
 const at='2026-11-25T12:00:00Z',before='2026-11-25T11:59:00Z';
 const row={sport:'nba',detailId:'/players/a',eventId:'e',market:'points',observedAt:before,sportsbookEvidence:[{book:'draftkings',displayedBookLabel:'DraftKings',prices:[{side:'Higher',price:'-110',quoteLine:5.5},{side:'Lower',price:'-110',quoteLine:5.5}]}]};
 const p={playerId:1,gameId:2,market:'points',line:5.5,gameStartAt:'2026-11-25T18:00:00Z',offeredSide:'Higher',rawSelectedEstimate:.6,tier:'Standard'};
 const x={sport:'nba',nativePlayerId:1,nativeEventId:2,sourceDetailId:row.detailId,sourceEventId:'e',sourceMarket:'points',nativeMarket:'points',independentReviewVerified:true,verifiedAt:before,first:before};
 const input={batches:[{first:before,doc:{sport:'nba',pages:[{rows:[row]}]}}],reviewed:[x],pilots:[{commit:'fixture',doc:{generatedAt:at,rows:[p]}}]};
 assert.equal(audit(input).summary.joinedActualModelRows,1);assert.equal(audit({...input,reviewed:[]}).summary.joinedActualModelRows,0);
 assert.equal(audit({...input,batches:[{...input.batches[0],first:'2026-11-25T12:01:00Z'}]}).summary.joinedActualModelRows,0);
});
