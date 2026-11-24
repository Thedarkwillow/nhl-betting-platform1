"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {officialExperimentalActual,gradeExperimentalFrozenPicks}=
 require("../src/nhl-experimental-market-outcome.cjs");
const {gradeFrozenSelectedLineups}=
 require("../src/nhl-frozen-selected-lineup-grader.cjs");
const RULE="prizepicks-nhl-goalie-fantasy-user-provided-20261106";
test("official outcome mapper uses minutes, signed +/- and platform goalie score with explicit rules",()=>{
 assert.deepEqual(officialExperimentalActual({
  market:"timeOnIceSeconds",marketStatUnit:"minutes",
  marketOvertimeRule:"includes_official_full_game"},{timeOnIceSeconds:900}),
  {actual:15,unit:"minutes",officialRawSeconds:900,
   outcomeSource:"NHL_final_full_game_TOI_including_overtime"});
 assert.equal(officialExperimentalActual({market:"timeOnIceSeconds"},
  {timeOnIceSeconds:900}).actual,null);
 assert.equal(officialExperimentalActual({market:"plusMinus"},
  {plusMinus:-3}).actual,-3);
 assert.equal(officialExperimentalActual({market:"goalieFantasyScore",
  marketRuleVersion:RULE},{prizePicksGoalieFantasyScore:-4.8}).actual,-4.8);
 assert.equal(officialExperimentalActual({market:"goalieFantasyScore"},
  {prizePicksGoalieFantasyScore:20}).actual,null);
 assert.equal(officialExperimentalActual({market:"goalsCombo"},
  {goals:1}).actual,null);
});
test("grades only Git-proven pregame experimental props without contaminating old champion",()=>{
 const start="2026-11-07T02:00:00Z",
  base={gameId:2026020310,playerId:10,gameStartAt:start,
   market:"timeOnIceSeconds",line:14.5,tier:"Standard",lean:"Higher",
   model:"nhl-priority-four-static-form-shadow-v1",
   probability:.61,experimentalMarketResearchOnly:true,
   capturedAt:"2026-11-06T19:58:00Z",
   predictionRecordedAt:"2026-11-06T20:00:00Z",
   snapshotArchivedAt:"2026-11-06T20:00:10Z",
   marketStatUnit:"minutes",
   marketOvertimeRule:"includes_official_full_game"};
 const history={players:{"10":{games:[{gameId:2026020310,playerId:10,
  gameDate:"2026-11-06",timeOnIceSeconds:900,plusMinus:-3,
  prizePicksGoalieFantasyScore:-3.6}]}}};
 const x=gradeExperimentalFrozenPicks([base,{
  ...base,market:"plusMinus",line:-2.5,lean:"Lower",
  marketStatUnit:null,marketOvertimeRule:null},{
  ...base,market:"goalieFantasyScore",line:-1,lean:"Lower",
  marketRuleVersion:RULE},{
  ...base,market:"timeOnIceSeconds",marketStatUnit:undefined
 }],history);
 assert.equal(x.summary.graded,3);
 assert.equal(x.summary.decided,3);
 assert.equal(x.summary.correct,3);
 assert.equal(x.rejected.length,1);
 assert.equal(x.originalPlatformSettlementVerified,false);
 assert.equal(x.neverMixedWithLegacyChampionAccuracy,true);
 assert.equal(x.graded[0].actual,15);
 assert.equal(x.graded[1].actual,-3);
 assert.equal(x.graded[2].actual,-3.6);
 const late=gradeExperimentalFrozenPicks([{
  ...base,snapshotArchivedAt:"2026-11-07T03:00:00Z"}],history);
 assert.equal(late.summary.graded,0);
 assert.equal(late.rejected[0].reason,"missing_first_git_commit_or_pregame_model_proof");
});
test("one frozen lineup with experimental and champion picks produces separated scoring cohorts",()=>{
 const at="2026-11-07T02:00:00Z",
   modelTime="2026-11-06T17:00:00Z",
   captured="2026-11-06T19:58:00Z";
 const ex={gameId:2026020310,playerId:10,team:"NYR",opponent:"BOS",
  eventStartsAt:at,gameStartAt:at,matchup:"NYR vs BOS",market:"plusMinus",
  line:-.5,tier:"Standard",lean:"Lower",probability:.7,
  probabilityCalibrated:false,model:"nhl-extra-market-static-shadow-v1",
  experimentalMarketResearchOnly:true,
  experimentalMarketEvidence:{stat:"plusMinus",observations:9,modelBuiltAt:modelTime},
  capturedAt:captured,observedAt:captured};
 const legacy={gameId:2026020311,playerId:11,team:"BUF",opponent:"OTT",
  eventStartsAt:at,gameStartAt:at,matchup:"BUF vs OTT",market:"shotsOnGoal",
  line:2.5,tier:"Standard",lean:"Higher",probability:.75,
  model:"weighted-form-v1",capturedAt:captured,observedAt:captured};
 const frame={gitHistoryCount:1,firstCommittedAt:"2026-11-06T20:00:10Z",
  snapshot:{generatedAt:"2026-11-06T20:00:00Z",
   rankedProps:[ex,legacy],lineups:{
    2:{status:"research_only",optimized:true,picks:[ex,legacy]}}}};
 const games=[
  {id:2026020310,home:"NYR",away:"BOS",startTimeUTC:at},
  {id:2026020311,home:"BUF",away:"OTT",startTimeUTC:at}
 ];
 const history={players:{
  "10":{games:[{gameId:2026020310,playerId:10,gameDate:"2026-11-06",plusMinus:-1}]},
  "11":{games:[{gameId:2026020311,playerId:11,gameDate:"2026-11-06",shotsOnGoal:4}]}
 }};
 const x=gradeFrozenSelectedLineups([frame],games,history);
 assert.equal(x.validFrozenLineups,1);
 assert.equal(x.legacyChampionSelectedProps,1);
 assert.equal(x.experimentalMarketSelectedProps,1);
 assert.equal(x.decided,1);
 assert.equal(x.correct,1);
 assert.equal(x.experimental.summary.decided,1);
 assert.equal(x.experimental.summary.correct,1);
 assert.equal(x.experimental.separateFromChampionRate,true);
 assert.equal(x.originalPlatformSettlementsVerified,false);
});
