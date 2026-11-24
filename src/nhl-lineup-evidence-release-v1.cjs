"use strict";
/**
 * Audit all 2-6 research-format lineups before anyone mistakes sensitivity
 * bounds for verified joint hit probabilities or positive payout-adjusted EV.
 * Never modify optimization, user account quotes, or settlement.
 */
const KIND="nhl_lineup_joint_and_payout_release_audit_v1";
const {referenceBounds,stressReferenceScenario}=require("./lineup-reference-payout-bounds.cjs");
const {inspectLineupDependencies}=require("./nhl-lineup-correlation-evidence.cjs");
function inspectLineup(lineup,format,size){
 if(!["power","flex"].includes(format)||!Number.isInteger(size)||
     size<2||size>6||format==="flex"&&size===2)return null;
 if(!Array.isArray(lineup?.picks)||lineup.picks.length!==size)
  return {size,format,status:"missing_full_original_lineup",eligible:false,
   verifiedJointProbability:null,verifiedPayoutEV:null};
 const picks=lineup.picks,structural=inspectLineupDependencies(picks);
 const standardOnly=picks.every(x=>x.tier==="Standard");
 const ps=picks.map(x=>x.probability);
 const finite=ps.every(x=>Number.isFinite(x)&&x>0&&x<1);
 const uniquePlayers=new Set(picks.map(x=>x.playerId)),uniqueGames=new Set(picks.map(x=>x.gameId));
 const reasons=[
  "original_platform_offer_and_available_sides_not_authenticated",
  "marginal_hit_probabilities_not_independently_calibrated",
  "prospective_joint_leg_dependence_not_validated",
  "exact_lineup_payout_and_settlement_not_authenticated"
 ];
 if(uniquePlayers.size!==size)reasons.push("duplicate_player_in_lineup");
 if(uniqueGames.size!==size)reasons.push("same_game_dependency_present");
 if(!standardOnly)reasons.push("mixed_or_special_tiers_require_exact_multiplier_quote");
 if(!finite)reasons.push("invalid_or_missing_individual_raw_probabilities");
 const bounds=standardOnly&&finite?referenceBounds(ps,format):null;
 const stress=standardOnly&&finite?stressReferenceScenario(ps,format):null;
 return {size,format,status:"unapproved_research_scenario",eligible:false,
  originalLineupPicks:size,distinctGames:uniqueGames.size,
  sharedGamePairs:structural.sharedGamePairs,structuredCorrelationOnly:true,
  referenceMarginalBounds:bounds,referenceStress:stress,
  boundsAreNotFittedJointProbabilities:true,independentScenarioNotAnEstimate:true,
  reasons,verifiedJointProbability:null,verifiedPayoutEV:null,
  platformPayoutVerified:false,actualWagerAuthorized:false};
}
function audit(snapshot){
 const lineups=snapshot?.privateFormatLineupResearch||{};
 const out={};
 for(const format of ["power","flex"]){
  const source=lineups[format]||{};
  for(let n=(format==="power"?2:3);n<=6;n++){
   const scenario=source[n]||source[String(n)];
   out[format+"_"+n]=inspectLineup(scenario,format,n);
  }
 }
 return {kind:KIND,status:"research_only_unverified_joint_probabilities",
  generatedAt:snapshot?.generatedAt||null,byFormat:out,
  inspected:Object.values(out).filter(x=>x?.status==="unapproved_research_scenario").length,
  approvedOptimizedLineups:0,verifiedJointProbability:null,
  verifiedExpectedValue:null,originalPlatformSettlementVerified:false,
  productionEligible:false,realWagersPlaced:0,providerCalls:0,
  note:"Reference-only marginal bounds and independence scenarios are not calibrated joint hit probabilities, real payout quotes, nor positive-EV recommendations."};
}
module.exports={KIND,inspectLineup,audit};
