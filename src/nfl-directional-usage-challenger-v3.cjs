"use strict";
/** NFL market-specific precommitted Higher/Lower/ABSTAIN shadow.
 * An opposite direction is a modeled hypothesis ONLY when it was genuinely
 * present in the originally observed independent source. Do not manufacture
 * PrizePicks offers, active status, calibrated confidence, or betting EV.
 */
const {attachNflAvailability}=require("./nfl-current-injury-evidence.cjs");
const KIND="nfl_rushing_and_combo_abstaining_challenger_20261120_v3";
const POLICY_EFFECTIVE="2026-11-21T00:00:00Z";
const REQUIREMENTS=Object.freeze({
 rushing_yards:{prior:16,relative:.22,absolute:9,consensus:.12},
 rushing_attempts:{prior:16,relative:.22,absolute:3,consensus:.12},
 rush_receive_yards:{prior:20,relative:.25,absolute:15,consensus:.15},
 receiving_yards:{prior:14,relative:.20,absolute:9,consensus:.1},
 passing_yards:{prior:14,relative:.16,absolute:20,consensus:.1},
 receptions:{prior:14,relative:.22,absolute:1,consensus:.1}
});
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const finite=Number.isFinite;
function assess(p,{now,injuries}={}){
 const skip=(reason,extra={})=>({status:"shadow_abstain",reason,
  originalDirectionNeverRewritten:true,calibratedProbability:null,
  bettingEligible:false,...extra});
 const cfg=REQUIREMENTS[p?.market],t=at(now),start=at(p?.eventStartsAt),source=at(p?.sourceObservedAt);
 if(!cfg||p.tier!=="Standard"||!["Higher","Lower"].includes(p.selectedSide)||
    p.selectedSide!==p.offeredSide||p.autoPickEligible!==false||
    p.probability!==null||!finite(p.line)||p.line<0||
    !finite(p.historicalProjection)||!finite(p.last5Baseline)||
    !Number.isInteger(p.priorRecordedGames)||!p.historicalPlayerId||
    ![t,start,source].every(finite)||source>t||t-source>1800000||
    start-t<900000)
  return skip("unverified_original_source_market_identity_or_clock");
 if(p.priorRecordedGames<cfg.prior)return skip("not_enough_prior_independent_player_games");
 const diff=p.historicalProjection-p.line,
  required=Math.max(cfg.absolute,cfg.relative*Math.abs(p.line));
 const sign=x=>x>p.line?"Higher":x<p.line?"Lower":"Abstain";
 const direction=sign(p.historicalProjection),recent=sign(p.last5Baseline);
 if(direction==="Abstain"||direction!==p.selectedSide)return skip("original_projection_side_inconsistent");
 if(recent!==direction)return skip("recent_usage_disagrees_with_original_direction");
 if(Math.abs(diff)<required)return skip("market_specific_direction_margin_too_small");
 if(Math.abs(p.last5Baseline-p.line)<required*cfg.consensus)
  return skip("recent_usage_margin_unconvincing");
 const avail=attachNflAvailability(p,injuries,now);
 if(avail.blocksResearch)return skip("explicit_official_report_injury_risk",{
  injuryStatus:avail.status});
 // This is conditional on appearances. No current official GSIS active
 // identity corroboration is assumed from a historical player mapping.
 return {status:"shadow_selected_research_only",
  reason:"market_specific_margin_and_prior_usage_confirm_direction",
  originalDirection:p.selectedSide,shadowDirection:direction,
  line:p.line,originalProjection:p.historicalProjection,priorLast5:p.last5Baseline,
  projectedMargin:diff,requiredMargin:required,priorRecordedGames:p.priorRecordedGames,
  officialGameDayActive:false,
  injuryEvidenceStatus:avail.status,identityBridgeResearchOnly:true,
  independentCurrentAppQuoteVerified:false,calibratedProbability:null,
  bettingEligible:false,originalDirectionNeverRewritten:true};
}
function freeze(s,{now=s?.createdAt,injuries=null}={}){
 const t=at(now),source=at(s?.sourceBoardAsOfAt);
 if(s?.kind!=="nfl_independent_partner_standard_directional_original_research_v1"||
    !Array.isArray(s.selections)||![t,source].every(finite)||source>t||t-source>1800000)
  throw Error("Fresh original NFL source required");
 const selected=new Set(),rows=[],reasons={};
 for(const p of s.selections){
  if(!REQUIREMENTS[p.market])continue;
  if(selected.has(p.id))throw Error("Repeated original NFL source ID");
  selected.add(p.id);
  const result=assess(p,{now,injuries});
  if(result.status!=="shadow_selected_research_only")
   reasons[result.reason]=(reasons[result.reason]||0)+1;
  rows.push({originalId:p.id,sourceGameId:p.sourceGameId,
   historicalPlayerId:p.historicalPlayerId,season:p.season,week:p.week,
   originalMarket:p.market,originalLine:p.line,originalSide:p.selectedSide,
   originalSourceObservedAt:p.sourceObservedAt,eventStartsAt:p.eventStartsAt,
   ...result,originalSide:p.selectedSide,
   conditionalOnAppearance:true,firstGitProofRequired:true});
 }
 return {kind:KIND,createdAt:now,sourceBoardAsOfAt:s.sourceBoardAsOfAt,
  policyEffectiveAtOrAfter:POLICY_EFFECTIVE,rows,screened:rows.length,
  selected:rows.filter(r=>r.status==="shadow_selected_research_only").length,
  reasons,sourceSideNeverChanged:true,
  calibrationApproved:false,autoPicksApproved:false,
  authenticatedPlatformOffers:false,verifiedSettlementROI:null,placedWagers:0};
}
module.exports={KIND,POLICY_EFFECTIVE,REQUIREMENTS,assess,freeze};
