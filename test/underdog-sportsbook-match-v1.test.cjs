"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{compare}=require("../src/underdog-sportsbook-match-v1.cjs");
test("bounded Underdog archive matches only explicit original name, club, full-game exact line and timely two-book evidence",()=>{
 const stamp="2026-11-25T00:00:00Z",start="2026-11-25T01:00:00Z",p={league:"NHL",gameId:2026020400,playerId:42,market:"saves",period:"full_game",side:"higher",line:24.5,observedAt:stamp,eventStartsAt:start,sourceOfferId:"offer",sourcePlayerId:"id",sourcePlayerName:"Test Goalie",sourceTeam:"SJS",sourceOpponent:"LAK",researchOnly:true,productionEligible:false,marketContractVerified:false,sourceIdentityVerified:false};
 const f={document:{kind:"private_underdog_bounded_candidate_observation_v1",generatedAt:stamp,productionEligible:false,completeBoardVerified:false,candidates:[p]},firstCommittedAt:stamp,gitHistoryCount:1};
 const q={sport:"NHL",source:"The Odds API",eventId:"e",homeTeam:"San Jose Sharks",awayTeam:"Los Angeles Kings",commenceTime:start,player:"Test Goalie",market:"saves",period:"full_game",line:24.5,marketUpdatedAt:stamp,capturedAt:stamp,overOdds:-110,underOdds:-110};
 const a={archive:{kind:"bounded_sportsbook_capture_v1",status:"fresh_bounded_archive",generatedAt:stamp,rows:[{...q,book:"draftkings"},{...q,book:"fanduel"}]},firstCommittedAt:stamp,gitHistoryCount:1};
 assert.equal(compare([f],[a]).bySport.NHL.matched,1);
 assert.equal(compare([f],[a]).sharedProviderIdentityVerified,false);
 p.line=25.5;assert.equal(compare([f],[a]).bySport.NHL.noUniqueQuote,1);p.line=24.5;delete p.sourcePlayerName;assert.equal(compare([f],[a]).bySport.NHL.missingOriginalIdentity,1);
});
