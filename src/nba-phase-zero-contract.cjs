"use strict";
/** NBA source contract only; NO NBA collector, prediction, confidence or picks.
 * Source access and redistribution rights require separate approval.
 */
const KIND="nba_phase_zero_source_integrity_contract_v1";
const MARKETS=new Set(["points","rebounds","assists","threePointersMade","steals","blocks",
  "turnovers","pointsReboundsAssists","pointsRebounds","pointsAssists","reboundsAssists","prizePicksFantasyScore"]);
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const validTime=x=>Number.isFinite(at(x));
function box(r){
 const fail=reason=>({usable:false,reason,kind:KIND,countsAsAppearance:false,
   officialStatGradingAllowed:false,publicDisplayApproved:false});
 if(!r||!Number.isInteger(r.gameId)||r.gameId<=0||
    !Number.isInteger(r.playerId)||r.playerId<=0||
    typeof r.team!=="string"||r.team.length<2||!validTime(r.gameStartAt)||
    !validTime(r.finalAt)||at(r.finalAt)<=at(r.gameStartAt)||
    !validTime(r.firstCapturedAt)||at(r.firstCapturedAt)<at(r.finalAt))
  return fail("invalid_game_player_or_official_final_clock");
 if(r.source!=="NBA official box score"||r.officialGameFinalVerified!==true||
    r.identityVerified!==true)return fail("official_final_identity_or_source_unverified");
 if(r.appeared!==true){
  if(r.appeared===false&&r.didNotPlayVerified===true&&
   r.minutes===null&&r.points===null&&r.rebounds===null&&r.assists===null)
   return {usable:true,kind:KIND,reason:"official_nonappearance_void_pending_platform",
    countsAsAppearance:false,officialStatGradingAllowed:false,publicDisplayApproved:false};
  return fail("missing_box_row_not_an_assumed_dnp_or_zero");
 }
 if(!Number.isFinite(r.minutes)||r.minutes<=0||r.minutes>70||
    !["points","rebounds","assists","threePointersMade","steals","blocks","turnovers"].every(m=>
      Number.isInteger(r[m])&&r[m]>=0))
  return fail("appearing_player_missing_official_nonnegative_stats");
 return {usable:true,kind:KIND,reason:"official_historical_appearing_box",
  countsAsAppearance:true,officialStatGradingAllowed:true,
  publicDisplayApproved:false,
  commercialLicenseClaimNotIndependentlyReviewed:r.commercialRedistributionLicenseVerified===true};
}
function offer(r,now){
 const fail=reason=>({kind:KIND,validForResearch:false,reason,
  appOfferAuthenticated:false,modelCalibrated:false,bettingEligible:false});
 if(!r||!["PrizePicks","Underdog"].includes(r.platform)||!r.sourceOfferId||
   !Number.isInteger(r.gameId)||!Number.isInteger(r.playerId)||
   !["Standard","Goblin","Demon"].includes(r.tier)||!MARKETS.has(r.market)||
   r.period!=="full_game"||!["Higher","Lower"].includes(r.offeredSide)||
   !Number.isFinite(r.line)||r.line<0||!validTime(r.sourceObservedAt)||
   !validTime(r.gameStartAt)||!validTime(now)||at(r.sourceObservedAt)>at(now)||
   at(now)-at(r.sourceObservedAt)>30*60000||at(r.gameStartAt)-at(now)<15*60000)
  return fail("missing_original_exact_offer_semantics_or_clock");
 if(r.originalBoardPageComplete!==true||r.playerIdentityVerified!==true||
   r.gameIdentityVerified!==true)return fail("board_scope_or_identity_not_verified");
 // An independently sourced quote is not an authenticated app offer.
 return {kind:KIND,validForResearch:true,
  reason:"independent_observed_nba_offer_research_only",
  appOfferAuthenticated:false,
  claimantFlagNotIndependentlyVerified:r.originalAppCryptographicVerification===true,
  commercialPublicRedistributionApproved:false,
  modelCalibrated:false,bettingEligible:false};
}
function readiness({officialFinals=[],board=[],now}={}){
 const boxStats=officialFinals.map(box),offers=board.map(x=>offer(x,now));
 return {kind:KIND,nbaModelsTrained:false,nbaLiveRankingsApproved:false,
  officialAppearingHistoricalRows:boxStats.filter(x=>x.countsAsAppearance).length,
  verifiedHistoricalNonappearances:boxStats.filter(x=>x.usable&&!x.countsAsAppearance).length,
  originalCurrentResearchOffers:offers.filter(x=>x.validForResearch).length,
  unverifiedHistoricalRows:boxStats.filter(x=>!x.usable).length,
  unverifiedSourceOfferRows:offers.filter(x=>!x.validForResearch).length,
  prospectivelyValidated:false,calibratedProbabilities:false,verifiedExpectedValue:null,
  lineupReleaseApproved:false,paidCallsMade:0};
}
module.exports={KIND,MARKETS,box,offer,readiness};
