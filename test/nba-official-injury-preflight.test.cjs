"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {assess,count}=require("../src/nba-official-injury-preflight.cjs");
const now="2026-11-20T23:20:00Z";
const row={source:"NBA official injury report",
 sourceDocumentUrl:"https://official.nba.com/nba-injury-report-2026-27-season/",
 gameId:22600299,playerId:1630117,team:"NYK",opponent:"BOS",status:"Out",
 reportPublishedAt:"2026-11-20T22:00:00Z",capturedAt:"2026-11-20T22:10:00Z",
 firstGitCommittedAt:"2026-11-20T22:11:00Z",gameStartAt:"2026-11-21T02:00:00Z"};
test("official-attributed out and questionable reports block, even with proper first-Git clocks",()=>{
 const r=assess(row,{now});
 assert.equal(r.usable,true);assert.equal(r.mayBeUnavailable,true);
 assert.equal(r.positiveActiveParticipationVerified,false);
 assert.equal(r.claimedGitClockSequenceConsistent,true);
 assert.equal(r.independentGitCommitProvenanceVerified,false);
 assert.equal(r.bettingEligible,false);
 assert.equal(assess({...row,status:"Questionable"},{now}).mayBeUnavailable,true);
});
test("reported available is not actual game-day participation verification",()=>{
 const r=assess({...row,status:"Available"},{now});
 assert.equal(r.usable,true);assert.equal(r.mayBeUnavailable,false);
 assert.equal(r.positiveActiveParticipationVerified,false);
 assert.equal(r.officialIdentityIndependentlyAuthenticated,false);
 assert.equal(r.bettingEligible,false);
});
test("no stale, post-tip, nonofficial, uncommitted, conflicting identity or invalid timeline inference",()=>{
 const changes=[
  {sourceDocumentUrl:"https://other.example.com/nba.pdf"},
  {firstGitCommittedAt:"2026-11-20T22:00:00Z"},
  {firstGitCommittedAt:"2026-11-21T03:00:00Z"},
  {capturedAt:"2026-11-19T17:00:00Z"},
  {capturedAt:"2026-11-20T23:30:00Z"},
  {gameStartAt:"2026-11-20T23:25:00Z"},
  {playerId:null},{gameId:0},{status:"Playing"},
  {source:"secondhand tweet"}
 ];
 for(const patch of changes)assert.equal(assess({...row,...patch},{now}).usable,false,JSON.stringify(patch));
 const summary=count([row,{...row,status:"Available"},{...row,source:"unknown"}],now);
 assert.equal(summary.usable,2);assert.equal(summary.atRisk,1);
 assert.equal(summary.unverified,1);assert.equal(summary.officiallyConfirmedActive,0);
});
