"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {identifyGame}=require("../src/nhl-game-identity.cjs");
const p={team:"NYR",matchup:"vs EDM",capturedAt:"2026-11-01T17:00:00Z"};
const g={id:123,away:"EDM",home:"NYR",startTimeUTC:"2026-11-01T23:00:00Z"};
test("matches only unique pregame scheduled game",()=>{
 assert.deepEqual(identifyGame(p,[g]),{gameId:123,gameStartAt:g.startTimeUTC});
 assert.equal(identifyGame(p,[g,{...g,id:124}]),null);
 assert.equal(identifyGame({...p,capturedAt:"2026-11-02T00:00:00Z"},[g]),null);
 assert.equal(identifyGame({...p,matchup:"vs LAK"},[g]),null);
});

test("matches independent free-feed opponent labels with official NHL abbreviations",()=>{
 const game={id:2026020230,away:"CGY",home:"SJS",startTimeUTC:"2026-11-03T02:00:00Z"};
 const prop={team:"SJ",opponent:"CGY",matchup:"CGY vs SJ | 2026-11-03T02:00:00Z",capturedAt:"2026-11-02T02:00:00Z"};
 assert.deepEqual(identifyGame(prop,[game]),{gameId:game.id,gameStartAt:game.startTimeUTC});
});
