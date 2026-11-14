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

test("alternate cards are capped and Higher-only, even for a sub-half estimate",()=>{
 const {board,preview}=fixture();
 for(const tier of ["goblin","demon"]){
  const tierName=tier[0].toUpperCase()+tier.slice(1);
  const b={...board,requestedTier:tier,scope:tier+"_full_game_replay",offers:board.offers.map(o=>({...o,selections:[{tier,side:"more",available:true},{tier,side:"less",available:true}]}))};
  const r={...preview,requestedTier:tier,kind:"nfl_independent_alternate_research_preview_v1",rows:preview.rows.map(o=>({...o,tier:tierName,probability:.4,probabilities:{higher:.4,lower:.6,push:0}}))};
  assert.equal(sanitize(b,r,now,tier).cards.length,4);
  assert.equal(sanitize(b,r,now).cards.length,0);
  r.rows=r.rows.map(o=>({...o,side:"Lower",probability:.6}));assert.equal(sanitize(b,r,now,tier).cards.length,0);
 }
});

test("newly reported availability risk suppresses a previously frozen card without changing its record",()=>{
 const {board,preview}=fixture(2);
 const r=sanitize(board,preview,now,"standard",p=>p.historicalPlayerId==="secret_0");
 assert.equal(r.cards.length,1);assert.equal(r.cards[0].player,"Player 1");
 assert.equal(preview.rows.length,2);
});
