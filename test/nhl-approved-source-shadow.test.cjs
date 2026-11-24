"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {estimateSourceModel,buildApprovedShadow,leagueRates}=require("../src/nhl-approved-source-shadow.cjs");
const now="2026-11-02T20:00:00Z",start="2026-11-03T02:00:00Z";
const teamNames=["BOS","NYR","MTL","TOR","VAN","PIT","WSH","BUF","CAR","FLA","SEA","DAL","LAK"];
const teams=Object.fromEntries(teamNames.map(t=>[t,{
 gamesPlayed:12,shotsOnGoalAgainstPer60:30,shotsOnGoalForPer60:30,xGoalsAgainstPer60:2.6}]));
const approved={generatedAt:"2026-11-02T19:30:00Z",
 moneyPuck:{skaters:{rows:{"111":{team:"BOS",gamesPlayed:12,xOnGoalPer60:9,xGoalsPer60:1.1}}},
  goalies:{rows:{"222":{team:"BOS",gamesPlayed:12,xOnGoalAgainstPer60:30,xGoalsAgainstPer60:2.8}}},
  teams:{rows:teams}},
 dailyFaceoff:{games:[{gameId:2026020320,eventStartsAt:start,goalies:[
  {playerId:222,team:"BOS",status:"reported_confirmed"}]}],
  lineups:{BOS:{players:[{playerId:111,groupName:"Line 1",categoryName:"Forwards"}]}}}};
const prop={gameId:2026020320,playerId:111,team:"BOS",opponent:"NYR",
 eventStartsAt:start,capturedAt:"2026-11-02T19:45:00Z",
 market:"shotsOnGoal",line:2.5,tier:"Standard",lean:"Higher",
 projection:2.8,roleEvidence:{usage:{expectedMinutesShadow:18}}};
test("MoneyPuck xOnGoal projected minutes builds research-only same-line probability",()=>{
 const r=estimateSourceModel(prop,approved,now);
 assert.equal(r.status,"research_shadow_only");
 assert.equal(r.candidate.sourceMean,2.7);
 assert.equal(r.candidate.shadowMean,2.775);
 assert.equal(r.candidate.dfoLineGroup,"Line 1");
 assert.equal(r.candidate.dataModelCalibrated,false);
 assert.equal(r.candidate.adjustmentNotDeployed,true);
 assert.equal(r.candidate.sourceApprovalUserReported,true);
});
test("MoneyPuck goalie expected saves and DFO reported goalie status do not confirm club starter",()=>{
 const result=estimateSourceModel({...prop,market:"saves",playerId:222,
 projection:25,roleEvidence:{usage:{expectedMinutesShadow:56}},
 line:24.5},approved,now);
 assert.equal(result.status,"research_shadow_only");
 assert.equal(result.candidate.dfoGoalieStatus,"reported_confirmed");
 assert.equal(result.candidate.dfoIndependentClubStarterVerified,false);
 assert.equal(result.candidate.readyForBetting,false);
});
test("as-of gate prevents late sources, after-game quotes, wrong team and unavailable minutes",()=>{
 assert.equal(estimateSourceModel(prop,approved,"2026-11-02T19:00:00Z").status,"source_or_quote_stale_or_after_start");
 assert.equal(estimateSourceModel(prop,approved,"2026-11-03T03:00:00Z").status,"source_or_quote_stale_or_after_start");
 assert.equal(estimateSourceModel({...prop,team:"NYR"},approved,now).status,"missing_or_team_conflicted_moneypuck_history");
 assert.equal(estimateSourceModel({...prop,roleEvidence:{usage:{expectedMinutesShadow:null}}},approved,now).status,"unverified_expected_minutes");
});
test("shadow never changes production rank, no fake retrospective hit rates",()=>{
 const r=buildApprovedShadow({rankedProps:[prop,prop]},approved,now);
 assert.equal(r.sourceRows.length,1);
 assert.equal(r.modelDeployed,false);
 assert.equal(r.prospectiveVerified,false);
 assert.equal(r.actualFutureOfficialGradingPending,true);
 assert.equal(r.counts.originalResearchProps,2);
 assert.equal(r.counts.shadowRows,1);
 assert.equal(r.writtenCommercialTermsNotVerified,true);
});
test("team xG and SOG context requires 12 teams before opponent rate comparisons",()=>{
 assert.equal(leagueRates(teams).shotsAgainstPer60,30);
 assert.equal(leagueRates({BOS:teams.BOS}).shotsAgainstPer60,null);
});
