"use strict";
/**
 * Dedicated, isolated NHL single-period HIGHER/LOWER research ranking.
 * Only exact structured player, official future game ID, period, original
 * quote timestamp and a model built BEFORE the quote can produce a preview.
 * Does not modify the existing full-game optimizer or use synthetic prices.
 */
const {periodCode}=require("./nhl-combo-period-research.cjs");
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {COUNT_MARKETS,observedPeriodHistory}=
 require("./nhl-period-count-model.cjs");
const minute=60000;
function periodResearchPreference(offer,{periodHistory,periodModel,
 officialHistory,now=new Date().toISOString()}={}){
 const per=periodCode(offer?.period),stat=offer?.market,
  pid=offer?.officialPlayerId,gameId=offer?.officialGameId;
 if(![1,2,3].includes(per)||!COUNT_MARKETS.includes(stat))
  return {eligible:false,reason:"unrecognized_NHL_regulation_period_stat"};
 if(!Number.isInteger(pid)||pid<=0||
   !Number.isInteger(gameId)||gameId<1000000000)
  return {eligible:false,reason:"exact_official_period_player_game_identity_missing"};
 if(offer?.periodScoringRule!=="regulation_period_only"||
    offer?.periodParticipationRule!=="must_play_in_listed_period")
  return {eligible:false,reason:"provider_specific_period_settlement_rule_missing"};
 if(!Number.isFinite(offer?.line)||offer.line<0||offer.tier!=="Standard")
  return {eligible:false,reason:"exact_offered_standard_period_line_missing"};
 const start=Date.parse(offer?.eventStartsAt),
  captured=Date.parse(offer?.sourceCapturedAt),
  evaluated=Date.parse(now),built=Date.parse(periodModel?.builtAt);
 if(![start,captured,evaluated,built].every(Number.isFinite)||
   !(built<=captured&&captured<=evaluated&&evaluated+15*minute<start)||
   evaluated-captured>30*minute||captured-built>48*60*minute)
  return {eligible:false,reason:"period_quote_or_model_not_frozen_in_valid_pregame_window"};
 if(periodModel?.kind!=="nhl_regulation_period_model_shadow"||
    periodHistory?.kind!=="nhl_official_period_history_v1"||
    !officialHistory?.players)
  return {eligible:false,reason:"period_official_model_or_history_missing"};
 const official=officialHistory.players[String(pid)];
 if(!official||!["goalie","skater"].includes(official.type)||
  ((stat==="saves"||stat==="goalsAgainst")!== (official.type==="goalie")))
  return {eligible:false,reason:"official_period_role_market_mismatch"};
 // Confirmed starter and platform void condition cannot be invented from
 // a historical goalie start. This is a hard research-period abstention.
 if(official.type==="goalie"&&!offer.startingGoalieConfirmed)
  return {eligible:false,reason:"goalie_pregame_start_unconfirmed"};
 const playerModel=periodModel.players?.[String(pid)]?.[String(per)]?.[stat];
 if(playerModel?.readyForResearch!==true||
   !Number.isFinite(playerModel.estimate)||playerModel.count<8)
  return {eligible:false,reason:"no_eight_game_period_specific_model"};
 const cutoffDate=new Date(built).toISOString().slice(0,10);
 if(!playerModel.lastIncludedGameDate||
   playerModel.lastIncludedGameDate>=cutoffDate)
  return {eligible:false,reason:"training_contains_same_day_or_future_period_result"};
 const prior=observedPeriodHistory(periodHistory,pid,per,stat,
  periodModel.builtAt);
 if(prior.length<8||prior.length<playerModel.count)
  return {eligible:false,reason:"period_historical_source_not_equal_to_model_cutoff"};
 const prob=estimateCountProbabilities(playerModel.estimate,offer.line);
 if(!prob)return {eligible:false,reason:"period_count_distribution_invalid"};
 const lean=prob.higher>prob.lower?"Higher":prob.lower>prob.higher?"Lower":null;
 if(!lean)return {eligible:false,reason:"period_model_has_no_directional_preference"};
 return {eligible:true,researchOnly:true,productionEligible:false,
  market:stat,period:per,officialPlayerId:pid,officialGameId:gameId,
  capturedAt:offer.sourceCapturedAt,
  eventStartsAt:offer.eventStartsAt,line:offer.line,
  lean,probabilities:{...prob,calibrated:false},
  model:"nhl-regulation-period-fixed-form-shadow-v1",
  modelBuiltAt:periodModel.builtAt,
  priorOfficialPlayerPeriodGames:prior.length,
  originalPlatformQuoteAuthenticated:false,
  platformRuleVerifiedFromOffer:false,
  verifiedProspectiveHitRate:null,
  eligibleForLiveOptimizedLineup:false,
  status:"experimental_individual_period_research_preview",
  note:"Conditional pregame source-structured period direction only. Original platform quote, rule, payout, DNP and joint lineup compatibility still require independent authentication."};
}
module.exports={periodResearchPreference};
