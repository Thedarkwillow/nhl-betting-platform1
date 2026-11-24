"use strict";
/**
 * Fixed, interpretable NHL Standard quality challenger for FUTURE snapshots.
 * No November 19 outcomes used for thresholds. Original offered side and
 * original incumbent forecast never overwritten. All scores uncalibrated.
 */
const {assess:availability}=require("./nhl-pregame-availability-v2.cjs");
const KIND="nhl_standard_market_quality_challenger_20261120_v2";
const POLICY_EFFECTIVE="2026-11-21T00:00:00Z";
const LIMITS=Object.freeze({
 assists:{prior:20,opponent:10,ice:780,minSeparation:.075,rolePP:true},
 blockedShots:{prior:18,opponent:10,ice:720,minSeparation:.075,rolePP:false},
 shotsOnGoal:{prior:16,opponent:10,ice:690,minSeparation:.065,rolePP:false},
 points:{prior:16,opponent:8,ice:720,minSeparation:.065,rolePP:false}
});
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const finite=Number.isFinite;
const key=p=>[p.gameId,p.playerId,p.market,p.line,p.tier].join("|");
const opposite=x=>x==="Higher"?"Lower":"Higher";
function rate(x){return finite(x)&&x>=0&&x<=1?x:null;}
function assess(p,s,{now,official,external,officialGitAt,externalGitAt}={}){
 const skip=(reason,extra={})=>({status:"shadow_abstain",reason,...extra});
 const t=at(now??s?.generatedAt),start=at(p?.gameStartAt),observed=at(p?.capturedAt);
 const cfg=LIMITS[p?.market];
 if(!cfg||p?.tier!=="Standard"||!["Higher","Lower"].includes(p.lean)||
    !finite(p.line)||p.line<0||p.line%1!==.5||
    !Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
    ![t,start,observed].every(finite)||start-t<900000||observed>t||t-observed>1800000)
  return skip("invalid_original_prop_market_or_clock");
 const injury=availability(p,{now:new Date(t).toISOString(),
  official,external,officialGitAt,externalGitAt});
 if(injury.status==="abstain")return skip("unverified_or_negative_pregame_availability",{availability:injury});
 const exact=(x)=>key(x)===key(p)&&x.gameStartAt===p.gameStartAt&&
    x.capturedAt===p.capturedAt;
 const original=(s?.rankedProps||[]).filter(x=>exact(x)&&x.lean===p.lean);
 if(original.length!==1)return skip("original_offered_side_not_unique");
 const v=original[0];
 if(rate(v.probabilities?.higher)===null||
    (p.lean==="Higher"&&Math.abs(v.probabilities.higher-p.probability)>1e-5)||
    (p.lean==="Lower"&&Math.abs(v.probabilities.lower-p.probability)>1e-5))
  return skip("original_probability_vector_unverified");
 const a=(s.standardAdaptiveResearchV2?.rows||[]).filter(x=>
  exact(x)&&x.originalSide===p.lean);
 const z=(s.positionRateMatchupV2?.rows||[]).filter(x=>
  exact(x)&&x.side===p.lean);
 if(a.length!==1)return skip("missing_original_frozen_adaptive_evidence");
 const ev=a[0],pos=z.length===1?z[0]:null;
 if(!Number.isInteger(ev.priorGames)||ev.priorGames<cfg.prior||
    !Number.isInteger(ev.opponentGames)||ev.opponentGames<cfg.opponent||
    !Number.isInteger(ev.trainingGames)||ev.trainingGames<30||
    !Number.isInteger(ev.trainingDates)||ev.trainingDates<10||
    !finite(ev.expectedIceSeconds)||ev.expectedIceSeconds<cfg.ice||
    ev.opponentHistoryUsed!==true)
  return skip("insufficient_prior_usage_ice_time_or_opponent_sample");
 const learned=rate(ev.predictions?.learned),fixed=rate(ev.predictions?.fixed);
 if(learned===null||fixed===null)return skip("missing_both_model_components");
 if(Math.abs(learned-fixed)>.22)return skip("pregame_model_uncertainty_disagreement");
 const role=rate(pos?.probabilities?.offenseDefense?.higher);
 if(role===null||!finite(pos?.defenseFactor)||!finite(pos?.offenseFactor)||
   !Number.isInteger(pos?.defense?.last10?.games)||
   pos.defense.last10.games<5)
  return skip("unverified_position_and_opponent_coverage");
 if(cfg.rolePP){
  const pp=ev.pointsSourceEvidence;
  if(!ev.priorComponentVerified||pp?.projectedPP!== "pp1"&&
     pp?.projectedPP!=="pp2"||
     !Number.isInteger(pp.linemateCount)||pp.linemateCount<1)
   return skip("assists_power_play_or_linemate_role_unverified");
 }
 // The fixed coefficients below are prespecified hypotheses, NOT learned
 // probabilities. Shrink toward 50% to avoid false confidence inflation.
 const raw=.4*learned+.35*fixed+.25*role;
 const reliability=Math.min(.72,.35+.012*Math.min(25,ev.priorGames));
 const higher=.5+reliability*(raw-.5);
 const side=p.lean,selected=side==="Higher"?higher:1-higher;
 const separation=selected-.5;
 if(separation<cfg.minSeparation)return skip("no_credible_model_side_separation",{
   originalSide:side,shadowSelectedProbability:rate(selected),
   uncalibrated:true});
 const agree=[learned,fixed,role].every(x=>
   side==="Higher"?x>.5:x<.5);
 if(!agree)return skip("matched_components_disagree_with_original_offered_side");
 return {status:"shadow_selected_research_only",
  reason:"fixed_market_ice_time_opponent_and_model_agreement",
  market:p.market,originalSide:side,originalLine:p.line,
  originalUncalibratedSelected:p.probability,
  shadowSelectedProbability:Number(selected.toFixed(6)),
  originalAvailableSideConfirmedInArchivedBoard:true,
  priorGames:ev.priorGames,opponentGames:ev.opponentGames,
  expectedIceSeconds:ev.expectedIceSeconds,
  position:pos.position,
  opponentDefenseFactor:pos.defenseFactor,
  teamOffenseFactor:pos.offenseFactor,
  restDaysFromLastAppearance:ev.restDaysFromLastAppearance,
  opponentRateProxyNotFullMatchupCalibration:true,
  availability:injury,bettingEligible:false,calibrated:false};
}
function freeze(s,ctx={}){
 const t=at(s?.generatedAt);
 if(!finite(t)||!Array.isArray(s.individualPropSelections)||
    !Array.isArray(s.rankedProps))throw Error("Original NHL pregame freeze missing");
 const seen=new Set(),rows=[],reasons={};
 for(const p of s.individualPropSelections.filter(x=>x.tier==="Standard"&&LIMITS[x.market])){
  const k=key(p);
  if(seen.has(k))throw Error("Repeated original selected threshold");
  seen.add(k);
  const q=assess(p,s,{...ctx,now:s.generatedAt});
  if(q.status!=="shadow_selected_research_only")reasons[q.reason]=(reasons[q.reason]||0)+1;
  rows.push({gameId:p.gameId,playerId:p.playerId,tier:p.tier,market:p.market,
   line:p.line,capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,
   originalSide:p.lean,originalUncalibratedSelected:p.probability,
   ...q,originalSide:p.lean,modelSideNeverReversed:true,
   firstGitProofRequiredBeforeGame:true,platformSettlementVerified:false});
 }
 const output={kind:KIND,generatedAt:s.generatedAt,
  policyEffectiveAtOrAfter:POLICY_EFFECTIVE,
  rows,registered:rows.length,selected:rows.filter(r=>r.status==="shadow_selected_research_only").length,
  abstained:rows.filter(r=>r.status!=="shadow_selected_research_only").length,
  abstentionReasons:reasons,
  precommittedFixedHeuristicOnly:true,neverLearnFromCurrentGame:true,
  conditionalOnActualAppearance:true,uncalibrated:true,
  originalFrozenSelectionsUnchanged:true,automaticPicksApproved:false,
  modelPromoted:false,providerCalls:0,placedWagers:0};
 // Nested in the original V2 first-Git snapshot. No side flips, no backfit.
 output.pointsRoleFutureV3=require("./nhl-points-role-shadow-v3.cjs").freeze(
  {...s,standardQualityShadowV2:output});
 return output;
}
module.exports={KIND,POLICY_EFFECTIVE,LIMITS,assess,freeze,key};
