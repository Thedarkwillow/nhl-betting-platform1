"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {addEvidence,summarizeModelResearch}=require("../src/nhl-research-evidence.cjs");
const base={player:"A. Skater",playerId:8471234,team:"BOS",market:"shotsOnGoal",
 line:2.5,tier:"Standard",lean:"Higher",probability:.64,
 eventStartsAt:"2026-11-03T02:00:00Z",capturedAt:"2026-11-02T20:00:00Z"};
const book={player:base.player,playerId:base.playerId,team:base.team,market:base.market,
 line:base.line,tier:"Standard",sportsbookHigher:.61,modelHigher:.64,
 books:["Book A","Book B"],comparisonOnly:true};
test("exact fresh consensus labels agreement, but never creates a playable or calibrated pick",()=>{
 const x=addEvidence([base],[book]);
 assert.equal(x.props[0].evidence.status,"model_market_agreement");
 assert.equal(x.props[0].evidence.books,2);
 assert.equal(x.summary.agree,1);
 assert.equal(x.props[0].evidence.readyForBetting,false);
 assert.equal(x.props[0].evidence.probabilityCalibrated,false);
 assert.equal(x.props[0].evidence.prospectiveEdgeVerified,false);
});
test("opposing sportsbook market is visible and explicitly marked as disagreement",()=>{
 const x=addEvidence([base],[{...book,sportsbookHigher:.42}]);
 assert.equal(x.props[0].evidence.status,"model_market_disagreement");
 assert.equal(x.summary.disagree,1);
 assert.equal(x.props[0].evidence.requiresResearchReview,true);
});
test("no exact market pair is model-only even if same person at another line",()=>{
 const x=addEvidence([base],[{...book,line:3.5}]);
 assert.equal(x.props[0].evidence.status,"model_only");
 assert.equal(x.summary.exactBookMatch,0);
});
test("ambiguous matches are quarantined, never silently averaged",()=>{
 const x=addEvidence([base],[book,{...book,sportsbookHigher:.45}]);
 assert.equal(x.props[0].evidence.status,"ambiguous_market");
 assert.equal(x.props[0].evidence.books,0);
});
test("unverified event start, special tiers and unknown direction cannot be promoted",()=>{
 const x=addEvidence([{...base,eventStartsAt:null,tier:"Goblin",lean:"Neutral"}],[book]);
 const e=x.props[0].evidence;
 assert.equal(e.status,"model_only");
 assert.equal(e.scheduledStartConfirmed,false);
 assert.equal(e.readyForBetting,false);
 assert.ok(e.notes.some(s=>s.includes("Alternate tier")));
});
test("public model history is only exposed when both research artifacts have valid shapes",()=>{
 const seasonLab={kind:"nhl_official_stat_two_season_projection_lab",
  trainingSeason:"2024-25",holdoutSeason:"2025-26",evaluatedTrainingRows:12,
  evaluatedHoldoutRows:21,byMarket:{shotsOnGoal:{holdout:{playerGames:10},
    championHoldoutMae:1.2,shadowHoldoutMae:1.1,measuredShadowImprovement:.1}}};
 const archiveLab={kind:"two_season_exploratory_nhl_model_comparison",
  eligibleArchivedLines:9,temporalHoldout:{alwaysLowerHeldOutHitRate:.55,
   trainingSelectionGatePassed:false,observedTrainingDecisions:66,
   observedTrainingGames:8,minimumTrainingDecisions:100,
   minimumDistinctTrainingGames:20,chosenOnTrainingOnly:null},
  bySeason:{"2025-26":{"weighted-form-v1":{decisions:4,correct:2,hitRate:.5},
    "stable-shrink-v2":{decisions:4,correct:3,hitRate:.75},
    "prior-mean":{decisions:4,correct:3,hitRate:.75}}}};
 const x=summarizeModelResearch(seasonLab,archiveLab);
 assert.equal(x.trainingObservations,12);
 assert.equal(x.holdoutObservations,21);
 assert.equal(x.marketMAE.shotsOnGoal.improvement,.1);
 assert.equal(x.retrospectiveBySeason["2025-26"]["prior-mean"].correct,3);
 assert.equal(x.retrospectiveTrainingGate.passed,false);
 assert.equal(x.retrospectiveTrainingGate.archivedDecisions,66);
 assert.equal(x.retrospectiveTrainingGate.distinctGames,8);
 assert.equal(x.retrospectiveTrainingGate.selectedCandidate,null);
 assert.equal(x.retrospectiveTrainingGate.selectedFormulaApproved,false);
 assert.equal(x.alternativePromoted,false);
 assert.equal(x.prospectiveModelAccuracyVerified,false);
 assert.equal(summarizeModelResearch({},archiveLab),null);
});
