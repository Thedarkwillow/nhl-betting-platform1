"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const quality=require("../src/nhl-standard-quality-challenger-v2.cjs");
const freeze=require("../src/nhl-standard-input-frozen-ab-v1.cjs").freeze;
const {audit,validate}=require("../src/nhl-standard-input-ab-future-scorecard-v1.cjs");
const created="2026-11-21T01:00:00Z",
 first="2026-11-21T01:00:30Z",cut="2026-11-21T00:30:00Z",
 start="2026-11-23T01:00:00Z",captured="2026-11-21T00:55:00Z";
const fake=(id)=>({gameId:2026020510+id,playerId:8482300+id,
 market:"shotsOnGoal",tier:"Standard",lean:"Higher",line:2.5,
 capturedAt:captured,gameStartAt:start,probability:.8,team:"BOS",opponent:"MTL"});
const n=(p,prior=20,learned=.82)=>({
 ...p,originalSide:p.lean,priorGames:prior,opponentGames:16,
 trainingGames:180,trainingDates:24,expectedIceSeconds:850,
 opponentHistoryUsed:true,priorComponentVerified:true,
 predictions:{learned,fixed:learned},pointsSourceEvidence:null
});
const d=p=>({...p,side:p.lean,position:"C",defenseFactor:1.04,
 offenseFactor:1.02,defense:{last10:{games:10}},
 probabilities:{offenseDefense:{higher:.82}}});
function sample(){
 const props=Array.from({length:4},(_,i)=>fake(i+1));
 const s={generatedAt:created,individualPropSelections:props,
  rankedProps:props.map(x=>({...x,probabilities:{higher:.8,lower:.2,push:0}}))};
 const treatment={kind:"adaptive",generatedAt:created,modelPromoted:false,
  rows:props.map((p,i)=>n(p,i===3?7:22,i===2?.52:.82))};
 const control={kind:"adaptive",generatedAt:created,modelPromoted:false,
  rows:props.map((p,i)=>n(p,i===1?7:i===3?7:22,.82))};
 const position={kind:"position",generatedAt:created,modelPromoted:false,
  rows:props.map(d)};
 const treatmentSnapshot={...s,standardAdaptiveResearchV2:treatment,
  positionRateMatchupV2:position};
 treatmentSnapshot.standardQualityShadowV2=quality.freeze(treatmentSnapshot);
 const source={available:true,seasons:["2025-26","2026-27"]};
 const ab=freeze(treatmentSnapshot,{
  currentAdaptive:control,currentPosition:position,inputSource:source
 });
 return {props,ab,snapshot:{...treatmentSnapshot,standardQualityInputABV1:ab},source,
  control,position};
}
const frame=snapshot=>({snapshot,firstGitCommittedAt:first,gitHistoryCount:1});
const official=(p,x)=>({gameId:p.gameId,playerId:p.playerId,type:"skater",
 gameState:"FINAL",timeOnIceSeconds:900,shotsOnGoal:x});
test("Both precommitted arms cover exactly the same offered original props with unchanged strict policy",()=>{
 const {props,ab,snapshot}=sample();
 a.equal(ab.status,"precommitted_research_only");
 a.equal(ab.originals,4);
 a.equal(ab.control.rows.length,4);
 a.equal(ab.treatment.rows.length,4);
 a.equal(ab.control.selected,2);
 a.equal(ab.treatment.selected,2);
 a.equal(ab.originalChampionUntouched,true);
 a.equal(ab.statisticalConditional.status,"precommitted_conditional_model_only");
 a.equal(ab.statisticalConditional.control.selected,2);
 a.equal(ab.statisticalConditional.treatment.selected,2);
 a.equal(ab.statisticalConditional.bettingEligible,false);
 a.equal(ab.statisticalConditional.withoutPlayerAvailabilityClearance,true);
 a.equal(ab.controlVsTreatmentFixedPolicyCoefficientsIdentical,true);
 a.equal(ab.modelPromoted,false);
 for(const p of props){
  const c=ab.control.rows.find(x=>x.playerId===p.playerId),
   t=ab.treatment.rows.find(x=>x.playerId===p.playerId);
  a.equal(c.originalSide,p.lean);a.equal(t.originalSide,p.lean);
  a.equal(c.originalLine,p.line);a.equal(t.originalLine,p.line);
  a.equal(c.platformSettlementVerified,false);
  a.equal(t.bettingEligible,false);
 }
 a.equal(validate(frame(snapshot),cut).ok,true);
});
test("Results grade both, enriched-only, control-only, and skipped against same-line simple baselines",()=>{
 const {props,snapshot}=sample();
 const h={players:Object.fromEntries(props.slice(0,3).map((p,i)=>
   [String(p.playerId),{games:[official(p,[4,1,5][i])]}]))};
 const report=audit([frame(snapshot)],h,cut,"2026-11-21T00:15:00Z");
 a.equal(report.acceptedOriginalFullBoardFrames,1);
 a.equal(report.originalExactThresholds,4);
 a.equal(report.control.selected.registered,2);
 a.equal(report.control.selected.decided,2);
 a.equal(report.enhanced.selected.registered,2);
 a.equal(report.enhanced.selected.decided,2);
 a.equal(report.cohorts.both_selected.registered,1);
 a.equal(report.cohorts.enriched_only.registered,1);
 a.equal(report.cohorts.current_only.registered,1);
 a.equal(report.cohorts.both_skipped.registered,1);
 a.equal(report.cohorts.both_skipped.pending,1);
 a.equal(report.cohorts.enriched_only.correct,0);
 a.equal(report.cohorts.current_only.correct,1);
 a.equal(report.enrichedMinusControlSelectedAccuracy,-.5);
 a.equal(report.enhanced.selected.selectedDirectionalHitRate,.5);
 a.equal(report.enhanced.selected.alwaysLowerSameThresholdRate,.5);
 a.equal(report.control.selected.selectedDirectionalHitRate,1);
 a.equal(report.enrichedMinusCurrentSelectedPairedSlates.overlappingPacificSlates,1);
 a.equal(report.enrichedMinusCurrentSelectedPairedSlates.pairedSlate95,null);
 a.equal(report.strongerInputsOutperformSimpleBaselinesProven,false);
 a.equal(report.strongerInputsOutperformControlProven,false);
 a.equal(report.modelPromoted,false);
 a.equal(report.statisticalConditional.acceptedOriginalFullBoardFrames,1);
 a.equal(report.statisticalConditional.originalExactThresholds,4);
 a.equal(report.statisticalConditional.currentOnly.selected.decided,2);
 a.equal(report.statisticalConditional.enriched.selected.decided,2);
 a.equal(report.statisticalConditional.cohorts.enriched_only.registered,1);
 a.equal(report.statisticalConditional.cohorts.current_only.registered,1);
 a.equal(report.statisticalConditional.bettingEligible,false);
 a.equal(report.statisticalConditional.accuracyAdvantageVerified,false);
});
test("Repeated future first-Git captures of same market threshold are not independent evidence",()=>{
 const {props,snapshot}=sample();
 const h={players:{[String(props[0].playerId)]:{games:[official(props[0],4)]}}};
 const once=audit([frame(snapshot)],h,cut,"2026-11-21T00:15:00Z");
 const twice=audit([frame(snapshot),frame(snapshot)],h,cut,"2026-11-21T00:15:00Z");
 a.equal(once.statisticalConditional.originalExactThresholds,4);
 a.equal(twice.statisticalConditional.originalExactThresholds,4);
 a.equal(twice.statisticalConditional.cohorts.enriched_only.registered,1);
 a.equal(twice.statisticalConditional.enriched.selected.decided,
  once.statisticalConditional.enriched.selected.decided);
 a.equal(twice.statisticalConditional.repeatedOriginalThresholdsExcludedFromConditionalScore,4);
 a.equal(twice.statisticalConditional.firstEligiblePostPolicyOriginalThresholdWins,true);
});
test("No falsely prospective control if constructed only after original freeze or against stale changed source",()=>{
 const {snapshot,control,position}=sample();
 a.equal(audit([frame({...snapshot,standardQualityInputABV1:undefined})],{},cut).originalExactThresholds,0);
 a.equal(audit([{...frame(snapshot),gitHistoryCount:2}],{},cut).originalExactThresholds,0);
 a.equal(audit([frame(snapshot)],{},"2026-11-21T01:01:00Z").originalExactThresholds,0);
 a.equal(validate({...frame(snapshot),firstGitCommittedAt:start},cut).ok,false);
 const wrong=structuredClone(snapshot);
 wrong.standardQualityInputABV1.treatment.rows[0].status="shadow_abstain";
 a.equal(validate(frame(wrong),cut).ok,false);
 const wrongLine=structuredClone(snapshot);
 wrongLine.standardQualityInputABV1.control.rows[0].line=4.5;
 a.equal(validate(frame(wrongLine),cut).ok,false);
 const missing=structuredClone(snapshot);
 missing.standardQualityInputABV1.control.rows.pop();
 a.equal(validate(frame(missing),cut).ok,false);
 const fail=freeze(snapshot,{
  currentAdaptive:control,currentPosition:position,inputSource:null});
 a.equal(fail.status,"not_enrolled");
 a.equal(fail.modelPromoted,false);
});
