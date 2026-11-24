"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const fixed=require("../src/nhl-standard-quality-challenger-v2.cjs");
const {freeze}=require("../src/nhl-standard-input-frozen-ab-v1.cjs");
const {audit}=require("../src/nhl-standard-independent-duel-scorecard-v1.cjs");
const when="2026-11-21T02:00:00Z",git="2026-11-21T02:00:30Z",
 start="2026-11-22T02:00:00Z",captured="2026-11-21T01:55:00Z";
function sample(){
 const props=Array.from({length:3},(_,i)=>({
  gameId:2026020501+i,playerId:8483001+i,
  market:"shotsOnGoal",tier:"Standard",lean:"Higher",line:2.5,
  capturedAt:captured,gameStartAt:start,probability:.8,
  team:"TOR",opponent:"BOS"}));
 const s={generatedAt:when,individualPropSelections:props,
  rankedProps:props.map(x=>({...x,probabilities:{higher:.8,lower:.2,push:0}}))};
 function adaptive(q){return {kind:"research",generatedAt:when,modelPromoted:false,
  rows:props.map((p,i)=>({...p,originalSide:p.lean,priorGames:24,
   opponentGames:12,trainingGames:150,trainingDates:24,
   expectedIceSeconds:900,opponentHistoryUsed:true,priorComponentVerified:true,
   predictions:{learned:i===0?q:.77,fixed:i===0?q:.76}}))};}
 const position={kind:"pos",generatedAt:when,modelPromoted:false,
  rows:props.map(p=>({...p,side:p.lean,position:"C",
   defenseFactor:1.05,offenseFactor:1.02,
   defense:{last10:{games:10}},probabilities:{
    usage:{higher:.51},offenseDefense:{higher:.75}}}))};
 s.standardAdaptiveResearchV2=adaptive(.79);
 s.positionRateMatchupV2=position;
 s.standardQualityShadowV2=fixed.freeze(s);
 s.standardQualityInputABV1=freeze(s,{
  currentAdaptive:adaptive(.20),currentPosition:position,
  inputSource:{available:true,seasons:["2025-26","2026-27"]}});
 const frame={snapshot:s,firstGitCommittedAt:git,gitHistoryCount:1};
 return {frame,props};
}
function stats(props){
 return {players:Object.fromEntries(props.slice(0,2).map((p,i)=>[
  String(p.playerId),{games:[{gameId:p.gameId,playerId:p.playerId,
   type:"skater",gameState:"FINAL",timeOnIceSeconds:900,
   shotsOnGoal:i?1:4}]}]))};
}
test("independent model precommits both directions separately without altering the original",()=>{
 const {frame,props}=sample(),v=frame.snapshot.standardQualityInputABV1.independentDuel;
 a.equal(v.kind,"nhl_standard_independent_input_duel_20261120_v1");
 a.equal(v.registered,3);
 a.equal(v.rows.length,3);
 a.equal(v.rows[0].originalSide,"Higher");
 a.equal(v.rows[0].predictedSides.currentOnly,"Lower");
 a.equal(v.rows[0].predictedSides.enriched,"Higher");
 a.equal(v.rows[0].models.enrichedNoOpponent!==null,true);
 a.equal(v.bettingEligible,false);
 a.equal(v.rows.every(r=>r.line===2.5&&r.oppositeSideBookabilityVerified===false),true);
 a.equal(frame.snapshot.individualPropSelections.length,props.length);
});
test("grades only genuine first-Git official appearance using paired exact lines",()=>{
 const {frame,props}=sample();
 const v=audit([frame],stats(props),"2026-11-21T00:30:00Z","2026-11-21T01:00:00Z");
 a.equal(v.framesAccepted,1);
 a.equal(v.originals,3);
 a.equal(v.completedDecisions,2);
 a.equal(v.overall.strictSameLineHeadToHead.decided,2);
 a.equal(v.overall.strictSameLineHeadToHead.distinctGames,2);
 a.equal(v.overall.strictSameLineHeadToHead.originalFrozenOfferedSideHitRate,.5);
 a.equal(v.notOfficiallyDecided,1);
 a.equal(v.overall.strictSameLineHeadToHead.flippedIndependentDirections>=1,true);
 a.equal(v.modelPromoted,false);
 a.equal(v.independentOutperformanceVerified,false);
 a.equal(v.overall.models.enriched.decided,2);
});
test("posthoc commits, mutated exact line and duplicate captures cannot enter trial",()=>{
 const {frame,props}=sample(),h=stats(props);
 a.equal(audit([{...frame,firstGitCommittedAt:"2026-11-23T05:00:00Z"}],h,
  "2026-11-21T00:30:00Z","2026-11-21T01:00:00Z").originals,0);
 a.equal(audit([{...frame,gitHistoryCount:2}],h,
  "2026-11-21T00:30:00Z","2026-11-21T01:00:00Z").originals,0);
 a.equal(audit([frame,frame],h,
  "2026-11-21T00:30:00Z","2026-11-21T01:00:00Z").originals,3);
 const changed=structuredClone(frame);
 changed.snapshot.standardQualityInputABV1.independentDuel.rows[0].line=4.5;
 a.equal(audit([changed],h,
  "2026-11-21T00:30:00Z","2026-11-21T01:00:00Z").originals,0);
});

test("one genuine original integer/push line abstains without vetoing the other half-point props",()=>{
 const {frame,props}=sample(),s=structuredClone(frame.snapshot);
 const bad={...props[0],gameId:2026020981,playerId:8483981,
  line:1,probability:.4};
 s.individualPropSelections.push(bad);
 s.rankedProps.push({...bad,probabilities:{higher:.4,lower:.4,push:.2}});
 const control=structuredClone(s.standardAdaptiveResearchV2);
 const pos=structuredClone(s.positionRateMatchupV2);
 s.standardQualityShadowV2=fixed.freeze(s);
 s.standardQualityInputABV1=freeze(s,{
  currentAdaptive:control,currentPosition:pos,
  inputSource:{available:true,seasons:["2025-26","2026-27"]}});
 const duel=s.standardQualityInputABV1.independentDuel;
 a.equal(s.standardQualityInputABV1.status,"precommitted_research_only");
 a.equal(duel.registered,4);
 a.equal(duel.rows.filter(x=>x.sourceEligible).length,3);
 const unsupported=duel.rows.find(x=>x.gameId===bad.gameId);
 a.equal(unsupported.sourceEligible,false);
 a.equal(unsupported.sourceEligibilityReason,"integer_or_nonhalf_line_unsupported");
 a.equal(unsupported.models.enriched,null);
 a.equal(unsupported.models.currentOnly,null);
 const result=audit([{...frame,snapshot:s}],stats(props),
  "2026-11-21T00:30:00Z","2026-11-21T01:00:00Z");
 a.equal(result.framesAccepted,1);
 a.equal(result.invalidOriginalThresholdsExcluded,1);
 a.equal(result.originals,4);
 a.equal(result.overall.strictSameLineHeadToHead.decided,2);
 a.equal(result.modelPromoted,false);
});
