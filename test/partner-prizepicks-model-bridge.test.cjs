"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildFreeNhlResearch}=require("../src/free-nhl-research.cjs");
const time="2026-11-08T15:32:00Z",sample={
 player:"Alex Skater",team:"BOS",matchup:"FLA",market:"Shots On Goal",
 line:2.5,period:"Full game",tier:"Standard",side:"Higher",
 eventStartsAt:"2026-11-08T18:00:00Z",capturedAt:"2026-11-08T15:30:57Z",
 observedAt:"2026-11-07T14:00:00Z",isLive:false,projectionId:"pp-168"
};
const projections={builtAt:"2026-11-08T09:39:00Z",model:"weighted-form-v1",
 players:{"1":{name:"A. Skater",team:"BOS",playerId:1,latestGameDate:"2026-11-07",
 projections:{shotsOnGoal:{ready:true,estimate:3.4,observations:8,last5:3,last10:3.2}}}}};
const board={provider:"partner-api.prizepicks.com",snapshotMode:"direct_live_board",
 sourceStatus:"fresh",completePagination:true,sourceScope:"full_provider_board",
 generatedAt:"2026-11-08T15:30:57Z",boardAsOfAt:"2026-11-08T15:30:57Z",rows:[sample]};
test("Direct partner complete actual-time membership allows genuine unchanged older lines",()=>{
 const result=buildFreeNhlResearch(board,projections,time);
 assert.equal(result.matchedRows,1);
 assert.equal(result.rankedProps[0].provider,"partner-api.prizepicks.com");
 assert.equal(result.rankedProps[0].originalFantasyPlatformAuthenticated,false);
 assert.equal(result.rankedProps[0].verifiedThirdPartyBoardMembershipAt,board.boardAsOfAt);
 assert.equal(result.rankedProps[0].expectedValue,null);
 assert.equal(result.source,"partner-api.prizepicks.com");
});
test("Incomplete membership or unsupported partner mode may not waive line-change recency",()=>{
 const denied=buildFreeNhlResearch({...board,completePagination:false},projections,time);
 assert.equal(denied.matchedRows,0);
 assert.equal(denied.excluded.stale_or_invalid_capture,1);
 const wrong=buildFreeNhlResearch({...board,snapshotMode:"unverified"},projections,time);
 assert.equal(wrong.matchedRows,0);
 assert.equal(wrong.excluded.stale_or_invalid_capture,1);
});
test("Archived source older than 30 minutes cannot be live model research",()=>{
 const result=buildFreeNhlResearch(board,projections,"2026-11-08T16:04:00Z");
 assert.equal(result.matchedRows,0);
 assert.equal(result.boardFresh,false);
});
