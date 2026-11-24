"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {periodResearchPreference}=require("../src/nhl-period-offer-research.cjs");
const {auditPeriodBoard}=require("../scripts/build-nhl-period-combo-models.cjs");
const id=8479123,gameId=2026020321;
const date=i=>"2026-10-"+String(i+1).padStart(2,"0");
const capture="2026-11-06T18:00:00Z",asOf="2026-11-06T18:01:00Z",
 start="2026-11-07T02:00:00Z";
const rows=Array.from({length:12},(_,i)=>({
  playerId:id,period:1,gameId:2026020100+i,gameDate:date(i),
  playedInPeriod:true,shotsOnGoal:1+(i%3)}));
const history={kind:"nhl_official_period_history_v1",
  players:{[id]:{"1":rows}}};
const model={kind:"nhl_regulation_period_model_shadow",
  builtAt:"2026-11-06T17:30:00Z",players:{
    [id]:{"1":{shotsOnGoal:{readyForResearch:true,count:12,
      estimate:2,lastIncludedGameDate:date(11)}}}}};
const players={players:{[id]:{type:"skater",playerId:id}}};
const offer={period:"1st period",market:"shotsOnGoal",
  officialPlayerId:id,officialGameId:gameId,
  periodScoringRule:"regulation_period_only",
  periodParticipationRule:"must_play_in_listed_period",
  tier:"Standard",line:1.5,
  sourceCapturedAt:capture,eventStartsAt:start};
const opts={periodHistory:history,periodModel:model,officialHistory:players,now:asOf};
test("exact period quote with pregame model and 12 prior periods yields RESEARCH preference only",()=>{
 const x=periodResearchPreference(offer,opts);
 assert.equal(x.eligible,true);
 assert.equal(x.researchOnly,true);
 assert.equal(x.productionEligible,false);
 assert.equal(x.lean,"Higher");
 assert.equal(x.priorOfficialPlayerPeriodGames,12);
 assert.equal(x.originalPlatformQuoteAuthenticated,false);
 assert.equal(x.eligibleForLiveOptimizedLineup,false);
 assert.equal(x.verifiedProspectiveHitRate,null);
});
test("period source fields, time, future cutoff and goalie starts are strict gates",()=>{
 const val=(p)=>periodResearchPreference({...offer,...p},opts);
 assert.equal(val({officialPlayerId:undefined}).reason,
  "exact_official_period_player_game_identity_missing");
 assert.equal(val({periodParticipationRule:null}).reason,
  "provider_specific_period_settlement_rule_missing");
 assert.equal(val({line:-1}).reason,
  "exact_offered_standard_period_line_missing");
 assert.equal(val({sourceCapturedAt:"2026-11-06T16:00:00Z"}).reason,
  "period_quote_or_model_not_frozen_in_valid_pregame_window");
 assert.equal(val({eventStartsAt:"2026-11-06T18:03:00Z"}).reason,
  "period_quote_or_model_not_frozen_in_valid_pregame_window");
 const future={...model,players:{[id]:{"1":{shotsOnGoal:{
   ...model.players[id]["1"].shotsOnGoal,
   lastIncludedGameDate:"2026-11-06"}}}}};
 assert.equal(periodResearchPreference(offer,{...opts,periodModel:future}).reason,
  "training_contains_same_day_or_future_period_result");
 const without={...players,players:{[id]:{type:"goalie"}}};
 assert.equal(periodResearchPreference(offer,{...opts,officialHistory:without}).reason,
  "official_period_role_market_mismatch");
});
test("market-level missing past data does not become an automatic period pick",()=>{
 const short={...history,players:{[id]:{"1":rows.slice(0,6)}}};
 assert.equal(periodResearchPreference(offer,{...opts,periodHistory:short}).reason,
  "period_historical_source_not_equal_to_model_cutoff");
 const blank={...model,players:{}};
 assert.equal(periodResearchPreference(offer,{...opts,periodModel:blank}).reason,
  "no_eight_game_period_specific_model");
});
test("period board audit records exact exclusions, not fabricated standard picks",()=>{
 const board={rows:[{...offer,market:"Shots on Goal"},
   {market:"Shots on Goal",period:"2nd period",line:2.5,
    eventStartsAt:start},
   {market:"Goals",period:"Full Game",line:0.5}]};
 const res=auditPeriodBoard(board,history,model,players,{now:asOf});
 assert.equal(res.periodRows,2);
 assert.equal(res.completeSourceAndModelResearchPreferences,1);
 assert.equal(res.candidateResearchPreferences[0].lean,"Higher");
 assert.equal(res.exclusions.exact_official_period_player_game_identity_missing,1);
 assert.equal(res.automaticLineupEligible,false);
 assert.equal(res.originalProviderOffersAuthenticated,false);
});
