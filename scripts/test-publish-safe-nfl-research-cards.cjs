"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sanitize}=require("./publish-safe-nfl-research-cards.cjs");
const at="2026-11-14T20:00:00Z",start="2026-11-15T18:00:00Z",now="2026-11-14T20:05:00Z";
function fixture(n=15){
 const rows=Array.from({length:n},(_,i)=>({sourceProjectionId:"pp_"+i,historicalPlayerId:"secret_"+i,gameId:"g_"+i,
 player:"Player "+i,team:"BUF",opponent:"NYJ",market:"passing_yards",line:200.5,side:"Higher",tier:"Standard",projection:220,
 probabilities:{higher:.7,lower:.3,push:0},probability:.7,priorGames:10,capturedAt:at,observedAt:at,eventStartsAt:start,
 conditionalOnPlaying:true,calibrated:false,researchOnly:true,autoPickEligible:false,originalPlatformSettlementVerified:false}));
 const board={provider:"prizepicksapi.com",league:"NFL",scope:"standard_full_game_replay",snapshotMode:"immutable_as_of",
 completePagination:true,sourceStatus:"fresh",fullNFLBoardVerified:false,generatedAt:at,boardAsOfAt:at,
 offers:rows.map(p=>({id:p.sourceProjectionId,league:"NFL",source:"prizepicks",status:"active",line:p.line,observed_at:at,
 player:{name:p.player,team:p.team},event:{opponent:p.opponent,starts_at:start},selections:[{tier:"standard",side:"more",available:true}]}))};
 const preview={kind:"nfl_independent_standard_research_preview_v1",boardAt:at,generatedAt:at,
 completeScopedPagination:true,fullNFLBoardVerified:false,calibrated:false,researchOnly:true,autoPickEligible:false,publicReleaseApproved:false,
 rows,sourceOffers:n,matchedRows:n};
 return {board,preview};
}
test("limited derived cards never expose private IDs, raw rows or payout values",()=>{
 const {board,preview}=fixture();const r=sanitize(board,preview,now);assert.equal(r.cards.length,12);
 assert.equal(r.calibrated,false);assert.equal(r.conditionalOnPlaying,true);
 const json=JSON.stringify(r);for(const k of ["secret_","pp_","historicalPlayerId","sourceProjectionId","probabilities","offers"])assert.ok(!json.includes(k));
});
test("stale, incomplete and substituted offers fail closed",()=>{
 const {board,preview}=fixture(1);
 assert.equal(sanitize(board,preview,"2026-11-14T21:00:00Z").cards.length,0);
 assert.equal(sanitize({...board,completePagination:false},preview,now).cards.length,0);
 preview.rows[0].line=900;assert.equal(sanitize(board,preview,now).cards.length,0);
});
