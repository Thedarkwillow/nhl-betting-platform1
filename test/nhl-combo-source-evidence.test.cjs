"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateStructuredComboSource}=
 require("../src/nhl-combo-source-evidence.cjs");
const game1=2026020321,game2=2026020322,at="2026-11-06T18:00:00Z";
const history={players:{
 "8479001":{playerId:8479001,type:"skater",games:[]},
 "8479002":{playerId:8479002,type:"skater",games:[]},
 "8479003":{playerId:8479003,type:"goalie",games:[]},
 "8479004":{playerId:8479004,type:"goalie",games:[]}
}};
const offer={market:"shotsOnGoalCombo",line:5.5,
 scoringOperator:"sum",settlementPeriod:"full_game",
 membersProvenance:"structured_original_source_metadata",
 sourceCapturedAt:"2026-11-06T17:58:00Z",
 members:[
  {playerId:8479001,role:"skater",officialGameId:game1,
   gameStartAt:"2026-11-07T02:00:00Z"},
  {playerId:8479002,role:"skater",officialGameId:game1,
   gameStartAt:"2026-11-07T02:00:00Z"}]};
test("actual same-game members are structurally recognized, not promoted",()=>{
 const r=validateStructuredComboSource(offer,history,{now:at});
 assert.equal(r.valid,true);
 assert.equal(r.relation,"same_game");
 assert.equal(r.memberCount,2);
 assert.equal(r.acceptedForAutomaticHigherLower,false);
 assert.equal(r.acceptedForOptimizedLineups,false);
 assert.equal(r.verifiedJointHitProbability,null);
});
test("combo members may belong to distinct NHL games but require distinct game identities",()=>{
 const cross={...offer,members:[
  offer.members[0],{...offer.members[1],officialGameId:game2,
   gameStartAt:"2026-11-07T03:30:00Z"}]};
 const r=validateStructuredComboSource(cross,history,{now:at});
 assert.equal(r.valid,true);
 assert.equal(r.relation,"cross_game");
 assert.equal(r.originalGameIds.length,2);
 assert.match(r.analysisNextStep,/cross-game joint count/);
 assert.equal(r.verifiedJointHitProbability,null);
});
test("provider text split into names is not identity; missing game IDs and old sources fail",()=>{
 assert.equal(validateStructuredComboSource({...offer,
  membersProvenance:"inferred_from_display_label"},history,{now:at}).reason,
  "original_combo_members_not_structured");
 assert.equal(validateStructuredComboSource({...offer,members:[
  {...offer.members[0],officialGameId:null},offer.members[1]]},history,{now:at}).reason,
  "ambiguous_combo_member_identity_game_or_role");
 assert.equal(validateStructuredComboSource({...offer,members:[
  offer.members[0],{...offer.members[1],playerId:8479001}]},history,{now:at}).reason,
  "ambiguous_combo_member_identity_game_or_role");
 assert.equal(validateStructuredComboSource({...offer,
  sourceCapturedAt:"2026-11-06T16:00:00Z"},history,{now:at}).reason,
  "stale_or_missing_original_combo_capture");
 assert.equal(validateStructuredComboSource({...offer,
  scoringOperator:"average"},history,{now:at}).reason,
  "exact_combo_scoring_operator_or_period_not_verified");
});
test("goalie saves combo requires official goalie player identities, not skater props",()=>{
 const goalie={...offer,market:"goalieSavesCombo",line:45.5,
  members:[
   {playerId:8479003,role:"goalie",officialGameId:game1,
    gameStartAt:"2026-11-07T02:00:00Z"},
   {playerId:8479004,role:"goalie",officialGameId:game2,
    gameStartAt:"2026-11-07T03:00:00Z"}]};
 assert.equal(validateStructuredComboSource(goalie,history,{now:at}).valid,true);
 assert.equal(validateStructuredComboSource({...goalie,members:[
  {...goalie.members[0],role:"skater"},goalie.members[1]]},history,{now:at}).valid,false);
 assert.equal(validateStructuredComboSource({...goalie,members:[offer.members[0],goalie.members[1]]},
  history,{now:at}).valid,false);
});
