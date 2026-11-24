"use strict";
/**
 * CONDITIONAL-ON-AN-OFFICIAL-APPEARANCE quality diagnostic.
 *
 * Replays the same fixed model/evidence gates as the unchanged production
 * strict-quality-v2 policy, but intentionally DOES NOT use medical,
 * active-roster, scratch or participation status to grant eligibility.
 * A statistical research pass is NEVER a sportsbook/PrizePicks pick.
 *
 * Refuse unmatched original offers, clocks, or invalid frozen pregame
 * training data; do not reconstruct these features after the game.
 */
const {KIND:LIVE_KIND,LIMITS,key,POLICY_EFFECTIVE}=
 require("./nhl-standard-quality-challenger-v2.cjs");
const KIND="nhl_standard_statistical_quality_conditional_on_official_appearance_v1";
const finite=Number.isFinite;
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const prob=x=>finite(x)&&x>=0&&x<=1?x:null;
function assess(p,s){
 const fail=reason=>({status:"shadow_abstain",reason});
 const t=dt(s?.generatedAt),start=dt(p?.gameStartAt),
  observed=dt(p?.capturedAt),cfg=LIMITS[p?.market];
 if(!cfg||p?.tier!=="Standard"||!["Higher","Lower"].includes(p?.lean)||
  !finite(p?.line)||p.line<0||p.line%1!==.5||
  !Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
  ![t,start,observed].every(finite)||start-t<900000||
  observed>t||t-observed>1800000)
  return fail("invalid_original_prop_market_or_clock");
 const same=x=>key(x)===key(p)&&x.gameStartAt===p.gameStartAt&&
  x.capturedAt===p.capturedAt;
 const original=s.rankedProps.filter(x=>same(x)&&x.lean===p.lean);
 if(original.length!==1)return fail("original_offered_side_not_unique");
 const v=original[0];
 if(prob(v.probabilities?.higher)===null||
  (p.lean==="Higher"&&Math.abs(v.probabilities.higher-p.probability)>1e-5)||
  (p.lean==="Lower"&&Math.abs(v.probabilities.lower-p.probability)>1e-5))
  return fail("original_probability_vector_unverified");
 const a=(s.standardAdaptiveResearchV2?.rows||[]).filter(x=>
   same(x)&&x.originalSide===p.lean),
  z=(s.positionRateMatchupV2?.rows||[]).filter(x=>
   same(x)&&x.side===p.lean);
 if(a.length!==1)return fail("missing_original_frozen_adaptive_evidence");
 const ev=a[0],pos=z.length===1?z[0]:null;
 if(!Number.isInteger(ev.priorGames)||ev.priorGames<cfg.prior||
  !Number.isInteger(ev.opponentGames)||ev.opponentGames<cfg.opponent||
  !Number.isInteger(ev.trainingGames)||ev.trainingGames<30||
  !Number.isInteger(ev.trainingDates)||ev.trainingDates<10||
  !finite(ev.expectedIceSeconds)||ev.expectedIceSeconds<cfg.ice||
  ev.opponentHistoryUsed!==true)
  return fail("insufficient_prior_usage_ice_time_or_opponent_sample");
 const learned=prob(ev.predictions?.learned),fixed=prob(ev.predictions?.fixed);
 if(learned===null||fixed===null)return fail("missing_both_model_components");
 if(Math.abs(learned-fixed)>.22)
  return fail("pregame_model_uncertainty_disagreement");
 const role=prob(pos?.probabilities?.offenseDefense?.higher);
 if(role===null||!finite(pos?.defenseFactor)||
  !finite(pos?.offenseFactor)||
  !Number.isInteger(pos?.defense?.last10?.games)||
  pos.defense.last10.games<5)
  return fail("unverified_position_and_opponent_coverage");
 if(cfg.rolePP){
  const pp=ev.pointsSourceEvidence;
  if(!ev.priorComponentVerified||pp?.projectedPP!=="pp1"&&
   pp?.projectedPP!=="pp2"||
   !Number.isInteger(pp.linemateCount)||pp.linemateCount<1)
    return fail("assists_power_play_or_linemate_role_unverified");
 }
 const raw=.4*learned+.35*fixed+.25*role,
  reliability=Math.min(.72,.35+.012*Math.min(25,ev.priorGames)),
  higher=.5+reliability*(raw-.5),
  selected=p.lean==="Higher"?higher:1-higher,
  separation=selected-.5;
 if(separation<cfg.minSeparation)
  return {status:"shadow_abstain",reason:"no_credible_model_side_separation",
   shadowSelectedProbability:prob(selected)};
 if(![learned,fixed,role].every(x=>p.lean==="Higher"?x>.5:x<.5))
  return fail("matched_components_disagree_with_original_offered_side");
 return {status:"shadow_selected_research_only",
  reason:"fixed_market_ice_time_opponent_and_model_agreement",
  shadowSelectedProbability:Number(selected.toFixed(6)),
  priorGames:ev.priorGames,opponentGames:ev.opponentGames,
  expectedIceSeconds:ev.expectedIceSeconds,
  conditionalOnOfficialAppearance:true,
  activePlayerVerified:false,appBookabilityVerified:false,
  bettingEligible:false,calibrated:false};
}
function freeze(s){
 if(!finite(dt(s?.generatedAt))||dt(s.generatedAt)<dt(POLICY_EFFECTIVE)||
  !Array.isArray(s?.rankedProps)||!Array.isArray(s?.individualPropSelections))
  throw Error("Original pregame Standard source required");
 const seen=new Set(),rows=[],reasons={};
 for(const p of s.individualPropSelections.filter(x=>
  x.tier==="Standard"&&LIMITS[x.market])){
  const k=key(p);
  if(seen.has(k))throw Error("Duplicate original Standard threshold");
  seen.add(k);
  const q=assess(p,s);
  if(q.status!=="shadow_selected_research_only")
    reasons[q.reason]=(reasons[q.reason]||0)+1;
  rows.push({gameId:p.gameId,playerId:p.playerId,
   market:p.market,tier:p.tier,line:p.line,originalLine:p.line,
   originalSide:p.lean,capturedAt:p.capturedAt,
   gameStartAt:p.gameStartAt,...q,bettingEligible:false,
   conditionalOnOfficialAppearance:true,
   activePlayerVerified:false,platformSettlementVerified:false,
   modelSideNeverReversed:true});
 }
 return {kind:KIND,qualityPolicy:LIVE_KIND,generatedAt:s.generatedAt,
  registered:rows.length,
  selected:rows.filter(x=>x.status==="shadow_selected_research_only").length,
  abstained:rows.filter(x=>x.status!=="shadow_selected_research_only").length,
  abstentionReasons:reasons,rows,modelPromoted:false,
  researchOnly:true,conditionalOnOfficialAppearance:true,
  medicalOrActiveStatusNotEvaluated:true,bettingEligible:false,
  originalSideAndLineUnchanged:true,calibrated:false,
  automaticPicksApproved:false,placedWagers:0};
}
module.exports={KIND,assess,freeze};
