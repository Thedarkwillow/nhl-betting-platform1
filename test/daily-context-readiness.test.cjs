"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {roleCoverage,calibrationCoverage}=require("../src/daily-context-readiness.cjs");
const {study}=require("../src/nfl-position-matchup-ablation.cjs");
const now="2026-11-15T12:00:00Z";
test("role reports do not elevate projected or missing source evidence to verified clearance",()=>{
 const r=roleCoverage({usage:{summary:{withToi:100,goalies:20}},external:{generatedAt:"2026-11-15T10:00:00Z",injuries:[{}]},league:{capturedAt:"2026-11-15T13:00:00Z",rows:[{}]},approved:{generatedAt:"2026-11-15T11:45:00Z",dailyFaceoff:{lineTeams:12,goalieReports:8}}},now);
 assert.equal(r.officialHistoricalMinutes,100);assert.equal(r.externalInjury.rows,null);assert.equal(r.leaguePublished.state,"missing_or_invalid");assert.equal(r.projectedLineAndGoalie.teams,12);assert.equal(r.actualStartingLineupVerified,false);assert.equal(r.firstPartyMedicalClearanceVerified,false);
});
test("calibration groups are separated by tier and missing evidence is unavailable",()=>{
 assert.equal(calibrationCoverage(null).available,false);
 const r=calibrationCoverage({generatedAt:now,hierarchicalCalibration:{byMarketTierSide:{'["shotsOnGoal","full_game","Standard","Higher"]':{observed:100,matchedHeldout:10},'["shotsOnGoal","full_game","Goblin","Higher"]':{observed:50,matchedHeldout:0}}}});
 assert.equal(r.tiers.Standard.matchedHeldout,10);assert.equal(r.tiers.Goblin.observed,50);assert.equal(r.tiers.Demon.observed,0);assert.equal(r.approved,false);
});
test("NFL position backtest refuses empty and same-week-only evidence",()=>{
 const schedule=[{game_id:"g",season:2026,week:1,game_type:"REG",gameday:"2026-09-10",home_score:20,away_score:17,home_team:"A",away_team:"B"}];
 const players=Array.from({length:80},(_,i)=>({player_id:String(i),season:2026,week:1,recent_team:"A",position:"WR",targets:5,receptions:3,receiving_yards:40}));
 const a=study(players,schedule,"2026-09-11");assert.equal(Object.keys(a.markets).length,0);assert.equal(a.priorWeekEmbargo,true);assert.equal(a.modelPromoted,false);
});
