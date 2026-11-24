"use strict";const {test}=require("node:test"),assert=require("node:assert/strict"),{review}=require("../src/nhl-official-preview-abstention.cjs");
const at="2026-11-16T22:00:00Z",start="2026-11-17T00:30:00Z",p={gameId:2026020331,playerId:8476981,team:"MTL",opponent:"NYR",eventStartsAt:start};
const source={kind:"nhl_league_published_pregame_status_v1",capturedAt:"2026-11-16T21:50:00Z",sources:[{gameId:2026020331,url:"https://www.nhl.com/news/example"}],
 rows:[{gameId:2026020331,playerId:8476981,team:"MTL",eventStartsAt:start,reportedAt:"2026-11-16T17:32:25Z",status:"injured"}]};
test("known pregame injured player is explicitly blocked",()=>{const x=review(p,source,at);assert.equal(x.status,"injured");assert.equal(x.blocksResearch,true);assert.equal(x.activeParticipationVerified,false)});
test("missing player, stale source, wrong team or future source never implies clearance",()=>{
 for(const v of [{...p,playerId:777},{...p,team:"NYR",opponent:"MTL"}]){const x=review(v,source,at);assert.equal(x.blocksResearch,false);assert.equal(x.activeParticipationVerified,false);}
 assert.equal(review(p,{...source,capturedAt:"2026-11-16T16:00:00Z"},at).status,"unverified");
 assert.equal(review(p,{...source,capturedAt:"2026-11-16T23:00:00Z"},at).status,"unverified");
});
test("conflicting duplicate rows block rather than arbitrary resolution",()=>{const x=review(p,{...source,rows:[...source.rows,source.rows[0]]},at);assert.equal(x.status,"ambiguous");assert.equal(x.blocksResearch,true)});
