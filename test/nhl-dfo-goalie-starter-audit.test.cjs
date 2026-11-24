"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {verifyReportedGoalies}=require("../src/nhl-dfo-goalie-starter-audit.cjs");
const at="2026-11-03T18:00:00Z",commit="2026-11-03T18:05:00Z",start="2026-11-04T01:00:00Z";
const report={kind:"approved_nhl_source_research_snapshots",generatedAt:at,
 dailyFaceoff:{games:[{gameId:2026020301,eventStartsAt:start,home:"BOS",away:"NYR",
 goalies:[{playerId:222,team:"BOS",status:"reported_confirmed",
 reportAt:"2026-11-03T17:00:00Z"}]}]}};
const source={snapshot:report,firstCommittedAt:commit,historyCount:1};
const usage={players:{"222":[{playerId:222,gameId:2026020301,
 team:"BOS",type:"goalie",started:true,saves:28}]}};
test("explicit NHL FINAL starter bit confirms secondary report retrospectively",()=>{
 const r=verifyReportedGoalies([source],usage);
 assert.equal(r.gradedStarts,1);
 assert.equal(r.reportedConfirmedActualStarts,1);
 assert.equal(r.officialPregameTeamConfirmationVerified,false);
 assert.equal(r.goalieStartProbabilityCalibrated,false);
});
test("appeared in game with saves but no NHL starter flag is not a confirmed starter",()=>{
 const r=verifyReportedGoalies([source],{players:{"222":[{...usage.players["222"][0],started:null}]}});
 assert.equal(r.gradedStarts,0);
 assert.equal(r.officialStarterFlagMissing,1);
 assert.equal(r.reportedConfirmedNotActualStarts,0);
});
test("confirmed reporter status can be explicitly wrong in official FINAL",()=>{
 const r=verifyReportedGoalies([source],{players:{"222":[{...usage.players["222"][0],started:false}]}});
 assert.equal(r.reportedConfirmedNotActualStarts,1);
 assert.equal(r.bettingEligible,false);
});
test("post-game or mutated Git receipt is refused",()=>{
 const late={...source,firstCommittedAt:"2026-11-04T02:00:00Z"};
 assert.equal(verifyReportedGoalies([late],usage).gradedStarts,0);
 assert.equal(verifyReportedGoalies([{...source,historyCount:2}],usage).gradedStarts,0);
 const future={...source,snapshot:{...report,dailyFaceoff:{games:[{
  ...report.dailyFaceoff.games[0],goalies:[{...report.dailyFaceoff.games[0].goalies[0],
  reportAt:"2026-11-04T02:00:00Z"}]}]}}};
 assert.equal(verifyReportedGoalies([future],usage).gradedStarts,0);
});
