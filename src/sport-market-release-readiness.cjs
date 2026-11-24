"use strict";
/**
 * P02-08 / NFL-05 / NFL-08: market-by-market evidence queue.
 * A historical stat, official rules page or third-party line does not alone
 * make a Higher/Lower market fit for automatic research picks.
 */
const {NHL_MARKET_STATS,PRIZEPICKS_NHL_GOALIE_SCORING_V1}=
 require("./nhl-four-priority-markets.cjs");
const {MARKET_REGISTRY}=require("./nfl-market-registry.cjs");
const REQUIRED=Object.freeze([
 "originalTimestampedMarketOffer","exactPlatformSettlementVersion",
 "historicalPlayerGameStatIdentity","pregamePastOnlyProjection",
 "originalGitFrozenDirection","independentProspectiveValidation",
 "heldOutProbabilityCalibration"]);
function gradeEvidence(e={}){
 const missing=REQUIRED.filter(k=>e?.[k]!==true);
 return {missing,complete:missing.length===0,passed:REQUIRED.length-missing.length};
}
function marketReadiness({nhlEvidence={},nflEvidence={}}={}){
 const nhl=Object.entries(NHL_MARKET_STATS).map(([market,definition])=>{
  const evidence=gradeEvidence(nhlEvidence[market]);
  const goalieRule=market==="prizePicksGoalieFantasyScore"&&
   PRIZEPICKS_NHL_GOALIE_SCORING_V1.inAppScoringChartIndependentlyVerified!==true;
  return {sport:"NHL",market,playerType:definition.playerType,
   evidenceMissing:[...evidence.missing,...(goalieRule?["independent_prizepicks_goalie_scoring_chart"]:[])],
   sourceStage:definition.status,officialStatDoesNotProveAvailableOffer:true,
   automaticallySelectable:false,settlementEV:null};
 });
 const nfl=MARKET_REGISTRY.map(m=>{
  const evidence=gradeEvidence(nflEvidence[m.id]);
  return {sport:"NFL",market:m.id,group:m.group,
   evidenceMissing:evidence.missing,sourceStage:"research_unvalidated",
   automaticallySelectable:false,settlementEV:null};
 });
 return {schemaVersion:1,kind:"cross_sport_nhl_nfl_market_release_gate_audit_v1",
  nhlResearchMarketCount:nhl.length,nflMarketCount:nfl.length,
  nflKickingPuntingMarkets:nfl.filter(x=>/kick|punt|field.goal|fg|xp/i.test(x.group+" "+x.market)).length,
  eligibleAutomaticMarketCount:0,
  criteria:REQUIRED,nhl,nfl,
  // Even a supplied evidence map cannot silently promote current code into
  // a live recommendation path. Production requires a separate reviewed gate.
  noAutomaticModelPromotion:true,originalPlatformPayoutValidated:false,
  sourceUsageRightsRequireSeparateReview:true};
}
module.exports={REQUIRED,gradeEvidence,marketReadiness};
