"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {analyzeProspective}=require("../src/nhl-prospective-quality.cjs");
test("distinguishes future, live and finalized games missing authoritative player stats",()=>{
 const games=[{id:1,startTimeUTC:"2026-11-03T00:00:00Z",gameState:"FUT"},
 {id:2,startTimeUTC:"2026-11-02T19:00:00Z",gameState:"LIVE"},
 {id:3,startTimeUTC:"2026-11-01T19:00:00Z",gameState:"OFF",finalized:true}];
 const r=analyzeProspective({pending:[{gameId:1},{gameId:1},{gameId:2},{gameId:3},{gameId:99}],
 snapshotAudit:{totalRankedProps:15,eligiblePredictions:5,recoveredGameIdentity:4,
 skipped:{missingGameIdentity:2,notProvenPregame:1,duplicate:7}}},games,{
 now:"2026-11-02T20:00:00Z",
 missingIdentity:[{snapshotFile:"saved.json",prop:{team:"BOS",capturedAt:"2026-11-01T19:00:00Z"},reason:"insufficient_original_match_metadata"}]});
 assert.equal(r.pendingReasons.notStarted,2);
 assert.equal(r.pendingReasons.liveOrPendingFinal,1);
 assert.equal(r.pendingReasons.finalWithoutPlayerStats,1);
 assert.equal(r.pendingReasons.unknownOfficialStatus,1);
 assert.equal(r.unresolvedIdentityFields.opponent,1);
 assert.equal(r.unresolvedIdentityFields.eventStartsAt,1);
 assert.equal(r.verifiedProspectiveModelHitRate,null);
});
test("raw offered sides never become model accuracy even when graded pregame",()=>{
 const r=analyzeProspective({graded:[
  {gameId:1,market:"saves",correct:true,result:"Higher"},
  {gameId:2,market:"saves",correct:false,result:"Lower"},
  {gameId:3,market:"goals",correct:null,result:"Push"}
 ],pending:[]},[],{now:"2026-11-02T20:00:00Z"});
 assert.equal(r.gradedProps,0);
 assert.equal(r.gradedDecisions,0);
 assert.equal(r.rawOfferedSideRowsGraded,3);
 assert.equal(r.rawOfferedSideDecisions,2);
 assert.equal(r.rawOfferedSideCorrectRate,.5);
 assert.equal(r.verifiedProspectiveModelHitRate,null);
 assert.equal(r.prospectiveAlwaysHigherBaseline,null);
 assert.equal(r.prospectiveAlwaysLowerBaseline,null);
 assert.equal(r.rawOfferedSideMarketSummary.saves.decisions,2);
 assert.equal(r.originalPrizePicksSettlementVerified,false);
 assert.equal(r.calibrated,false);
});
test("never calls historical quote reconstruction to fill frozen predictions",()=>{
 const r=analyzeProspective({graded:[],pending:[],snapshotAudit:{skipped:{missingGameIdentity:64}}},[],{now:"2026-11-02T20:00:00Z"});
 assert.equal(r.unresolvedIdentityCount,64);
 assert.equal(r.verifiedProspectiveModelHitRate,null);
});

test("published prospectively selected model rates come only from frozen optimizer lineage",()=>{
 const audit={kind:"nhl_frozen_individual_prop_preference_audit_v1",
  explicitProspective:{
   decided:3,graded:3,uniqueSelections:4,pending:1,hitRate:2/3,
   alwaysLowerBaseline:1/3,alwaysHigherBaseline:2/3,
   byGameDate:{"2026-11-02":{decided:3}},
   byMarket:{shotsOnGoal:{decided:3,correct:2}}},
  legacyRetrospective:{decided:0,uniqueSelections:0,byTier:{},byMarket:{},byGameDate:{}}};
 const r=analyzeProspective({graded:[
  {gameId:1,market:"points",correct:true,result:"Lower"},
  {gameId:1,market:"points",correct:false,result:"Higher"}
 ],pending:[],individualPropAudit:audit},[],{now:"2026-11-03T10:00:00Z"});
 assert.equal(r.verifiedProspectiveModelHitRate,2/3);
 assert.equal(r.rawOfferedSideCorrectRate,.5);
 assert.equal(r.gradedDecisions,3);
 assert.equal(r.selectedIndividualPending,1);
 assert.equal(r.prospectiveAlwaysLowerBaseline,1/3);
 assert.equal(r.marketSummary.shotsOnGoal.correct,2);
});
