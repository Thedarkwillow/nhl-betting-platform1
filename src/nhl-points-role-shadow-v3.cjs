"use strict";
/**
 * Post-Nov22 research-only prospective NHL POINTS selection V3.
 * Deliberately selective: requires frozen v2 model approval PLUS prior
 * power-play/teammate and opposing-position evidence. This is a HYPOTHESIS,
 * not a demonstrated accuracy gain; never rewrite an original selection.
 * Evaluate only on future first-Git pregame snapshots.
 */
const {key}=require("./nhl-standard-quality-challenger-v2.cjs");
const KIND="nhl_points_usage_pp_opponent_future_shadow_20261123_v3";
const POLICY_EFFECTIVE="2026-11-24T00:00:00Z";
const at=x=>typeof x==="string"?Date.parse(x):NaN;
function assess(p,s){
 const skip=(reason)=>({status:"shadow_abstain",reason,bettingEligible:false,
  calibrated:false,modelPromoted:false,originalSideNeverChanged:true});
 const t=at(s?.generatedAt),observed=at(p?.capturedAt),start=at(p?.gameStartAt);
 if(p?.market!=="points"||p.tier!=="Standard"||!["Higher","Lower"].includes(p.lean)||
   !Number.isFinite(t)||!Number.isFinite(observed)||!Number.isFinite(start)||
   observed>t||t-observed>1800000||start-t<900000)
  return skip("not_exact_fresh_pregame_points");
 const exact=x=>key(x)===key(p)&&x.capturedAt===p.capturedAt&&x.gameStartAt===p.gameStartAt;
 const quality=s.standardQualityShadowV2;
 if(quality?.generatedAt!==s.generatedAt||!Array.isArray(quality.rows))
  return skip("quality_v2_not_frozen_with_original");
 const q=quality.rows.filter(x=>exact(x)&&x.originalSide===p.lean);
 if(q.length!==1||q[0].status!=="shadow_selected_research_only"||
    q[0].bettingEligible!==false||q[0].originalLine!==p.line)
  return skip("incumbent_quality_v2_abstained");
 const adaptive=s.standardAdaptiveResearchV2;
 if(adaptive?.generatedAt!==s.generatedAt||!Array.isArray(adaptive.rows))
  return skip("original_prior_usage_not_frozen");
 const a=adaptive.rows.filter(x=>exact(x)&&x.originalSide===p.lean);
 if(a.length!==1)return skip("original_prior_usage_identity_not_unique");
 const e=a[0],pp=e.pointsSourceEvidence||{};
 if(e.priorComponentVerified!==true||
   !["pp1","pp2"].includes(pp.projectedPP)||
   !Number.isInteger(pp.linemateCount)||pp.linemateCount<1)
  return skip("verified_power_play_and_teammates_missing");
 const position=s.positionRateMatchupV2;
 if(position?.generatedAt!==s.generatedAt||!Array.isArray(position.rows))
  return skip("opponent_position_source_missing");
 const o=position.rows.filter(x=>exact(x)&&x.side===p.lean);
 if(o.length!==1||!Number.isInteger(o[0].defense?.last10?.games)||
   o[0].defense.last10.games<8||
   !Number.isInteger(o[0].offense?.last10?.games)||
   o[0].offense.last10.games<8||
   !Number.isFinite(o[0].defenseFactor)||
   !Number.isFinite(o[0].offenseFactor)||
   o[0].defenseFactor<.8||o[0].defenseFactor>1.2||
   o[0].offenseFactor<.8||o[0].offenseFactor>1.2)
  return skip("opponent_defense_or_team_opportunity_not_sufficient");
 // A v2 uncalibrated probability is ONLY a research disagreement margin.
 // Never publish it as a wager hit probability, implied market EV, or edge.
 const probability=q[0].shadowSelectedProbability;
 if(!Number.isFinite(probability)||probability<.60||probability>1)
  return skip("points_model_margin_not_stable");
 return {status:"research_only_future_role_screen",reason:"prior_pp_teammates_opponent_and_model_agree",
  originalSide:p.lean,originalLine:p.line,opponentPriorGames:o[0].defense.last10.games,
  priorPlayerGames:e.priorGames,verifiedPriorPP:pp.projectedPP,
  historicalLinemateCount:pp.linemateCount,
  uncalibratedShadowMargin:Number((probability-.5).toFixed(5)),
  officialLivePPLineupVerified:false,independentlyVerifiedActive:false,
  originalPlatformOfferAuthenticated:false,bettingEligible:false,
  calibrated:false,modelPromoted:false,originalSideNeverChanged:true};
}
function freeze(s){
 if(!s||!Number.isFinite(at(s.generatedAt))||
   !Array.isArray(s.individualPropSelections))
  throw Error("Original NHL prospective snapshot required");
 if(at(s.generatedAt)<at(POLICY_EFFECTIVE))
  return {kind:KIND,status:"not_enrolled_before_policy",policyEffectiveAtOrAfter:POLICY_EFFECTIVE,
   generatedAt:s.generatedAt,rows:[],retained:0,modelPromoted:false,bettingEligible:false};
 const rows=[],seen=new Set(),reasons={};
 for(const p of s.individualPropSelections.filter(x=>x.market==="points"&&x.tier==="Standard")){
  const k=key(p);
  if(seen.has(k))throw Error("Repeated original points offered line");
  seen.add(k);
  const r=assess(p,s);
  if(r.status==="shadow_abstain")reasons[r.reason]=(reasons[r.reason]||0)+1;
  rows.push({gameId:p.gameId,playerId:p.playerId,market:p.market,tier:p.tier,
   line:p.line,capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,
   originalSide:p.lean,...r,originalSide:p.lean,firstGitBeforePuckRequired:true});
 }
 return {kind:KIND,policyEffectiveAtOrAfter:POLICY_EFFECTIVE,
  generatedAt:s.generatedAt,rows,registered:rows.length,
  retained:rows.filter(x=>x.status==="research_only_future_role_screen").length,
  reasons,source:"original_same_snapshot_prior_games_only",
  firstGitCommitBeforePuckRequired:true,
  outcomesNotUsedToSetFutureDirection:true,originalDirectionsUnchanged:true,
  retrospectiveGradingNotAllowed:true,calibrated:false,
  modelPromoted:false,bettingEligible:false,
  platformSettlementVerified:false,verifiedPayoutROI:null,actualWagersPlaced:0};
}
module.exports={KIND,POLICY_EFFECTIVE,assess,freeze};