"use strict";
/**
 * NHL full-game market ontology. Private backend contract, not a model
 * formula or a provider market/payout guarantee. Unknown/period props
 * fail closed until independently sourced and explicitly added here.
 */
const VERSION="nhl-market-registry-v3";
const normalize=s=>String(s??"").normalize("NFKD")
 .replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/[^a-z0-9]+/g," ").trim();
const MARKETS=Object.freeze({
 shotsOnGoal:{kind:"skater",aliases:["shots on goal","sog","shots","shot on goal"]},
 goals:{kind:"skater",aliases:["goals","goal"]},
 assists:{kind:"skater",aliases:["assists","assist"]},
 points:{kind:"skater",aliases:["points","point"]},
 blockedShots:{kind:"skater",aliases:["blocked shots","blocks","blocked shot"]},
 saves:{kind:"goalie",aliases:["goalie saves","saves","save"]},
 // Four user-priority markets are SOURCE-RECOGNIZED but remain shadow-only
 // until exact offered-line settlement and held-out calibration are verified.
 hits:{kind:"skater",aliases:["hits","hit"],researchOnly:true},
 timeOnIceSeconds:{kind:"skater",aliases:["time on ice","toi"],researchOnly:true},
 faceoffsWon:{kind:"skater",aliases:["faceoffs won","faceoff wins","face offs won"],researchOnly:true},
 goalieFantasyScore:{kind:"goalie",aliases:["goalie fantasy score","goalie fantasy points"],researchOnly:true,
  providerScoring:"user_provided_prizepicks_nhl_goalie_v1_shadow_not_platform_verified"},
 powerPlayPoints:{kind:"skater",aliases:["power play points","powerplay points","pp points"],researchOnly:true},
 goalsAgainst:{kind:"goalie",aliases:["goals allowed","goals against","goalie goals allowed"],researchOnly:true},
 plusMinus:{kind:"skater",aliases:["plus/minus","plusminus"],researchOnly:true},
 shotsOnGoalCombo:{kind:"combo",aliases:["shots on goal (combo)"],researchOnly:true,requiresExactPlayers:true},
 goalieSavesCombo:{kind:"combo",aliases:["goalie saves (combo)"],researchOnly:true,requiresExactPlayers:true},
 goalsCombo:{kind:"combo",aliases:["goals (combo)"],researchOnly:true,requiresExactPlayers:true}
});
const BY_ALIAS=new Map();
for(const [field,spec] of Object.entries(MARKETS)){
 for(const alias of spec.aliases){
  const key=normalize(alias);
  if(BY_ALIAS.has(key))throw Error("NHL market alias collision "+key);
  BY_ALIAS.set(key,field);
 }
}
const UNSUPPORTED=Object.freeze({
 "first goal scorer":"Not a full-game independent player count model",
 "1st period saves":"Period-specific rules and provenance not yet implemented"
});
function resolveMarket(label){return BY_ALIAS.get(normalize(label))||null;}
function validateOffer({market,period,tier,side,playerType=null,
 researchMode=false,modelReady=false,exactHistoricalStats=false,
 providerRuleVerified=false,exactComboIdentity=false}={}){
 const field=resolveMarket(market);
 if(!field)return {eligible:false,field:null,reason:"unsupported_market",registryVersion:VERSION};
 const p=normalize(period);
 if(p&&p!=="full game"&&p!=="game")
  return {eligible:false,field,reason:"non_full_game",registryVersion:VERSION};
 const t=normalize(tier),direction=String(side||"");
 if(!["standard","goblin","demon"].includes(t)||
  !["Higher","Lower"].includes(direction)||
  (t!=="standard"&&direction!=="Higher"))
  return {eligible:false,field,reason:"unavailable_side",registryVersion:VERSION};
 if(["skater","goalie"].includes(playerType)&&MARKETS[field].kind!==playerType)
  return {eligible:false,field,reason:"role_market_mismatch",registryVersion:VERSION};
 if(MARKETS[field].researchOnly===true){
  // Never mark these as verified production picks. Research-generated
  // Higher/Lower preferences can enter 2-6 pick RESEARCH lineups only
  // with exact official past stats, correct market rule and a model.
  if(!researchMode)return {eligible:false,field,
   reason:"research_shadow_not_validated_for_live_picks",
   registryVersion:VERSION,sourceMarketRecognized:true,
   supportedByResearchPipeline:true,fullGameOnly:true,
   calibrated:false,originalPlatformSettlementVerified:false};
  if(MARKETS[field].requiresExactPlayers)
   return {eligible:false,field,reason:exactComboIdentity?
    "joint_combo_model_not_validated":"exact_combo_player_identity_required",
    registryVersion:VERSION};
  if(!providerRuleVerified)return {eligible:false,field,
   reason:"provider_market_rule_unverified",registryVersion:VERSION};
  if(!modelReady||!exactHistoricalStats)return {eligible:false,field,
   reason:"experimental_model_or_official_history_unready",registryVersion:VERSION};
  return {eligible:true,field,reason:null,registryVersion:VERSION,
   researchOnly:true,productionEligible:false,
   calibrated:false,originalPlatformSettlementVerified:false,
   payoutVerified:false,roleType:MARKETS[field].kind};
 }
 return {eligible:true,field,reason:null,registryVersion:VERSION,
  payoutVerified:false,platformAvailabilityVerified:false,
  onlyFullGame:true,roleType:MARKETS[field].kind};
}
module.exports={VERSION,MARKETS,UNSUPPORTED,normalize,resolveMarket,validateOffer};
