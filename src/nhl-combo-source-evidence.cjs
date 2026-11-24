"use strict";
/**
 * Read-only evidence contract for COMBO stats. A PrizePicks or Underdog combo
 * could contain athletes from one game OR separate games; never force them
 * to share a game ID or use unrelated matches for a fake joint hit rate.
 * An original exact member identity must be present in structured source
 * metadata; parsing names from labels is NOT identity verification.
 */
const MARKETS=Object.freeze({
 shotsOnGoalCombo:{stat:"shotsOnGoal",role:"skater"},
 goalieSavesCombo:{stat:"saves",role:"goalie"},
 goalsCombo:{stat:"goals",role:"skater"}
});
const ts=x=>typeof x==="string"?Date.parse(x):NaN;
const gameId=x=>Number.isInteger(x)&&x>=1000000000&&x<=9999999999;
function validateStructuredComboSource(offer,history,{now=null}={}){
 const spec=MARKETS[offer?.market];
 if(!spec)return {valid:false,reason:"unknown_combo_statistic"};
 if(!Number.isFinite(offer?.line)||offer.line<0||
   !["sum"].includes(offer.scoringOperator)||
   !["full_game"].includes(offer.settlementPeriod))
  return {valid:false,reason:"exact_combo_scoring_operator_or_period_not_verified"};
 const captured=ts(offer.sourceCapturedAt),current=now===null?null:ts(now);
 if(!Number.isFinite(captured)||
   current!==null&&(!Number.isFinite(current)||captured>current||
    current-captured>30*60000))
  return {valid:false,reason:"stale_or_missing_original_combo_capture"};
 const members=offer.members;
 if(offer.membersProvenance!=="structured_original_source_metadata"||
   !Array.isArray(members)||members.length<2||members.length>3)
  return {valid:false,reason:"original_combo_members_not_structured"};
 const seen=new Set(),starts=new Set(),ids=[];
 for(const m of members){
  if(!Number.isInteger(m?.playerId)||m.playerId<=0||seen.has(m.playerId)||
    !gameId(m.officialGameId)||m.role!==spec.role||
    !Number.isFinite(ts(m.gameStartAt))||
    ts(m.gameStartAt)<=captured)
   return {valid:false,reason:"ambiguous_combo_member_identity_game_or_role"};
  const p=history?.players?.[String(m.playerId)];
  if(!p||p.type!==spec.role)
   return {valid:false,reason:"combo_member_not_in_official_NHL_history"};
  seen.add(m.playerId);starts.add(m.officialGameId);ids.push(m.playerId);
 }
 return {valid:true,market:offer.market,stat:spec.stat,
  memberCount:ids.length,officialPlayerIds:ids,
  originalGameIds:[...starts],
  relation:starts.size===1?"same_game":"cross_game",
  allMemberGamesNotStartedAtCapture:true,
  exactCombinedSettlementValue:null,verifiedJointHitProbability:null,
  acceptedForAutomaticHigherLower:false,acceptedForOptimizedLineups:false,
  sourceScoringAndPayoutSettlementIndependentlyVerified:false,
  analysisNextStep:starts.size===1?
   "Build same-game joint count distribution from exact aligned games and pregame evidence":
   "Build explicitly cross-game joint count distribution with matched separate event IDs and dates; no same-game samples can be fabricated"};
}
module.exports={MARKETS,validateStructuredComboSource};
