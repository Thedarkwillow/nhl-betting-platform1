"use strict";
/**
 * ORIGINAL FIRST-GIT future-only evaluation of two different PRE-GAME inputs
 * on the exact same offered Standard lines/directions and unchanged rules.
 * No retrofitted A/B; if either arm was not in the original Git snapshot
 * the trial is not scored. Grade DNP/missing official outcomes as pending.
 */
const {KIND,freeze}=require("./nhl-standard-input-frozen-ab-v1.cjs");
const quality=require("./nhl-standard-quality-challenger-v2.cjs");
const statistical=require("./nhl-standard-statistical-quality-v1.cjs");
const {review:one,officialOutcome,selectedVsSkippedSlates}=
 require("./nhl-standard-abstention-audit.cjs");
const TRIAL="nhl_standard_strict_same_original_input_ab_forward_v1";
const time=x=>typeof x==="string"?Date.parse(x):NaN;
const day=x=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(x)).map(v=>[v.type,v.value]));
 return [p.year,p.month,p.day].join("-");
};
function bucket(){
 return {registered:0,decided:0,pending:0,push:0,hits:0,higher:0,lower:0,
  games:new Set(),dates:new Set(),slateHits:new Map()};
}
function add(b,p,outcome){
 b.registered++;
 if(outcome.status!=="decided"){
  b[outcome.status==="push"?"push":"pending"]++;return;
 }
 b.decided++;
 const hit=Number(outcome.side===p.lean),higher=Number(outcome.side==="Higher"),
  d=day(p.gameStartAt),slate=b.slateHits.get(d)||{n:0,hits:0};
 b.hits+=hit;b.higher+=higher;b.lower+=1-higher;
 b.games.add(p.gameId);b.dates.add(d);
 slate.n++;slate.hits+=hit;b.slateHits.set(d,slate);
}
function summarize(b){
 return {registered:b.registered,decided:b.decided,
  pending:b.pending,push:b.push,correct:b.hits,
  distinctGames:b.games.size,distinctPacificSlates:b.dates.size,
  hitRate:b.decided?b.hits/b.decided:null,
  alwaysHigherOnExactSameLines:b.decided?b.higher/b.decided:null,
  alwaysLowerOnExactSameLines:b.decided?b.lower/b.decided:null};
}
function validate(f,policyCommittedAt){
 const s=f?.snapshot,ab=s?.standardQualityInputABV1,first=time(f?.firstGitCommittedAt),
  t=time(s?.generatedAt),p=time(policyCommittedAt);
 if(!Number.isFinite(p)||!Number.isFinite(t)||!Number.isFinite(first)||
  f.gitHistoryCount!==1||t<=p||first<t||first-t>15*60000||
  ab?.kind!==KIND||ab.status!=="precommitted_research_only"||
  ab.generatedAt!==s.generatedAt||ab.policy!==quality.KIND||
  ab.policyEffectiveAt!==quality.POLICY_EFFECTIVE||
  ab.controlVsTreatmentFixedPolicyCoefficientsIdentical!==true||
  ab.originalChampionUntouched!==true||
  ab.sameExactOriginalOfferSideAndLine!==true||
  ab.modelPromoted!==false||ab.calibrated!==false||
  ab.platformSettlementVerified!==false||
  !Array.isArray(s?.individualPropSelections)||
  !Array.isArray(s?.rankedProps)||
  !Array.isArray(ab?.control?.rows)||!Array.isArray(ab?.treatment?.rows)||
  s.standardQualityShadowV2?.kind!==quality.KIND||
  s.standardQualityShadowV2.generatedAt!==s.generatedAt||
  !Array.isArray(s.standardQualityShadowV2.rows))
  return {ok:false,why:"not_genuinely_first_git_precommitted_both_arms"};
 const eligible=s.individualPropSelections.filter(x=>
  x.tier==="Standard"&&quality.LIMITS[x.market]),
  expected=new Map(eligible.map(x=>[quality.key(x),x]));
 if(expected.size!==eligible.length||ab.originals!==eligible.length||
  ab.control.rows.length!==eligible.length||
  ab.treatment.rows.length!==eligible.length||
  s.standardQualityShadowV2.rows.length!==eligible.length)
  return {ok:false,why:"not_same_full_original_standard_population"};
 const canonical=m=>new Map(m.map(x=>[quality.key(x),x]));
 const control=canonical(ab.control.rows),enhanced=canonical(ab.treatment.rows),
  live=canonical(s.standardQualityShadowV2.rows);
 if([control,enhanced,live].some(m=>m.size!==expected.size))
  return {ok:false,why:"duplicate_original_exact_threshold"};
 for(const [k,o] of expected){
  const r=s.rankedProps.filter(x=>quality.key(x)===k&&
   x.lean===o.lean&&x.capturedAt===o.capturedAt&&
   x.gameStartAt===o.gameStartAt);
  // Never accept other days, late source offers or postgame rewritten rows.
  if(r.length!==1||!Number.isFinite(time(o.gameStartAt))||
   !Number.isFinite(time(o.capturedAt))||
   time(o.gameStartAt)-first<15*60000||time(o.capturedAt)>t||
   t-time(o.capturedAt)>30*60000)
   return {ok:false,why:"late_or_unverified_original_source_threshold"};
  for(const [arm,map] of [["control",control],["treatment",enhanced]]){
   const v=map.get(k);
   if(!v||v.originalSide!==o.lean||v.originalLine!==o.line||
      v.line!==o.line||v.capturedAt!==o.capturedAt||
      v.gameStartAt!==o.gameStartAt||v.modelSideNeverReversed!==true||
      v.platformSettlementVerified!==false||v.bettingEligible!==false||
      !["shadow_abstain","shadow_selected_research_only"].includes(v.status))
    return {ok:false,why:"source_or_"+arm+"_was_modified"};
  }
  const trow=enhanced.get(k),original=live.get(k);
  if(!original||trow.status!==original.status||
     trow.reason!==original.reason||trow.originalSide!==original.originalSide||
     trow.shadowSelectedProbability!==(original.shadowSelectedProbability??null))
   return {ok:false,why:"treatment_not_identical_to_original_challenger_shadow"};
 }
 return {ok:true,control,enhanced,eligible};
}
function validateConditional(f,strict,policyCommittedAt){
 const s=f.snapshot,ab=s.standardQualityInputABV1,
  m=ab.statisticalConditional;
 if(!Number.isFinite(time(policyCommittedAt))||
  time(s.generatedAt)<=time(policyCommittedAt)||
  m?.status!=="precommitted_conditional_model_only"||
  m.kind!==statistical.KIND||m.generatedAt!==s.generatedAt||
  m.originalOfferPopulation!==strict.eligible.length||
  m.withoutPlayerAvailabilityClearance!==true||
  m.onlyGradeVerifiedOfficialAppearances!==true||
  m.bettingEligible!==false||m.modelPromoted!==false||
  !Array.isArray(m.control?.rows)||!Array.isArray(m.treatment?.rows)||
  m.control.qualityPolicy!==quality.KIND||
  m.treatment.qualityPolicy!==quality.KIND||
  m.control.rows.length!==strict.eligible.length||
  m.treatment.rows.length!==strict.eligible.length)
  return null;
 const expected=new Map(strict.eligible.map(p=>[quality.key(p),p])),
  c=new Map(m.control.rows.map(x=>[quality.key(x),x])),
  t=new Map(m.treatment.rows.map(x=>[quality.key(x),x]));
 if(c.size!==expected.size||t.size!==expected.size)return null;
 for(const [k,p] of expected){
  for(const rows of [c,t]){
   const q=rows.get(k);
   if(!q||q.originalLine!==p.line||q.originalSide!==p.lean||
      q.capturedAt!==p.capturedAt||q.gameStartAt!==p.gameStartAt||
      q.modelSideNeverReversed!==true||q.activePlayerVerified!==false||
      q.bettingEligible!==false||q.platformSettlementVerified!==false||
      !["shadow_selected_research_only","shadow_abstain"].includes(q.status))
     return null;
  }
 }
 return {control:c,enhanced:t};
}
function audit(frames,history,policyCommittedAt,statisticalPolicyCommittedAt=null){
 const conditionalFrames=[],conditionalExcluded={},
  conditionalBuckets=Object.fromEntries([
   "both_selected","enriched_only","current_only","both_skipped"
  ].map(x=>[x,bucket()])),
  conditionalControlSelected=bucket(),conditionalEnhancedSelected=bucket(),
  conditionalSeen=new Set();
 const valid=[],exclude={},subsets=Object.fromEntries([
  "both_selected","enriched_only","current_only","both_skipped"
 ].map(x=>[x,bucket()])),controlSelected=bucket(),enrichedSelected=bucket(),
 seen=new Set();
 const skip=why=>exclude[why]=(exclude[why]||0)+1;
 for(const f of [...(frames||[])].sort((a,b)=>
    time(a.firstGitCommittedAt)-time(b.firstGitCommittedAt))){
  const v=validate(f,policyCommittedAt);
  if(!v.ok){skip(v.why);continue;}
  const {snapshot:s}=f;
  valid.push(f);
  for(const p of v.eligible){
   const k=quality.key(p);
   if(seen.has(k))continue;seen.add(k);
   const a=v.control.get(k).status==="shadow_selected_research_only",
    b=v.enhanced.get(k).status==="shadow_selected_research_only";
   const group=a?(b?"both_selected":"current_only"):
     (b?"enriched_only":"both_skipped");
   const outcome=officialOutcome(p,history);
   add(subsets[group],p,outcome);
   if(a)add(controlSelected,p,outcome);
   if(b)add(enrichedSelected,p,outcome);
  }
  const conditional=validateConditional(f,v,statisticalPolicyCommittedAt);
  if(!conditional){
   conditionalExcluded.missing_or_not_first_git_statistical_shadow=
    (conditionalExcluded.missing_or_not_first_git_statistical_shadow||0)+1;
  }else{
   conditionalFrames.push(f);
   for(const p of v.eligible){
    const k=quality.key(p);
    // A second capture of exactly the same original threshold is NOT an
    // independent new trial observation, even when its quote time changed.
    // The first eligible post-policy, first-Git trial decision owns the key.
    if(conditionalSeen.has(k))continue;
    conditionalSeen.add(k);
    // The model-only arm is conditional on official appearance, not active proof.
    // The offer/line/side and actual outcome are always identical.
    const a=conditional.control.get(k).status==="shadow_selected_research_only",
      b=conditional.enhanced.get(k).status==="shadow_selected_research_only",
      group=a?(b?"both_selected":"current_only"):
       (b?"enriched_only":"both_skipped"),
      outcome=officialOutcome(p,history);
    add(conditionalBuckets[group],p,outcome);
    if(a)add(conditionalControlSelected,p,outcome);
    if(b)add(conditionalEnhancedSelected,p,outcome);
   }
  }
 }
 const controlFrames=valid.map(f=>({...f,snapshot:{
  ...f.snapshot,standardQualityShadowV2:f.snapshot.standardQualityInputABV1.control
 }}));
 const control=one(controlFrames,history),enriched=one(valid,history);
 const comparison=selectedVsSkippedSlates(enrichedSelected,controlSelected);
 const convertStatFrames=which=>conditionalFrames.map(f=>({...f,snapshot:{
  ...f.snapshot,standardQualityShadowV2:{
   ...f.snapshot.standardQualityInputABV1.statisticalConditional[which],
   kind:quality.KIND,
   modelPromoted:false,
   bettingEligible:false,
   conditionalOnOfficialAppearance:true,
   activePlayerVerified:false
  }
 }}));
 const conditionalControl=one(convertStatFrames("control"),history),
  conditionalEnhanced=one(convertStatFrames("treatment"),history),
  conditionalComparison=selectedVsSkippedSlates(
   conditionalEnhancedSelected,conditionalControlSelected);
 const conditionalReport={
  kind:"nhl_strict_statistical_input_ab_conditional_on_appearance_forward_v1",
  policyCommittedAt:statisticalPolicyCommittedAt,
  acceptedOriginalFullBoardFrames:conditionalFrames.length,
  originalExactThresholds:conditionalBuckets.both_selected.registered+
   conditionalBuckets.enriched_only.registered+
   conditionalBuckets.current_only.registered+
   conditionalBuckets.both_skipped.registered,
  excludedFrames:conditionalExcluded,
  repeatedOriginalThresholdsExcludedFromConditionalScore:
   conditionalFrames.reduce((n,f)=>n+
    f.snapshot.individualPropSelections.filter(p=>p.tier==="Standard"&&
     quality.LIMITS[p.market]).length,0)-conditionalSeen.size,
  firstEligiblePostPolicyOriginalThresholdWins:true,
  currentOnly:conditionalControl,enriched:conditionalEnhanced,
  cohorts:Object.fromEntries(Object.entries(conditionalBuckets).map(
   ([k,b])=>[k,summarize(b)])),
  sameSlateEnrichedMinusCurrentSelected:conditionalComparison,
  descriptiveObservedSelectionAccuracyDifference:
   conditionalControl.selected.decided&&conditionalEnhanced.selected.decided?
   conditionalEnhanced.selected.selectedDirectionalHitRate-
    conditionalControl.selected.selectedDirectionalHitRate:null,
  minimumIndependentSampleMet:
   conditionalControl.selected.decided>=200&&
   conditionalEnhanced.selected.decided>=200&&
   conditionalComparison.overlappingPacificSlates>=20&&
   conditionalEnhanced.selected.distinctGames>=30&&
   conditionalControl.selected.distinctGames>=30,
  statisticalModelConditionalOnly:true,
  noInferredPlayerParticipation:true,
  noSportsbookAvailabilityOrSettlementVerified:true,
  modelPromoted:false,calibrated:false,bettingEligible:false,
  accuracyAdvantageVerified:false,automaticPicksApproved:false,
  placedWagers:0,
  note:"Experimental accuracy given an official appearance; never place a bet or infer active status. Comparisons of changing selections are descriptive and need robust future sampling."
 };
 const result={
  kind:TRIAL,policyCommittedAt:policyCommittedAt??null,
  acceptedOriginalFullBoardFrames:valid.length,
  originalExactThresholds:seen.size,excludedFrames:exclude,
  control:control,enhanced:enriched,
  statisticalConditional:conditionalReport,
  cohorts:Object.fromEntries(Object.entries(subsets).map(([k,b])=>[k,summarize(b)])),
  enrichedMinusControlSelectedAccuracy:
   enriched.selected.decided&&control.selected.decided?
   enriched.selected.selectedDirectionalHitRate-
    control.selected.selectedDirectionalHitRate:null,
  enrichedMinusCurrentSelectedPairedSlates:comparison,
  bothArmsSameOfferIdentities:true,
  originalHigherLowerDirectionsNeverReversed:true,
  minimumIndependentSampleMet:
   control.selected.decided>=200&&enriched.selected.decided>=200&&
   control.selected.distinctPacificSlates>=20&&
   enriched.selected.distinctPacificSlates>=20&&
   comparison.overlappingPacificSlates>=20,
  strongerInputsOutperformSimpleBaselinesProven:false,
  strongerInputsOutperformControlProven:false,
  abStabilityApproved:false,calibrationApproved:false,
  productionPolicyChanged:false,modelPromoted:false,
  prizePicksOrUnderdogAppSettlementVerified:false,
  bettingEligible:false,verifiedExpectedValue:null,
  actualWagersPlaced:0,
  note:"All arms must be in same original first-Git pregame snapshot. Compare selected/abstained under each fixed rule and always Higher/Lower on the exact same selected lines. Unequal selection sets and slate dependence make observed hit-rate differences noncausal; no model promotion."
 };
 return result;
}
module.exports={TRIAL,audit,validate};
