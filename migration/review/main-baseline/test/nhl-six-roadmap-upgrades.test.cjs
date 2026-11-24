"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildPlayerInsights,buildMovementSummary,buildResultBreakdown,sanitizePlatformResearch}=
 require("../src/nhl-public-research-extensions.cjs");
const {assessNhlModelReadiness}=require("../src/nhl-model-release-gate.cjs");
const {inspectLineupDependencies}=require("../src/nhl-lineup-correlation-evidence.cjs");
const {sanitizePublicDashboard}=require("../src/nhl-public-dashboard-payload.cjs");
test("player detail computes pre-capture 5/10/20 and season rates; excludes same-day future scores",()=>{
 const games=Array.from({length:12},(_,i)=>({gameId:i+1,gameDate:
  "2026-10-"+String(10+i).padStart(2,"0"),shotsOnGoal:i+1,gameState:"FINAL",timeOnIceSeconds:1000}));
 games.push({gameId:100,gameDate:"2026-11-05",shotsOnGoal:100,gameState:"FINAL",timeOnIceSeconds:1000});
 const h={players:{1:{name:"Example",team:"BOS",games}}};
 const p={playerId:1,player:"Example",team:"BOS",market:"shotsOnGoal",
  capturedAt:"2026-11-05T15:00:00Z"};
 const r=buildPlayerInsights([p,{...p,line:3.5}],h);
 assert.equal(r.length,1);assert.equal(r[0].last5,10);
 assert.equal(r[0].last10,7.5);assert.equal(r[0].last20,6.5);
 assert.equal(r[0].seasonAverage,6.5);
 assert.equal(r[0].historicalGames,12);
 assert.equal(r[0].lastGameDate,"2026-10-21");
 assert.equal(r[0].futureGameStatsExcluded,true);
 assert.equal(buildPlayerInsights([{...p,player:"Wrong"}],h).length,0);
});
test("public movement summarizes observed differences without publishing raw vendor quotes",()=>{
 const m=buildMovementSummary({previousAt:"2026-11-04T00:00:00Z",currentAt:"2026-11-05T00:00:00Z",
  removalsVerified:true,changes:[{type:"increased",player:"Secret Name",line:5},
   {type:"not_seen_unverified",projectionId:"private_p1"}]});
 assert.equal(m.increased,1);assert.equal(m.notSeenUnverified,1);
 assert.equal(m.removalsVerified,false);
 assert.ok(!JSON.stringify(m).includes("Secret Name"));
 assert.ok(!JSON.stringify(m).includes("private_p1"));
});
test("public scorecard only uses verified explicit-graded market counts",()=>{
 const r=buildResultBreakdown({gradedDecisions:3,individualByMarket:{
  shotsOnGoal:{graded:3,decided:2,correct:1,pushes:1},
  unsafe:{graded:1,decided:3,correct:10,pushes:0}
 }});
 assert.deepEqual(r.byMarket.map(x=>x.market),["shotsOnGoal"]);
 assert.equal(r.byMarket[0].losses,1);
 assert.equal(r.byMarket[0].observedHitRate,null);
 assert.equal(r.byMarket[0].smallSampleWithheld,true);
});
test("Underdog comparisons not public without both freshness and explicit display rights",()=>{
 const d={derivedDisplayAuthorized:true,sourceFreshAtBuild:true,comparedLines:[
  {gameId:1,playerKey:"Player",market:"shotsOnGoal",side:"Higher",prizePicksLine:2.5,underdogLine:3.5},
  {gameId:1,playerKey:"Player",market:"shotsOnGoal",side:"Lower",prizePicksLine:2.5,underdogLine:3.5}
 ]};
 assert.equal(sanitizePlatformResearch({...d,derivedDisplayAuthorized:false}).matches.length,0);
 assert.equal(sanitizePlatformResearch({...d,sourceFreshAtBuild:false}).matches.length,0);
 const matches=sanitizePlatformResearch(d).matches;
 assert.equal(matches.length,2);
 assert.equal(matches[0].favorableThresholdPlatform,"PrizePicks");
 assert.equal(matches[1].favorableThresholdPlatform,"Underdog");
});
test("model gate remains private and fail-closed even if retrospective model looks strong",()=>{
 const empty=assessNhlModelReadiness(null);
 assert.equal(empty.modelPromotionAllowed,false);
 assert.ok(empty.unresolved.includes("no_explicit_original_pregame_cohort"));
 const fake={uniqueSelections:250,graded:220,decided:210,correct:180,pending:30,
  directionalEvidence:{prospectivelyPrecommitted:true,
   sourceCohort:"explicit_git_frozen_pregame_individual_selections",
   distinctGames:40,probabilityRows:210,
   gameClusterBootstrap95:{modelMinusAlwaysLower95:{lower:.01},modelMinusAlwaysHigher95:{lower:.02}},
   calibrationApproved:false,originalPlatformSettlementsVerified:false}};
 const verdict=assessNhlModelReadiness(fake);
 assert.equal(verdict.sampleGateReached,true);
 assert.equal(verdict.modelPromotionAllowed,false);
 assert.ok(verdict.unresolved.includes("held_out_probability_calibration_not_approved"));
 assert.ok(verdict.unresolved.includes("original_platform_settlement_not_verified"));
});
test("lineup audit reports same-game goalie-shooter overlap but never a fitted correlation",()=>{
 const a=inspectLineupDependencies([{matchup:"BOS vs NYR",team:"BOS",market:"saves"},
  {matchup:"BOS vs NYR",team:"NYR",market:"shotsOnGoal"},
  {matchup:"ANA vs SJS",team:"ANA",market:"points"}]);
 assert.equal(a.sharedGamePairs,1);
 assert.ok(a.pairs[0].signals.includes("goalie_shooter_stat_interaction"));
 assert.equal(a.estimatedJointHitProbability,null);
 assert.equal(a.calibratedCorrelationCoefficients,false);
});
test("public sanitizer allowlist refuses proprietary data even alongside new views",()=>{
 const d=sanitizePublicDashboard({builtAt:"2026-11-05T17:00:00Z",researchAt:null,
  boardAt:null,boardCoverage:{},props:[],lineups:{},comparisons:[],
  playerInsights:[{player:"Example",team:"BOS",market:"shotsOnGoal",last5:3,last10:2.5,
   last20:2.5,historicalGames:20,seasonGames:10,lastGameDate:"2026-11-04",
   source:"Official NHL completed-game statistics",futureGameStatsExcluded:true,
   privateFormula:"NO"}],
  lineMovement:{changes:[{type:"increased",player:"DO NOT REDISTRIBUTE",line:2}]},
  platformLineShopping:{status:"underdog_private_research_only",
   derivedDisplayAuthorized:false,sourceFreshAtBuild:true,comparedLines:[
    {gameId:1,playerKey:"Restricted",market:"points",side:"Higher",prizePicksLine:1.5,underdogLine:2.5}]},
  prospectiveResearchAudit:{gradedDecisions:0,prospectiveCorrect:0,
   prospectivePushes:0,selectedIndividualPending:187}});
 assert.equal(d.playerInsights[0].last5,3);
 assert.equal(d.resultBreakdown.noPrecommittedDecisions,true);
 assert.equal(d.performance.pendingProspectivePicks,187);
 assert.equal(d.platformResearch.matches.length,0);
 assert.ok(!JSON.stringify(d).includes("DO NOT REDISTRIBUTE"));
 assert.ok(!JSON.stringify(d).includes('"privateFormula":"NO"'));
 assert.ok(!JSON.stringify(d).includes('"privateFormula"'));
 assert.ok(!JSON.stringify(d).includes("Restricted"));
});
