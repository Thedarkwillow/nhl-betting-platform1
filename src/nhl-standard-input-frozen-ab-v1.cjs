"use strict";
/**
 * Precommit a CONTROL (current-season-only) and TREATMENT (verified two-season
 * inputs) on EXACTLY the same ORIGINAL NHL Standard offer/line/side.
 * Both apply the existing fixed unchanged NHL Standard quality-v2 policy.
 * No retroactive A/B construction; both arms must be in the first Git freeze.
 */
const quality=require("./nhl-standard-quality-challenger-v2.cjs");
const statistical=require("./nhl-standard-statistical-quality-v1.cjs");
const independent=require("./nhl-standard-independent-duel-v1.cjs");
const KIND="nhl_standard_strict_original_offer_input_ab_v1";
const at=s=>typeof s==="string"?Date.parse(s):NaN;
const SK=Object.keys(quality.LIMITS);
function freeze(snapshot,{currentAdaptive,currentPosition,controlContext={},treatmentContext={},
  inputSource=null}={}){
 const base={kind:KIND,generatedAt:snapshot?.generatedAt??null,
  policy:quality.KIND,policyEffectiveAt:quality.POLICY_EFFECTIVE,
  originalOfferPopulationOnly:true,control:"current_2026_27_history",
  treatment:"recovered_2025_26_and_2026_27_history",
  sameExactOriginalOfferSideAndLine:true,originalChampionUntouched:true,
  controlVsTreatmentFixedPolicyCoefficientsIdentical:true,
  beforePuckDropFirstGitRequired:true,
  firstGitSourceAuditRequired:true,researchOnly:true,
  calibrated:false,platformSettlementVerified:false,
  modelPromoted:false,automaticPicksApproved:false,placedWagers:0};
 const refuse=reason=>({...base,status:"not_enrolled",reason,
  originals:0,control:null,treatment:null});
 if(!inputSource||inputSource.available!==true||
    inputSource.seasons?.join("|")!=="2025-26|2026-27")
  return refuse("two_season_archived_history_unavailable");
 if(!Number.isFinite(at(snapshot?.generatedAt))||
    at(snapshot.generatedAt)<at(quality.POLICY_EFFECTIVE)||
    !Array.isArray(snapshot.individualPropSelections)||
    !Array.isArray(snapshot.rankedProps))
  return refuse("original_freeze_clock_or_source_invalid");
 const t=snapshot.standardQualityShadowV2;
 if(!t||t.kind!==quality.KIND||t.generatedAt!==snapshot.generatedAt||
    !Array.isArray(t.rows)||t.modelPromoted!==false||
    !currentAdaptive||currentAdaptive.generatedAt!==snapshot.generatedAt||
    !Array.isArray(currentAdaptive.rows)||currentAdaptive.modelPromoted!==false||
    !currentPosition||currentPosition.generatedAt!==snapshot.generatedAt||
    !Array.isArray(currentPosition.rows)||currentPosition.modelPromoted!==false)
  return refuse("control_or_treatment_pregame_features_missing");
 let c;
 try{c=quality.freeze({...snapshot,
  standardAdaptiveResearchV2:currentAdaptive,
  positionRateMatchupV2:currentPosition},controlContext);}
 catch{return refuse("control_pregame_quality_policy_refused");}
 const orig=snapshot.individualPropSelections.filter(p=>
  p.tier==="Standard"&&SK.includes(p.market));
 const expected=new Map(orig.map(p=>[quality.key(p),p]));
 if(expected.size!==orig.length||c.rows.length!==orig.length||
    t.rows.length!==orig.length||c.generatedAt!==t.generatedAt)
  return refuse("not_full_exact_original_threshold_population");
 for(const arm of [c,t]){
  const seen=new Set();
  for(const q of arm.rows){
   const k=quality.key(q),o=expected.get(k);
   if(!o||seen.has(k)||q.originalSide!==o.lean||
      q.capturedAt!==o.capturedAt||q.gameStartAt!==o.gameStartAt||
      q.line!==o.line||q.platformSettlementVerified!==false||
      q.modelSideNeverReversed!==true||
      !["shadow_abstain","shadow_selected_research_only"].includes(q.status)||
      (q.status==="shadow_selected_research_only"&&q.bettingEligible!==false))
     return refuse("arm_not_exact_same_original_line_or_side");
   seen.add(k);
  }
  if(seen.size!==expected.size)return refuse("missing_original_threshold_in_arm");
 }
 // Preserve only precommitted decisions and required exact identity to avoid
 // duplicating raw opponent/player-source data or leaking private offers.
 const pack=arm=>({
  kind:quality.KIND,generatedAt:snapshot.generatedAt,
  registered:arm.registered,selected:arm.selected,abstained:arm.abstained,
  rows:arm.rows.map(q=>({
   gameId:q.gameId,playerId:q.playerId,market:q.market,line:q.line,
   tier:q.tier,capturedAt:q.capturedAt,gameStartAt:q.gameStartAt,
   originalSide:q.originalSide,originalLine:q.line,status:q.status,reason:q.reason,
   shadowSelectedProbability:q.shadowSelectedProbability??null,
   modelSideNeverReversed:true,
   platformSettlementVerified:false,bettingEligible:false
  })),
  modelPromoted:false,automaticPicksApproved:false
 });
 let conditional=null;
 try{
  const cStat=statistical.freeze({...snapshot,
   standardAdaptiveResearchV2:currentAdaptive,
   positionRateMatchupV2:currentPosition});
  const tStat=statistical.freeze(snapshot);
  if(cStat.rows.length===orig.length&&tStat.rows.length===orig.length&&
   cStat.generatedAt===snapshot.generatedAt&&tStat.generatedAt===snapshot.generatedAt&&
   cStat.qualityPolicy===quality.KIND&&tStat.qualityPolicy===quality.KIND){
   const valid=m=>m.rows.every(q=>{
    const p=expected.get(quality.key(q));
    return p&&q.originalLine===p.line&&q.originalSide===p.lean&&
     q.capturedAt===p.capturedAt&&q.gameStartAt===p.gameStartAt&&
     q.modelSideNeverReversed===true&&q.activePlayerVerified===false&&
     q.bettingEligible===false&&q.platformSettlementVerified===false;});
   if(valid(cStat)&&valid(tStat))
    conditional={kind:statistical.KIND,generatedAt:snapshot.generatedAt,
     status:"precommitted_conditional_model_only",
     originalOfferPopulation:orig.length,
     control:cStat,treatment:tStat,
     withoutPlayerAvailabilityClearance:true,
     bothModelsUnchangedDirections:true,
     onlyGradeVerifiedOfficialAppearances:true,
     bettingEligible:false,modelPromoted:false,
     firstGitRequired:true};
  }
 }catch{}
 if(!conditional)conditional={kind:statistical.KIND,generatedAt:snapshot.generatedAt,
  status:"not_enrolled_missing_statistical_evidence",
  modelPromoted:false,bettingEligible:false};
 let independentDuel=null;
 try{independentDuel=independent.freeze(snapshot,{currentAdaptive,currentPosition});}
 catch{independentDuel={kind:independent.KIND,status:"not_enrolled",rows:[],
  bettingEligible:false,modelPromoted:false};}
 return {...base,status:"precommitted_research_only",
  originals:orig.length,sourceSeasonNames:inputSource.seasons.slice(),
  control:pack(c),treatment:pack(t),statisticalConditional:conditional,
  independentDuel,
  noReversalOrNewBettingSide:true,
  selectionComparisonEligibleOnlyAfterFirstGitBeforeGame:true};
}
module.exports={KIND,freeze};
