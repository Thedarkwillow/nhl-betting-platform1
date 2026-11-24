"use strict";
/** Quote-dependent Goblin Power/Flex research. The standard published table
 * CANNOT price a lineup containing Goblins. No wager or implied quote.
 * Terms reference: PrizePicks Help Center /payouts updated 2026-10-19.
 */
const time=x=>typeof x==="string"?Date.parse(x):NaN;
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function deny(reason){
 return {kind:"quoted_goblin_power_flex_research_v1",status:"blocked",
  reason,eligibleForLineupResearch:false,entrySpecificTermsVerified:false,
  estimatedNetEV:null,verifiedActualPayoutEV:false,bettingEligible:false,
  recommendationsReleased:0,placedWagers:0};
}
function evaluate({legs,entryQuote,correlation,now}={}){
 const t=time(now);
 if(!Number.isFinite(t)||!Array.isArray(legs)||legs.length<2||legs.length>6||
  legs.some(l=>!l||typeof l.id!=="string"||!l.id||
    !["Standard","Goblin","Demon"].includes(l.tier)||
    !["Higher","Lower"].includes(l.side)||
    !Number.isFinite(time(l.startsAt))||time(l.startsAt)<=t||
    l.verifiedOriginalSide!==true||l.eligibleInPlatformApp!==true)||
  new Set(legs.map(l=>l.id)).size!==legs.length||
  !legs.some(l=>l.tier==="Goblin"))
  return deny("leg_identity_or_goblin_platform_availability_unverified");
 if(!entryQuote||entryQuote.kind!=="exact_prizepicks_entry_details_v1"||
  entryQuote.provider!=="PrizePicks"||
  entryQuote.firstPartyEntryDetailsVerified!==true||
  entryQuote.goblinSpecificMultiplierVerified!==true||
  entryQuote.originalSideEligibilityVerified!==true||
  !["Power","Flex"].includes(entryQuote.format)||
  entryQuote.pickCount!==legs.length||
  !Array.isArray(entryQuote.legIds)||entryQuote.legIds.length!==legs.length||
  entryQuote.legIds.some((id,i)=>id!==legs[i].id)||
  !Number.isFinite(time(entryQuote.verifiedAt))||
  time(entryQuote.verifiedAt)>t||
  t-time(entryQuote.verifiedAt)>5*60000||
  legs.some(l=>time(entryQuote.verifiedAt)>=time(l.startsAt))||
  !entryQuote.quotedPayoutByHits||
  entryQuote.sourceIsStandardReferenceTable!==false||
  entryQuote.feeAndBonusTermsVerified!==true||
  entryQuote.sameGameOrRelatedPickRestrictionsVerified!==true||
  entryQuote.promotionEligibilityVerified!==true)
  return deny("exact_goblin_entry_quote_or_platform_restrictions_unverified");
 // PrizePicks' October 2026 help center lists 2-pick Flex, but account
 // eligibility may vary: only the independently verified entry screen counts.
 const payout=entryQuote.quotedPayoutByHits;
 if(Object.keys(payout).length!==legs.length+1||
    Array.from({length:legs.length+1},(_,k)=>String(k)).some(k=>
      !Object.prototype.hasOwnProperty.call(payout,k)||
      !finite(payout[k])||payout[k]<0||payout[k]>2000))
   return deny("missing_outcome_specific_actual_entry_multiplier");
 if(entryQuote.format==="Power"&&
   Array.from({length:legs.length},(_,i)=>payout[i]).some(x=>x!==0))
  return deny("power_play_partial_win_quote_inconsistent");
 if(!correlation||correlation.kind!=="validated_joint_hit_count_distribution"||
  correlation.independentProspectiveTestPassed!==true||
  correlation.matchesExactLineupAndQuote!==true||
  !Array.isArray(correlation.probabilityByHits)||
  correlation.probabilityByHits.length!==legs.length+1||
  correlation.probabilityByHits.some(x=>!finite(x)||x<0||x>1)||
  Math.abs(correlation.probabilityByHits.reduce((a,b)=>a+b,0)-1)>1e-6)
  return deny("prospective_joint_correlation_distribution_not_verified");
 const gross=correlation.probabilityByHits.reduce((s,p,k)=>s+p*payout[k],0);
 // A scenario sensitivity number, never verified ROI or auto-bet permission.
 return {kind:"quoted_goblin_power_flex_research_v1",
  status:"research_scenario_only",format:entryQuote.format,pickCount:legs.length,
  goblinCount:legs.filter(x=>x.tier==="Goblin").length,
  exactEntryQuoteAt:entryQuote.verifiedAt,
  entrySpecificTermsVerified:true,correlationEvidencePresent:true,
  estimatedNetEV:gross-1,estimatedGrossReturn:gross,
  eligibleForLineupResearch:true,verifiedActualPayoutEV:false,
  bettingEligible:false,recommendationsReleased:0,placedWagers:0,
  originalAppAvailabilityRequired:true,marketSettlementsVerified:false,
  note:"Hypothetical per-unit EV conditional on provided pregame quote and validated joint distribution; no wager, expected profit guarantee or official settlement."};
}
module.exports={evaluate,deny};
