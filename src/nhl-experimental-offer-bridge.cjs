"use strict";
/**
 * Strict bridge from private official player history + already-built
 * exploratory market shadows to the existing NHL *research* Higher/Lower
 * engine. This DOES NOT approve public calibrated forecasts or actual wagers.
 */
const {sampleHistoricValues,estimateExperimentalMarketProbability}=
 require("./nhl-new-market-model.cjs");
const INDIVIDUAL_MARKETS=Object.freeze({
 hits:{stat:"hits",model:"priority",role:"skater",unit:"count"},
 faceoffsWon:{stat:"faceoffsWon",model:"priority",role:"skater",unit:"count"},
 timeOnIceSeconds:{stat:"timeOnIceSeconds",model:"priority",role:"skater",unit:"minutes"},
 goalieFantasyScore:{stat:"prizePicksGoalieFantasyScore",model:"priority",role:"goalie",unit:"prizepicks_points"},
 powerPlayPoints:{stat:"powerPlayPoints",model:"extra",role:"skater",unit:"count"},
 goalsAgainst:{stat:"goalsAgainst",model:"extra",role:"goalie",unit:"count"},
 plusMinus:{stat:"plusMinus",model:"extra",role:"skater",unit:"signed_integer"}
});
function prepareExperimentalMarketOffer({market,player,row,source,extension}={}){
 const rule=INDIVIDUAL_MARKETS[market];
 if(!rule)return {eligible:false,reason:"not_an_implemented_individual_experimental_market"};
 if(!extension?.priorityShadow||!extension?.extraShadow||
   !extension?.officialHistory?.players)return {eligible:false,reason:"experimental_shadows_or_official_history_missing"};
 if(player?.type!==rule.role)return {eligible:false,reason:"role_market_mismatch"};
 const canonicalId=String(player.playerId);
 const model=rule.model==="priority"?
  extension.priorityShadow.players?.[canonicalId]?.projections?.[rule.stat]:
  extension.extraShadow.players?.[canonicalId]?.projections?.[rule.stat];
 const estimate=model?.projection??model?.estimate;
 const ready=model?.readyForResearch===true&&Number.isFinite(estimate);
 if(!ready)return {eligible:false,reason:"experimental_model_or_official_history_unready"};
 // Model timestamps must be from strictly before the current offer snapshot,
 // not a retroactively rebuilt "live" quote. After an official game starts,
 // the existing publisher also requires Git-frozen first-write chronology.
 const builtAt=Date.parse(rule.model==="priority"?
  extension.priorityShadow.builtAt:extension.extraShadow.builtAt);
 const sourceAt=Date.parse(row?.capturedAt),start=Date.parse(row?.eventStartsAt);
 if(![builtAt,sourceAt,start].every(Number.isFinite)||builtAt>sourceAt||
   sourceAt-builtAt>48*3600000||
   sourceAt>=start)return {eligible:false,reason:"experimental_shadow_was_not_frozen_before_offer"};
 const officialPlayer=extension.officialHistory.players[canonicalId];
 if(!officialPlayer||officialPlayer.type!==player.type)
  return {eligible:false,reason:"official_player_history_missing"};
 // Never inspect games that occurred on/after the ORIGINAL model-build
 // UTC date, even if the actual offered game's start is later.
 const observationsCutoff=new Date(Math.min(start,builtAt)).toISOString();
 const samples=sampleHistoricValues(officialPlayer,rule.stat,observationsCutoff);
 if(samples.length<8||samples.length<model.observations)
  return {eligible:false,reason:"insufficient_prior_official_market_samples"};
 const raw=Number(row?.line);
 if(!Number.isFinite(raw)||(rule.unit!=="signed_integer"&&
    rule.unit!=="prizepicks_points"&&raw<0))
  return {eligible:false,reason:"invalid_experimental_offer_line"};
 // Platform-specific settlement definitions must not be replaced by a
 // generic NHL gamecenter total. For Underdog, TOI excludes overtime.
 if(rule.unit==="minutes"&&(
   source!=="PrizePicks"||row?.unit!=="minutes"||
   row?.overtimeTreatment!=="includes_official_full_game"))
  return {eligible:false,reason:"toi_platform_overtime_or_unit_unverified"};
 if(market==="goalieFantasyScore"&&source!=="PrizePicks")
  return {eligible:false,reason:"goalie_fantasy_platform_scoring_mismatch"};
 const scaled=rule.unit==="minutes"?60:1;
 const probability=estimateExperimentalMarketProbability({
  market:rule.stat,mean:estimate*scaled,line:raw*scaled,samples});
 if(!probability)return {eligible:false,reason:"market_distribution_not_usable"};
 const evidence={market,stat:rule.stat,sourceModel:rule.model,
  observations:samples.length,source:"official_NHL_past_final_game_player_stats",
  modelBuiltAt:new Date(builtAt).toISOString(),
  statRuleKnownFromUser:market==="goalieFantasyScore",
  firstPartyPlatformScoreAuthenticated:false,
  deploymentCalibrated:false,offeredSideSettledWithPlatform:false,
  distribution:probability.distribution};
 return {eligible:true,stat:rule.stat,estimate,model,
  probabilities:probability,evidence,modelReady:true,
  exactHistoricalStats:true,
  providerRuleVerified:true,experimentalResearchOnly:true};
}
module.exports={INDIVIDUAL_MARKETS,prepareExperimentalMarketOffer};
