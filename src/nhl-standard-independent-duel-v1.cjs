"use strict";
/**
 * Genuine pregame, independent Higher/Lower statistical forecasts.
 * Separate from unchanged Standard quality-v2 and from selected original sides.
 * Counterfactual opposite directions are NOT verified offered or bettable.
 */
const {LIMITS,key}=require("./nhl-standard-quality-challenger-v2.cjs");
const KIND="nhl_standard_independent_input_duel_20261120_v1";
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const ok=x=>Number.isFinite(x)&&x>=0&&x<=1;
const cap=(x,a,b)=>Math.min(b,Math.max(a,x));
const side=x=>!ok(x)||Math.abs(x-.5)<1e-9?null:x>.5?"Higher":"Lower";
function predict(p,adaptive,position){
 const same=x=>key(x)===key(p)&&x.capturedAt===p.capturedAt&&
   x.gameStartAt===p.gameStartAt;
 const a=(adaptive?.rows||[]).filter(x=>same(x)&&x.originalSide===p.lean);
 const z=(position?.rows||[]).filter(x=>same(x)&&x.side===p.lean);
 if(a.length!==1)return {status:"missing_adaptive_evidence",models:null};
 const e=a[0],pos=z.length===1?z[0]:null,
   learned=e.predictions?.learned,fixed=e.predictions?.fixed,
   role=pos?.probabilities?.offenseDefense?.higher,
   usage=pos?.probabilities?.usage?.higher;
 // Do not create a model if the pregame training was not actually adequate.
 if(!Number.isInteger(e.priorGames)||e.priorGames<8||
   !Number.isInteger(e.trainingGames)||e.trainingGames<30||
   !Number.isInteger(e.trainingDates)||e.trainingDates<10||
   !Number.isFinite(e.expectedIceSeconds)||e.expectedIceSeconds<480||
   !ok(learned)||!ok(fixed))
   return {status:"insufficient_pregame_history_or_model",models:null};
 const reliable=Math.min(.72,.35+.012*Math.min(25,e.priorGames)),
   shrink=q=>Number(cap(.5+reliable*(q-.5),.001,.999).toFixed(6)),
   output={
     statisticalNoOpponent:shrink((.4*learned+.35*fixed)/.75),
     statisticalNoLearned:ok(role)?shrink(.75*fixed+.25*role):null,
     statisticalFixedOnly:shrink(fixed),
     statisticalWithMatchup:ok(role)?shrink(.4*learned+.35*fixed+.25*role):null,
     positionUsageOnly:ok(usage)?shrink(usage):null
   };
 return {status:ok(role)?"past_only_ensemble_with_position":"position_opponent_missing",
  models:output,priorGames:e.priorGames,expectedIceSeconds:e.expectedIceSeconds,
  opponentGames:e.opponentGames,opponentHistoryUsed:e.opponentHistoryUsed===true,
  powerPlayRoleVerified:e.pointsSourceEvidence?.projectedPP==="pp1"||
    e.pointsSourceEvidence?.projectedPP==="pp2",
  opponentFactorVerified:Number.isFinite(pos?.defenseFactor)&&
    Number.isFinite(pos?.offenseFactor)&&
    (pos?.defense?.last10?.games??0)>=5,
  availabilityVerified:false};
}
function freeze(s,{currentAdaptive,currentPosition}={}){
 if(!Number.isFinite(at(s?.generatedAt))||
   !Array.isArray(s?.individualPropSelections)||!Array.isArray(s?.rankedProps))
   throw Error("Original pregame source absent");
 const originals=s.individualPropSelections.filter(x=>x.tier==="Standard"&&LIMITS[x.market]),
  seen=new Set(),rows=[];
 for(const p of originals){
  const k=key(p),t=at(s.generatedAt),start=at(p.gameStartAt),seenAt=at(p.capturedAt);
  if(seen.has(k))throw Error("Duplicate original offer identity");
  seen.add(k);
  const orig=s.rankedProps.filter(x=>key(x)===k&&x.lean===p.lean&&
    x.capturedAt===p.capturedAt&&x.gameStartAt===p.gameStartAt);
  // A real original board can include integer or push-capable thresholds.
  // Keep the full exact original population, but do not invent a binary
  // Higher/Lower forecast on an unsupported threshold.
  if(orig.length!==1)throw Error("Unmatched original offer identity");
  const pr=orig[0].probabilities||{},
    clockValid=[t,start,seenAt].every(Number.isFinite)&&
      start-t>=900000&&seenAt<=t&&t-seenAt<=1800000,
    identityValid=Number.isInteger(p.gameId)&&Number.isInteger(p.playerId)&&
      ["Higher","Lower"].includes(p.lean)&&Number.isFinite(p.line)&&p.line>=0,
    halfPoint=identityValid&&p.line%1===.5,
    probabilityValid=ok(pr.higher)&&ok(pr.lower)&&pr.push===0&&
      Math.abs(pr.higher+pr.lower-1)<=1e-5,
    sourceEligible=clockValid&&identityValid&&halfPoint&&probabilityValid,
    sourceEligibilityReason=sourceEligible?null:!clockValid?
      "original_clock_unverifiable":!identityValid?
      "original_identity_invalid":!halfPoint?
      "integer_or_nonhalf_line_unsupported": "original_binary_probability_unverifiable";
  const current=sourceEligible?predict(p,currentAdaptive,currentPosition):
      {status:sourceEligibilityReason,models:null},
    enriched=sourceEligible?predict(p,s.standardAdaptiveResearchV2,s.positionRateMatchupV2):
      {status:sourceEligibilityReason,models:null};
  const c=current.models,treatment=enriched.models;
  const independent={
    currentOnly:c?.statisticalWithMatchup??null,
    enriched:treatment?.statisticalWithMatchup??null,
    enrichedNoOpponent:treatment?.statisticalNoOpponent??null,
    enrichedNoLearned:treatment?.statisticalNoLearned??null,
    enrichedFixedOnly:treatment?.statisticalFixedOnly??null,
    enrichedUsageOnly:treatment?.positionUsageOnly??null
  };
  rows.push({gameId:p.gameId,playerId:p.playerId,market:p.market,tier:p.tier,
   line:p.line,capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,
   originalSide:p.lean,
   originalHigher:ok(pr.higher)?Number(pr.higher.toFixed(6)):null,
   sourceEligible,sourceEligibilityReason,
   sourceStatuses:{current:current.status,enriched:enriched.status},
   pregameEvidence:{currentPriorGames:current.priorGames??null,
    enrichedPriorGames:enriched.priorGames??null,
    currentExpectedIceSeconds:current.expectedIceSeconds??null,
    enrichedExpectedIceSeconds:enriched.expectedIceSeconds??null,
    enrichedOpponentEvidence:enriched.opponentFactorVerified===true,
    enrichedPowerPlayRoleVerified:enriched.powerPlayRoleVerified===true},
   models:independent,
   predictedSides:Object.fromEntries(Object.entries(independent).map(([n,v])=>[n,side(v)])),
   originalSideAndLineUntouched:true,oppositeSideBookabilityVerified:false,
   playerParticipationVerified:false,platformSettlementVerified:false,
   bettingEligible:false});
 }
 return {kind:KIND,generatedAt:s.generatedAt,rows,registered:rows.length,
  independentHigherLowerForecasts:true,twoSeasonContextOnlyPreGame:true,
  conditionalOnOfficialAppearance:true,
  featuresNotIdentifiableFromFrozenVectors:["remove_expected_ice_time","remove_power_play_role_effect"],
  pprRoleCoverageReportedNotCausalAblation:true,
  fixedFormulaNotFittedOnProspectiveResults:true,probabilitiesUncalibrated:true,
  noActualOppositeSideOfferVerification:true,modelPromoted:false,
  bettingEligible:false,placedWagers:0};
}
module.exports={KIND,freeze,predict,side};