"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sourceGate,readRole,hypothesisFactor,buildRoleGoalieShadow}=
 require("../src/nhl-dfo-role-goalie-shadow.cjs");
const start="2026-11-04T01:00:00Z",at="2026-11-03T23:00:00Z";
const lineup=(roles)=>({team:"BOS",sourceUpdatedAt:"2026-11-03T12:00:00Z",
 sourceCapturedAt:"2026-11-03T22:30:00Z",players:[{playerId:111,team:"BOS",
 injuryStatus:"",gameTimeDecision:false,roles}]});
const roles=[{categoryIdentifier:"ev",groupIdentifier:"f1"},
 {categoryIdentifier:"pp",groupIdentifier:"pp1"}];
const base={generatedAt:"2026-11-03T22:30:00Z",
 dailyFaceoff:{games:[{gameId:2026020301,eventStartsAt:start,home:"BOS",away:"NYR",
 goalies:[{playerId:222,team:"BOS",status:"reported_confirmed",
 reportAt:"2026-11-03T19:00:00Z",reportSource:"DFO reporter"}]}],
 lineups:{BOS:lineup(roles)}},
 moneyPuck:{goalies:{rows:{"222":{team:"BOS",gamesPlayed:9,
 xOnGoalAgainstPer60:33,xGoalsAgainstPer60:3.1}}},
 teams:{rows:Object.fromEntries(["BOS","NYR","TOR","MTL","CAR","FLA","DET","TBL",
 "SEA","VAN","LAK","COL"].map(team=>[team,{gamesPlayed:10,shotsOnGoalForPer60:30}]))}}};
const prop={playerId:111,gameId:2026020301,team:"BOS",opponent:"NYR",
 eventStartsAt:start,capturedAt:"2026-11-03T22:40:00Z",projection:2.8,
 market:"shotsOnGoal",line:2.5,lean:"Higher",tier:"Standard",
 roleEvidence:{usage:{expectedMinutesShadow:18}}};
test("EV1/PP1 role is separately marked as unfitted and never promoted",()=>{
 const report=buildRoleGoalieShadow({rankedProps:[prop]},base,at);
 assert.equal(report.counts.skaterRoleCandidates,1);
 const p=report.rows[0];
 assert.equal(p.status,"role_research_only");
 assert.equal(p.role.powerPlayGroup,"pp1");
 assert.equal(p.roleShadowMean,Number((2.8*1.035).toFixed(5)));
 assert.equal(p.modelDeployed,false);
 assert.equal(report.modelDeployed,false);
 assert.equal(hypothesisFactor("goals",p.role),1.05);
});
test("goalie projection is conditional on play with zero team-confirmation claims",()=>{
 const goalie={...prop,market:"saves",playerId:222,line:24.5,projection:26,
 roleEvidence:{usage:{expectedMinutesShadow:55}}};
 const r=buildRoleGoalieShadow({rankedProps:[goalie]},base,at);
 assert.equal(r.counts.conditionalGoalieCandidates,1);
 const p=r.rows[0];
 assert.equal(p.status,"goalie_conditional_research_only");
 assert.equal(p.sourceStatus,"reported_confirmed");
 assert.equal(p.startingGoalieVerifiedByTeam,false);
 assert.equal(p.startingProbability,null);
 assert.equal(p.unknownStarterNoSlip,true);
 assert.equal(p.conditionalSavesShadowMean>0,true);
});
test("no duplicate skater lineup categories accepted and missing EV fails closed",()=>{
 const conflict={...base,dailyFaceoff:{...base.dailyFaceoff,lineups:{BOS:lineup([
  ...roles,{categoryIdentifier:"ev",groupIdentifier:"f2"}])}}};
 assert.equal(readRole(prop,conflict,at).status,"conflicting_role_assignments");
 const absent={...base,dailyFaceoff:{...base.dailyFaceoff,lineups:{BOS:lineup([roles[1]])}}};
 assert.equal(readRole(prop,absent,at).status,"even_strength_role_unknown");
 const scratched={...base,dailyFaceoff:{...base.dailyFaceoff,lineups:{BOS:{
  ...lineup(roles),players:[{...lineup(roles).players[0],gameTimeDecision:true}]}}}};
 assert.equal(readRole(prop,scratched,at).status,"injury_or_game_time_decision_requires_review");
});
test("poststart sources, stale role information, opposing game and future report are rejected",()=>{
 assert.equal(sourceGate(prop,base,"2026-11-04T01:05:00Z").status,"stale_or_after_puck_drop");
 assert.equal(sourceGate({...prop,gameId:2026020302},base,at).status,
  "no_unique_matched_official_game_in_dfo_snapshot");
 const stale={...base,dailyFaceoff:{...base.dailyFaceoff,lineups:{BOS:{
  ...lineup(roles),sourceUpdatedAt:"2026-10-31T19:00:00Z"}}}};
 assert.equal(readRole(prop,stale,at).status,"lineup_missing_or_stale");
 const future={...base,dailyFaceoff:{...base.dailyFaceoff,games:[
  {...base.dailyFaceoff.games[0],goalies:[{...base.dailyFaceoff.games[0].goalies[0],
   reportAt:"2026-11-04T02:00:00Z"}]}]}};
 const goalie={...prop,market:"saves",playerId:222,line:26.5,roleEvidence:{usage:{expectedMinutesShadow:55}}};
 assert.equal(buildRoleGoalieShadow({rankedProps:[goalie]},future,at).rows[0].status,
  "goalie_report_after_asof_or_game");
});
test("duplicates and insufficient goalie history do not produce fake shadow bets",()=>{
 const goalie={...prop,market:"saves",playerId:222,line:26.5,roleEvidence:{usage:{expectedMinutesShadow:null}}};
 const r=buildRoleGoalieShadow({rankedProps:[goalie,goalie]},base,at);
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].status,"insufficient_past_only_goalie_minutes");
 assert.equal(r.counts.conditionalGoalieCandidates,0);
 assert.equal(r.starterProbabilityEstimated,false);
});
