"use strict";
/**
 * Standalone NHL player prop preferences, separate from 2-6 pick optimizations.
 * IMPORTANT: rankedProps contains AVAILABLE OFFERED DIRECTIONS, not picks.
 * This exact policy is committed in code now; new snapshots explicitly freeze
 * individualPropSelections. Older snapshots support only labeled ex-post
 * reconstruction of the same deterministic rule from immutable pregame inputs.
 */
const POLICY="nhl-individual-prop-max-available-direction-v1";
const {gradePredictions,validArchiveChronology}=require("./grade-nhl-predictions.cjs");
const {evaluateProspectiveEvidence}=require("./nhl-prospective-evidence.cjs");
const canon=s=>({"SJ":"SJS","TB":"TBL","NJ":"NJD","LA":"LAK"}[String(s||"").trim().toUpperCase()]||String(s||"").trim().toUpperCase());
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const key=p=>[p.gameId,p.playerId,p.market,p.line,p.tier].join("|");
const eq=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-4;
function selectIndividualProps(rows){
 if(!Array.isArray(rows))throw Error("rankedProps must be an array");
 const groups=new Map(),exclusions={};
 const skip=why=>{exclusions[why]=(exclusions[why]||0)+1;};
 for(const p of rows){
  if(!p||!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
   !Number.isFinite(p.line)||p.line<0||!p.market||!p.tier||
   !["Standard","Goblin","Demon"].includes(p.tier)||
   !["Higher","Lower"].includes(p.lean)||!Number.isFinite(p.probability)||
   !(p.probability>0&&p.probability<1)||
   !Number.isFinite(p.probabilities?.higher)||!Number.isFinite(p.probabilities?.lower)||
   !Number.isFinite(at(p.capturedAt))||!Number.isFinite(at(p.eventStartsAt))||
   at(p.capturedAt)>=at(p.eventStartsAt)||p.model!=="weighted-form-v1"){
   skip("invalid_original_prop_or_model_identity");continue;
  }
  // A goalie may have played without starting. Never convert unsupported
  // availability or injury risk to a confident recommendation.
  if(p.probabilitySafety?.researchLineupEligible===false){
   skip("probability_safety_abstention");continue;
  }
  if(p.researchEligibility==="watchlist"||
   p.roleEvidence?.eligibleForResearchLineup===false){
   skip("role_or_goalie_watchlist");continue;
  }
  if(!eq(p.probability,p.probabilities[p.lean==="Higher"?"higher":"lower"])){
   skip("side_probability_not_original_model_vector");continue;
  }
  const k=key(p);
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(p);
 }
 const selected=[],abstained={};
 for(const [id,group] of [...groups.entries()].sort(([a],[b])=>a.localeCompare(b))){
  const sides=new Map();let inconsistent=false;
  const h=group[0].probabilities.higher,l=group[0].probabilities.lower;
  for(const p of group){
   if(!eq(p.probabilities.higher,h)||!eq(p.probabilities.lower,l)||
    p.eventStartsAt!==group[0].eventStartsAt||canon(p.team)!==canon(group[0].team)||
    canon(p.opponent)!==canon(group[0].opponent))inconsistent=true;
   const previous=sides.get(p.lean);
   if(previous&&(!eq(previous.probability,p.probability)||
    previous.capturedAt!==p.capturedAt))inconsistent=true;
   sides.set(p.lean,p);
  }
  if(inconsistent){abstained.conflicting_original_offer_rows=(abstained.conflicting_original_offer_rows||0)+1;continue;}
  // Only a side that appears in the originally captured provider offer
  // can be a selection. Demon/Goblin are Higher-only in this collector.
  const available=[...sides.values()].sort((a,b)=>b.probability-a.probability||
    a.lean.localeCompare(b.lean));
  if(!available.length||available[0].probability<=0.5){
   abstained.no_offered_side_with_model_probability_over_half=
    (abstained.no_offered_side_with_model_probability_over_half||0)+1;continue;
  }
  if(available.length>1&&eq(available[0].probability,available[1].probability)){
   abstained.tied_preference=(abstained.tied_preference||0)+1;continue;
  }
  const p=available[0];
  selected.push({gameId:p.gameId,gameStartAt:p.gameStartAt||p.eventStartsAt,
   playerId:p.playerId,team:p.team,opponent:p.opponent,market:p.market,
   line:p.line,tier:p.tier,lean:p.lean,probability:p.probability,
   selectedModelProbability:p.probability,model:p.model,
   capturedAt:p.capturedAt,eventStartsAt:p.eventStartsAt,
   selectedBecause:"highest_offered_side_probability_above_50pct",
   competingOfferedSides:available.length,marketStatus:"research_only",
   originalModelProbabilityCalibrated:false,originalPlatformSettlementVerified:false});
 }
 return {policy:POLICY,selected,exclusions,abstained,availableUniqueProps:groups.size,
  selectedUniqueProps:selected.length,modelHitProbabilityThreshold:0.5,
  optimizerLineupMembershipNotRequired:true,
  note:"This is a model preference within captured offers, not guaranteed value or recommendation. Standard and special tiers have different thresholds/payouts. No postgame label is used."};
}
function checkFrozenPick(p,frame,schedule){
 const g=schedule.get(p.gameId),st=at(g?.startTimeUTC);
 if(!Number.isFinite(st)||Math.abs(st-at(p.eventStartsAt))>300000||
  Math.abs(st-at(p.gameStartAt))>300000)return false;
 const teams=[canon(g.home),canon(g.away)];
 if(!teams.includes(canon(p.team))||!teams.includes(canon(p.opponent))||
  canon(p.team)===canon(p.opponent))return false;
 return validArchiveChronology(at(p.capturedAt),at(frame.snapshot.generatedAt),
  at(frame.firstCommittedAt),st);
}
function freezeIndividualPreferences(frames,officialGames){
 if(!Array.isArray(frames)||!Array.isArray(officialGames))
  throw Error("Require frozen snapshots and original NHL schedule");
 const schedule=new Map(officialGames.filter(g=>Number.isInteger(g?.id)).map(g=>[g.id,g]));
 const audit={snapshotsSeen:frames.length,unprovenSnapshots:0,
  acceptedExplicitSnapshotSelections:0,
  legacyPolicyReconstructedSelections:0,
  inconsistentExplicitSelections:0,
  invalidIdentityOrPregameProof:0,
  repeatedExactProps:0,changedLaterPreferences:0};
 const explicit=new Map(),legacy=new Map();
 const sorted=[...frames].sort((a,b)=>at(a.firstCommittedAt)-at(b.firstCommittedAt)||
   String(a.path||"").localeCompare(String(b.path||"")));
 for(const frame of sorted){
  const s=frame.snapshot;
  if(!s||!Array.isArray(s.rankedProps)||frame.gitHistoryCount!==1||
   !Number.isFinite(at(frame.firstCommittedAt))||
   !Number.isFinite(at(s.generatedAt))){audit.unprovenSnapshots++;continue;}
  // For 2026-11-02 legacy snapshots, capture only already committed
  // raw model probabilities. We do NOT assert selection precommitment.
  const recalculated=selectIndividualProps(s.rankedProps);
  let rows=recalculated.selected,cohort="legacy";
  if(s.individualPropSelectionPolicy===POLICY){
   cohort="explicit";
   if(!Array.isArray(s.individualPropSelections)){
    audit.inconsistentExplicitSelections++;continue;
   }
   const ours=new Map(rows.map(x=>[key(x),x]));
   const originals=new Map();
   for(const p of s.individualPropSelections){
    const computed=ours.get(key(p));
    if(!computed||originals.has(key(p))||computed.lean!==p.lean||
     !eq(computed.probability,p.probability)||
     p.capturedAt!==computed.capturedAt||p.eventStartsAt!==computed.eventStartsAt){
     audit.inconsistentExplicitSelections++;continue;
    }
    originals.set(key(p),computed);
   }
   if(originals.size!==rows.length||s.individualPropSelections.length!==rows.length){
    audit.inconsistentExplicitSelections++;continue;
   }
   rows=[...originals.values()];
  }
  for(const p of rows){
   if(!checkFrozenPick(p,frame,schedule)){audit.invalidIdentityOrPregameProof++;continue;}
   // Explicit preregistered picks and old later-policy reconstructions are
   // independently scored cohorts. Never add their denominators together.
   const id=key(p),already=cohort==="explicit"?explicit.get(id):legacy.get(id);
   if(already){
    audit.repeatedExactProps++;
    if(already.lean!==p.lean)audit.changedLaterPreferences++;
    continue;
   }
   const snap={...p,predictionRecordedAt:s.generatedAt,
    snapshotArchivedAt:frame.firstCommittedAt,
    originalFrozenPreferenceSource:cohort==="explicit"?
     "explicitly_logged_in_git_frozen_individual_prop_selections":
     "legacy_prestart_model_probability_reconstructed_by_later_defined_policy",
    retrospectivePolicyOnly:cohort!=="explicit"};
   if(cohort==="explicit"){explicit.set(id,snap);audit.acceptedExplicitSnapshotSelections++;}
   else{legacy.set(id,snap);audit.legacyPolicyReconstructedSelections++;}
  }
 }
 return {explicit:[...explicit.values()],legacy:[...legacy.values()],audit};
}
function summarize(picks,history,precommitted=false){
 const graded=gradePredictions(picks,history),markets={},tiers={},days={};
 for(const p of graded.graded){
  for(const [map,k] of [[markets,p.market],[tiers,p.tier],[days,p.gameDate||"unknown"]]){
   const v=map[k]||(map[k]={graded:0,decided:0,correct:0,pushes:0});
   v.graded++;
   if(p.correct===null)v.pushes++;
   else{v.decided++;v.correct+=Number(p.correct);}
  }
 }
 const n=graded.summary.decisions;
 return {uniqueSelections:picks.length,graded:graded.summary.graded,decided:n,
  distinctGradedGames:new Set(graded.graded.map(p=>p.gameId)).size,
  distinctGradedDates:Object.keys(days).length,
  correct:graded.summary.correct,pushes:graded.summary.pushes,
  pending:graded.pending.length,rejected:graded.rejected.length,
  hitRate:n?graded.summary.correct/n:null,
  byMarket:markets,byTier:tiers,byGameDate:days,
  outcomeEvidence:{...graded.outcomeEvidence,
   sourceCohort:precommitted?"explicit_Git_precommitted_individual_model_directions":"retrospective_postgame_selection_rule",
   independentlyVerifiedPlatformSettlements:0},
  directionalEvidence:evaluateProspectiveEvidence(graded.graded,{precommitted}),
  alwaysLowerBaseline:n?graded.graded.filter(p=>p.correct!==null&&p.result==="Lower").length/n:null,
  alwaysHigherBaseline:n?graded.graded.filter(p=>p.correct!==null&&p.result==="Higher").length/n:null};
}
function gradeIndividualPreferences(frames,officialGames,history){
 const selections=freezeIndividualPreferences(frames,officialGames);
 return {kind:"nhl_frozen_individual_prop_preference_audit_v1",schemaVersion:1,
  policy:POLICY,
  ...selections.audit,
  explicitProspective:summarize(selections.explicit,history,true),
  legacyRetrospective:summarize(selections.legacy,history,false),
  outcomeSource:"official_NHL_boxscore_history",
  firstFrozenVersionOnly:true,
  postgamePolicySelectionForbidden:true,
  originalPrizePicksSettlementVerified:false,
  calibrated:false,modelPromoted:false,
  warning:"Individual props are independent of lineups. Explicit pregame-selected model preferences are separate from historical pregame probability vectors graded with a policy written later. The legacy reconstructed cohort is NOT a prespecified prospective strategy or verified betting hit rate. No payout or independent winning edge verified."};
}
module.exports={POLICY,key,selectIndividualProps,freezeIndividualPreferences,
 gradeIndividualPreferences};
