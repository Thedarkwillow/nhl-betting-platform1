"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {COMBOS,periodCode,validateComboIdentity,
 sharedOfficialComboSamples,validatePeriodStatOffer,auditCompositeAndPeriodBoard}=
 require("../src/nhl-combo-period-research.cjs");
const first=8470000001,second=8470000002;
const allDates=Array.from({length:9},(_,i)=>({
 gameId:2026020001+i,
 gameDate:"2026-10-"+String(i+1).padStart(2,"0")}));
function hist(){
 return {players:{
  [String(first)]:{playerId:first,type:"skater",
   games:allDates.map((g,i)=>({...g,shotsOnGoal:2+i,goals:i%2}))},
  [String(second)]:{playerId:second,type:"skater",
   games:allDates.map((g,i)=>({...g,shotsOnGoal:1,goals:0}))}
 }};
}
const base={market:"shotsOnGoalCombo",officialGameId:2026020310,
 officialMemberPlayerIds:[first,second],period:"Full Game"};
test("all three combo types declared, but source identity must be structured",()=>{
 assert.deepEqual(Object.keys(COMBOS).sort(),
  ["goalieSavesCombo","goalsCombo","shotsOnGoalCombo"].sort());
 assert.equal(validateComboIdentity({...base,officialMemberPlayerIds:[first,first]},
  hist()).reason,"exact_nhl_combo_member_and_game_ids_required");
 assert.equal(validateComboIdentity({...base,officialMemberPlayerIds:undefined},
  hist()).reason,"exact_nhl_combo_member_and_game_ids_required");
 assert.equal(validateComboIdentity({...base,period:"1st period"},hist()).reason,
  "unsupported_combo_period");
 assert.equal(validateComboIdentity({...base,market:"goalieSavesCombo"},hist()).reason,
  "combo_athlete_official_role_unmatched");
 assert.equal(validateComboIdentity(base,hist()).valid,true);
});
test("combo historical stats use actual matched two-player same NHL game, never add independent unrelated seasons",()=>{
 const h=hist();
 const result=sharedOfficialComboSamples(base,h,{eventStartsAt:"2026-11-07T02:00:00Z"});
 assert.equal(result.valid,true);
 assert.equal(result.samples.length,9);
 assert.equal(result.samples[0].value,3);
 assert.equal(result.samples[8].value,11);
 assert.equal(result.researchModelReady,true);
 assert.equal(result.liveAutoPickEligible,false);
 assert.equal(result.lineupEligible,false);
 const mismatch=hist();
 mismatch.players[String(second)].games[0].gameId=2026020655;
 assert.equal(sharedOfficialComboSamples(base,mismatch,
  {eventStartsAt:"2026-11-07T02:00:00Z"}).samples.length,8);
 const future=hist();
 future.players[String(second)].games.forEach(g=>g.gameDate="2026-11-07");
 const x=sharedOfficialComboSamples(base,future,{eventStartsAt:"2026-11-07T02:00:00Z"});
 assert.equal(x.samples.length,0);
 assert.equal(x.researchModelReady,false);
});
test("period codes recognized, but no period is eligible without exact source rules and settlement",()=>{
 assert.equal(periodCode("1st period"),1);
 assert.equal(periodCode("second period"),2);
 assert.equal(periodCode("third period"),3);
 assert.equal(periodCode("Full Game"),"full_game");
 assert.equal(periodCode("overtime"),null);
 const req={period:"1st period",market:"shotsOnGoal",
  officialPlayerId:first,officialGameId:2026020310};
 assert.equal(validatePeriodStatOffer(req,null).reason,
  "period_official_historical_stats_missing");
 const archive={players:{[String(first)]:{"1":allDates.map(g=>({
  ...g,period:1,playedInPeriod:true,shotsOnGoal:2}))}}};
 const x=validatePeriodStatOffer(req,archive);
 assert.equal(x.officialSampleCount,9);
 assert.equal(x.eligible,false);
 assert.equal(x.reason,"original_period_offer_and_settlement_not_verified");
});

test("actual observed combo and period source rows produce readiness reasons, not fabricated picks",()=>{
 const rows=[
  {market:"Shots On Goal (Combo)",period:"Full game",officialGameId:2026020310,
   officialMemberPlayerIds:[first,second],eventStartsAt:"2026-11-07T02:00:00Z"},
  {market:"Goalie Saves (Combo)",period:"Full game",
   eventStartsAt:"2026-11-07T02:00:00Z"},
  {market:"Shots On Goal",period:"1st period",officialGameId:2026020310,
   officialPlayerId:first}];
 const a=auditCompositeAndPeriodBoard(rows,hist());
 assert.equal(a.comboRows,2);
 assert.equal(a.periodRows,1);
 assert.equal(a.comboWithExactIdentity,1);
 assert.equal(a.comboSharedHistoryAtLeastEight,1);
 assert.equal(a.comboReadyForLivePicks,0);
 assert.equal(a.periodReadyForLivePicks,0);
 assert.equal(a.noSyntheticCombinationProbabilities,true);
 assert.ok(a.notReadyReasons.joint_combo_probability_and_platform_settlement_unverified>0);
});
