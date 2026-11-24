"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {box,offer,readiness}=require("../src/nba-phase-zero-contract.cjs");
const final={source:"NBA official box score",gameId:22500001,playerId:202000,
 team:"NYK",gameStartAt:"2026-11-19T00:00:00Z",finalAt:"2026-11-19T03:00:00Z",
 firstCapturedAt:"2026-11-19T03:05:00Z",officialGameFinalVerified:true,
 identityVerified:true,appeared:true,minutes:32.1,points:17,rebounds:8,
 assists:3,threePointersMade:2,steals:1,blocks:0,turnovers:2,
 commercialRedistributionLicenseVerified:false};
const observed={platform:"PrizePicks",sourceOfferId:"a123",gameId:22500002,
 playerId:202000,tier:"Standard",market:"points",period:"full_game",offeredSide:"Higher",
 line:17.5,sourceObservedAt:"2026-11-20T22:00:00Z",
 gameStartAt:"2026-11-21T02:00:00Z",originalBoardPageComplete:true,
 playerIdentityVerified:true,gameIdentityVerified:true,
 originalAppCryptographicVerification:false,commercialRedistributionLicenseVerified:false};
const now="2026-11-20T22:10:00Z";
test("NBA official final appearing box requires minutes plus nonnegative complete component stats",()=>{
 assert.equal(box(final).officialStatGradingAllowed,true);
 assert.equal(box({...final,assists:null}).usable,false);
 assert.equal(box({...final,minutes:0}).usable,false);
 assert.equal(box({...final,finalAt:final.gameStartAt}).usable,false);
 assert.equal(box({...final,commercialRedistributionLicenseVerified:true}).publicDisplayApproved,false);
});
test("NBA DNP never counted as a zero-stat miss and missing row never inferred",()=>{
 const d={...final,appeared:false,didNotPlayVerified:true,minutes:null,
  points:null,rebounds:null,assists:null,threePointersMade:null,steals:null,blocks:null,turnovers:null};
 assert.equal(box(d).countsAsAppearance,false);
 assert.equal(box(d).reason,"official_nonappearance_void_pending_platform");
 assert.equal(box({...d,didNotPlayVerified:false}).usable,false);
 assert.equal(box({...final,appeared:false}).officialStatGradingAllowed,false);
});
test("NBA source tier period side and pregame clock never imply payout or a pick",()=>{
 assert.equal(offer(observed,now).validForResearch,true);
 assert.equal(offer(observed,now).bettingEligible,false);
 assert.equal(offer({...observed,originalAppCryptographicVerification:true},now).appOfferAuthenticated,false);
 for(const patch of [{period:"1H"},{tier:"unknown"},{market:"fantasyScore"},
  {offeredSide:"Both"},{sourceObservedAt:"2026-11-20T20:00:00Z"},
  {sourceOfferId:null},{playerIdentityVerified:false}]){
  assert.equal(offer({...observed,...patch},now).validForResearch,false);
 }
 const x=readiness({officialFinals:[final],board:[observed],now});
 assert.equal(x.nbaModelsTrained,false);
 assert.equal(x.originalCurrentResearchOffers,1);
 assert.equal(x.lineupReleaseApproved,false);
});
