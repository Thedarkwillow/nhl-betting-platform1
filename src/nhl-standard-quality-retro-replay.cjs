"use strict";
/**
 * RETROSPECTIVE DIAGNOSTIC ONLY of the fixed Nov 20 NHL Standard quality
 * heuristic on archived ORIGINAL pregame snapshot features. It is not a
 * precommitted evaluation: the rule was written after these game outcomes.
 * No missing postgame fields may be backfilled into the pregame model.
 * Availability must remain unverified (no historical future roster inference).
 */
const quality=require("./nhl-standard-quality-challenger-v2.cjs");
const {officialOutcome}=require("./nhl-standard-abstention-audit.cjs");
const {ci}=require("./nhl-prospective-slate-baseline-audit.cjs");
const KIND="nhl_standard_quality_v2_retro_frozen_features_diagnostic_20261120";
const CUTOFF=Date.parse("2026-11-21T00:00:00Z");
const timestamp=x=>typeof x==="string"?Date.parse(x):NaN;
const markets=new Set(Object.keys(quality.LIMITS));
function pacific(t){
 const z=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(t)).map(a=>[a.type,a.value]));
 return [z.year,z.month,z.day].join("-");
}
function bucket(){return {registered:0,pending:0,push:0,decided:0,correct:0,
 higher:0,lower:0,gameIds:new Set(),dates:new Set(),slatesLower:new Map(),
 slatesHigher:new Map()};}
function add(b,p,outcome){
 b.registered++;
 if(outcome.status!=="decided"){b[outcome.status==="push"?"push":"pending"]++;return;}
 b.decided++;b.gameIds.add(p.gameId);
 const day=pacific(p.gameStartAt);b.dates.add(day);
 const hit=Number(outcome.side===p.lean),high=Number(outcome.side==="Higher"),low=1-high;
 b.correct+=hit;b.higher+=high;b.lower+=low;
 for(const [map,delta] of [[b.slatesLower,hit-low],[b.slatesHigher,hit-high]]){
  const row=map.get(day)||{n:0,diff:0};row.n++;row.diff+=delta;map.set(day,row);
 }
}
function output(b){
 return {registered:b.registered,decided:b.decided,pending:b.pending,push:b.push,
  correct:b.correct,distinctGames:b.gameIds.size,distinctPacificSlates:b.dates.size,
  hitRate:b.decided?b.correct/b.decided:null,
  alwaysLowerOnSameLines:b.decided?b.lower/b.decided:null,
  alwaysHigherOnSameLines:b.decided?b.higher/b.decided:null,
  pairedSlate95VsLower:ci([...b.slatesLower.values()]),
  pairedSlate95VsHigher:ci([...b.slatesHigher.values()],{baseline:"Higher"})};
}
function replay(frames,history){
 const total=bucket(),selected=bucket(),skipped=bucket(),scopes={},
  reasons={},exclusions={},gateCoverage={},seen=new Set();
 let acceptedFrames=0,withOriginalFeatures=0;
 const increment=(where,key)=>where[key]=(where[key]||0)+1;
 for(const f of [...(frames||[])].sort((a,b)=>
   timestamp(a.firstCommittedAt)-timestamp(b.firstCommittedAt))){
  const s=f?.snapshot,created=timestamp(s?.generatedAt),git=timestamp(f?.firstCommittedAt);
  if(f?.gitHistoryCount!==1||!Number.isFinite(created)||!Number.isFinite(git)||
     created>=CUTOFF||git<created||git-created>=15*60000||
     !Array.isArray(s?.rankedProps)||!Array.isArray(s?.individualPropSelections)){
    increment(exclusions,"invalid_or_post_policy_original_git_frame");continue;
  }
  acceptedFrames++;
  const hasAdaptive=Array.isArray(s.standardAdaptiveResearchV2?.rows);
  const hasPos=Array.isArray(s.positionRateMatchupV2?.rows);
  if(hasAdaptive&&hasPos)withOriginalFeatures++;
  for(const p of s.individualPropSelections.filter(r=>r.tier==="Standard"&&markets.has(r.market))){
   const k=quality.key(p),obs=timestamp(p.capturedAt),start=timestamp(p.gameStartAt);
   if(seen.has(k))continue;
   if(!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
      !["Higher","Lower"].includes(p.lean)||!Number.isFinite(p.line)||
      p.line<0||p.line%1!==.5||![obs,start].every(Number.isFinite)||
      obs>created||created-obs>30*60000||start-git<15*60000||
      s.rankedProps.filter(x=>quality.key(x)===k&&
       x.lean===p.lean&&x.capturedAt===p.capturedAt&&
       x.gameStartAt===p.gameStartAt).length!==1){
    increment(exclusions,"invalid_first_original_threshold");continue;
   }
   seen.add(k);
   if(!hasAdaptive||!hasPos){
    increment(exclusions,"original_pregame_feature_vectors_absent");continue;
   }
   // Never import a present-day or post-result injury report.
   const q=quality.assess(p,s,{now:s.generatedAt,official:null,external:null,
    officialGitAt:null,externalGitAt:null});
   const chosen=q.status==="shadow_selected_research_only";
   const target=scopes[p.market]??={selected:bucket(),skipped:bucket(),all:bucket()};
   const outcome=officialOutcome(p,history);
   add(total,p,outcome);add(target.all,p,outcome);
   add(chosen?selected:skipped,p,outcome);
   add(chosen?target.selected:target.skipped,p,outcome);
   if(!chosen){
    increment(reasons,q.reason||"unclassified_heuristic_abstention");
    if(q.reason==="insufficient_prior_usage_ice_time_or_opponent_sample"){
     // Diagnose quality-of-input shortfalls, without changing the rule or
     // choosing new cutoffs after outcomes have been observed.
     const cfg=quality.LIMITS[p.market];
     const v=s.standardAdaptiveResearchV2.rows.filter(x=>
      quality.key(x)===k&&x.originalSide===p.lean&&
      x.gameStartAt===p.gameStartAt&&x.capturedAt===p.capturedAt);
     if(v.length!==1)increment(gateCoverage,"adaptive_row_missing_or_duplicate");
     else {
      const e=v[0],gaps={
       priorGameSampleBelowPolicy:!Number.isInteger(e.priorGames)||e.priorGames<cfg.prior,
       opponentGameSampleBelowPolicy:!Number.isInteger(e.opponentGames)||e.opponentGames<cfg.opponent,
       trainingGamesBelow30:!Number.isInteger(e.trainingGames)||e.trainingGames<30,
       trainingDatesBelow10:!Number.isInteger(e.trainingDates)||e.trainingDates<10,
       iceTimeBelowMarketPolicy:!Number.isFinite(e.expectedIceSeconds)||e.expectedIceSeconds<cfg.ice,
       opponentEvidenceNotVerified:e.opponentHistoryUsed!==true
      };
      for(const [name,missing] of Object.entries(gaps))if(missing)increment(gateCoverage,name);
     }
    }
   }
  }
 }
 const sel=output(selected),rest=output(skipped),all=output(total);
 return {kind:KIND,originalFramesChecked:acceptedFrames,
  originalFramesWithBothFeatureVectors:withOriginalFeatures,
  uniqueArchivedOriginalsWithBothVectors:all.registered,
  exclusions,abstentionReasons:reasons,asOfEvidenceGapCounts:gateCoverage,
  all,selected:sel,skipped:rest,
  byMarket:Object.fromEntries(Object.entries(scopes).map(([k,v])=>[
   k,{selected:output(v.selected),skipped:output(v.skipped),all:output(v.all)}])),
  selectionCoverage:all.registered?sel.registered/all.registered:null,
  observedSelectedMinusSkipped:sel.decided&&rest.decided?
   sel.hitRate-rest.hitRate:null,
  claim:"retrospective_model_only_frozen_feature_ablation",
  noHistoricalInjuryOrActiveProof:true,
  newQualityPolicyAppliedToOldDataPosthoc:true,
  dataNotReservedAsUntouchedHoldout:true,
  independentlyValidatedImprovement:false,
  noCalibrationOrAppPayoutProof:true,
  bettingRecommendationsApproved:false,
  automaticModelPromotion:false,
  noPicksPlaced:true,
  note:"Frozen pregame original model features, if actually embedded, are replayed with the Nov20 rule. This is post-hoc and cannot establish prospective superiority, medical clearance or full-board selection profitability."};
}
module.exports={KIND,replay};
