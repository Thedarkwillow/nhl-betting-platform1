"use strict";
/**
 * Conservative audit of uncalibrated NHL research probabilities.
 * This is an ABSTENTION/labeling policy, not calibration or a new forecast.
 * Never change the model's raw probability or pretend a held-out hit rate.
 */
const VERSION="nhl-raw-probability-evidence-gate-v1";
function assessNhlResearchProbability(p){
 const reasons=[];
 if(!Number.isFinite(p?.probability)||p.probability<=0||p.probability>=1)
  reasons.push("invalid_probability");
 if(!Number.isInteger(p?.observations)||p.observations<10)
  reasons.push("fewer_than_10_historical_games");
 if(p?.market==="saves"||p?.roleEvidence?.starterStatus==="unconfirmed"&&
  ["saves","goalsAgainst","goalieFantasyScore"].includes(p?.market))
  reasons.push("pregame_goalie_start_not_verified");
 if(p?.researchEligibility==="watchlist"||
  p?.roleEvidence?.eligibleForResearchLineup===false)
  reasons.push("role_or_availability_watchlist");
 if(Number.isFinite(p?.probability)&&p.probability>=0.975)
  reasons.push("extreme_uncalibrated_model_estimate");
 if(p?.experimentalMarketResearchOnly===true)
  reasons.push("special_market_settlement_not_validated");
 // Unknown injuries remain a warning, not a fabricated negative finding.
 const hold=reasons.length>0;
 // Independent high-confidence evidence contract. Do not interpret a raw
 // directional model estimate, matchup proxy or source-only counts as proof.
 const playerProjectionVerified=Number.isFinite(p?.projection)&&p.projection>=0&&
  Number.isInteger(p?.observations)&&p.observations>=10;
 const opponentOpportunityVerified=p?.opponentOpportunity?.kind===
  "nhl_opponent_opportunity_verified_v1"&&
  p.opponentOpportunity.verified===true&&
  p.opponentOpportunity.evidenceQualified===true;
 const highConfidenceBlockers=[];
 if(!playerProjectionVerified)highConfidenceBlockers.push("verified_player_projection_missing");
 if(!opponentOpportunityVerified)highConfidenceBlockers.push("verified_opponent_opportunity_missing");
 highConfidenceBlockers.push("independent_calibration_and_original_platform_value_not_approved");
 return {
  version:VERSION,rawModelProbability:p?.probability??null,
  independentlyCalibrated:false,verifiedHistoricalHitRate:null,
  validBettingEdgeEstablished:false,automaticRecommendationEligible:false,
  highConfidenceEligible:false,playerProjectionVerified,opponentOpportunityVerified,
  highConfidenceBlockers,
  researchLineupEligible:!hold,confidenceLabel:hold?"hold_for_review":"uncalibrated_research",
  reasons,requiresFreshBoardAndNewPregameIdentity:true
 };
}
function auditNhlResearchProbabilities(props){
 const counts={evaluated:0,researchLineupEligible:0,onHold:0,reasons:{}};
 for(const p of props||[]){
  const gate=p?.probabilitySafety||assessNhlResearchProbability(p);
  counts.evaluated++;
  if(gate.researchLineupEligible)counts.researchLineupEligible++;
  else counts.onHold++;
  for(const reason of gate.reasons)
   counts.reasons[reason]=(counts.reasons[reason]||0)+1;
 }
 return {version:VERSION,...counts,
  measuredCalibration:null,verifiedProspectiveHitRate:null,
  measuredExpectedValue:null,
  note:"Abstention labels do not recalibrate the original probabilities. Need time-split validation against real offered pregame lines and official outcomes."};
}
module.exports={VERSION,assessNhlResearchProbability,auditNhlResearchProbabilities};
