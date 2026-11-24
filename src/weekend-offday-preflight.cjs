"use strict";
/** Offline weekend original-frozen research preflight.
 * Read-only. No retuning on Friday's or future outcomes; no app authentication,
 * payouts, current active roster, or recommendations inferred from source records.
 */
const KIND="private_weekend_frozen_original_preflight_v1";
const NHL="nhl_standard_market_quality_challenger_20261120_v2";
const NFL="nfl_rushing_and_combo_abstaining_challenger_20261120_v3";
const POLICY="2026-11-21T00:00:00Z";
const quality=require("./nhl-standard-quality-challenger-v2.cjs");
const t=x=>typeof x==="string"?Date.parse(x):NaN;
const pacific=x=>{
  if(!Number.isFinite(t(x)))return null;
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date(x)).map(z=>[z.type,z.value]));
  return p.year+"-"+p.month+"-"+p.day;
};
function weekendDays(now){
 const day=pacific(now);
 if(!day)return {saturday:null,sunday:null};
 const t=Date.parse(day+"T12:00:00Z"),w=new Date(t).getUTCDay();
 const next=n=>new Date(t+((n-w+7)%7)*86400000).toISOString().slice(0,10);
 return {saturday:next(6),sunday:next(0)};
}
const reason=(bucket,r)=>bucket[r]=(bucket[r]||0)+1;
function proof(snapshot,commitAt,revisions,kind){
 const made=t(snapshot?.[kind==="NHL"?"generatedAt":"createdAt"]),git=t(commitAt);
 const source=t(kind==="NHL"?snapshot?.boardAsOfAt:snapshot?.sourceBoardAsOfAt);
 return {singleOriginalGitCommit:revisions===1,createdBeforeFirstGit:
  Number.isFinite(made)&&Number.isFinite(git)&&made<=git&&git-made<=15*60000,
  observedBeforeCreation:Number.isFinite(source)&&Number.isFinite(made)&&
   source<=made&&made-source<=30*60000,
  policyEligible:Number.isFinite(made)&&made>=t(POLICY),
  precommitValid:revisions===1&&Number.isFinite(made)&&Number.isFinite(git)&&
   Number.isFinite(source)&&source<=made&&made<=git&&git-made<=15*60000};
}
function nhl(frame,now){
 const s=frame?.snapshot,gate=proof(s,frame?.firstGitCommittedAt,frame?.gitHistoryCount,"NHL");
 const out={proof:gate,gameDay:weekendDays(now).saturday,sourceCapturedAt:s?.boardAsOfAt??null,
  originalPlatformAuthenticated:false,bettingApproved:false,
  byMarket:{},all:{selectedOriginal:0,originalExactVerified:0,firstGitFutureOriginal:0,
   shadowSelected:0,shadowAbstained:0,availabilityBlocks:0,
   modelOnlyWithoutRosterProof:0,modelOnlyReasons:{}},
  exclusions:{},researchOnly:true};
 if(!gate.precommitValid||!Array.isArray(s?.individualPropSelections)||
   !Array.isArray(s?.rankedProps))return {...out,status:"original_git_or_snapshot_unverified"};
 const raw=s.rankedProps,shadow=s.standardQualityShadowV2?.kind===NHL?s.standardQualityShadowV2.rows||[]:[];
 const rows=s.individualPropSelections.filter(p=>p.tier==="Standard"&&pacific(p.gameStartAt)===out.gameDay);
 const seen=new Set();
 for(const p of rows){
  const k=JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.tier]),b=out.byMarket[p.market]??={
    original:0,originalExactVerified:0,firstGitFutureOriginal:0,shadowSelected:0,
    shadowAbstained:0,availabilityBlocks:0,modelOnlyWithoutRosterProof:0,
    modelOnlyReasons:{},reasonCounts:{}};
  if(seen.has(k)){reason(out.exclusions,"duplicate_original_market_line");continue;}
  seen.add(k);b.original++;out.all.selectedOriginal++;
  const ident=x=>x.gameId===p.gameId&&x.playerId===p.playerId&&x.market===p.market&&
     x.line===p.line&&x.tier===p.tier&&x.capturedAt===p.capturedAt&&x.gameStartAt===p.gameStartAt;
  const offered=raw.filter(x=>ident(x)&&x.lean===p.lean);
  if(offered.length!==1||![ "Higher","Lower" ].includes(p.lean)||
     !Number.isFinite(p.line)||p.line%1!==.5||t(p.capturedAt)>t(s.generatedAt)){
   reason(out.exclusions,"unmatched_original_offered_side");continue;
  }
  b.originalExactVerified++;out.all.originalExactVerified++;
  if(t(p.gameStartAt)-t(frame.firstGitCommittedAt)<15*60000){
   reason(out.exclusions,"game_started_before_first_git_buffer");continue;
  }
  b.firstGitFutureOriginal++;out.all.firstGitFutureOriginal++;
  // Ablation: evaluate the fixed prior-game/matchup evidence WITHOUT the
  // injury feed. This can diagnose a missing feed, but NEVER verifies active
  // status, becomes an approved pick or changes the frozen shadow.
  const modelOnly=quality.assess(p,s,{now:s.generatedAt,
    official:null,external:null,officialGitAt:null,externalGitAt:null});
  if(modelOnly.status==="shadow_selected_research_only"){
   b.modelOnlyWithoutRosterProof++;out.all.modelOnlyWithoutRosterProof++;
  }else reason(b.modelOnlyReasons,modelOnly.reason||"unknown_model_evidence");
  const matched=shadow.filter(x=>ident(x)&&x.originalSide===p.lean);
  if(matched.length!==1){reason(b.reasonCounts,"missing_exact_precommitted_quality_shadow");
   b.shadowAbstained++;out.all.shadowAbstained++;continue;}
  const x=matched[0];
  if(x.status==="shadow_selected_research_only"){
   b.shadowSelected++;out.all.shadowSelected++;
  }else{
   reason(b.reasonCounts,x.reason||"unclassified_abstention");
   b.shadowAbstained++;out.all.shadowAbstained++;
   if(x.reason==="unverified_or_negative_pregame_availability"){
    b.availabilityBlocks++;out.all.availabilityBlocks++;
   }
  }
 }
 out.status=gate.policyEligible?"future_policy_frozen_research_only":"early_prepolicy_diagnostic_only";
 out.currentOriginalSourceStillAvailableUnverified=true;
 out.officialDayOfActiveParticipationVerified=false;
 return out;
}
function nfl(frame,now){
 const s=frame?.snapshot,gate=proof(s,frame?.firstGitCommittedAt,frame?.gitHistoryCount,"NFL");
 const out={proof:gate,gameDay:weekendDays(now).sunday,sourceCapturedAt:s?.sourceBoardAsOfAt??null,
  originalPlatformAuthenticated:false,bettingApproved:false,byMarket:{},
  all:{original:0,firstGitFutureOriginal:0,shadowSelected:0,shadowAbstained:0,unscoredShadow:0,
   officialActiveVerified:0,participationHolds:0,untrustedShadowActiveClaims:0},exclusions:{},researchOnly:true};
 if(!gate.precommitValid||!Array.isArray(s?.selections))
  return {...out,status:"original_git_or_snapshot_unverified"};
 const shadow=s.usageDirectionShadowV3?.kind===NFL?s.usageDirectionShadowV3.rows||[]:[];
 const seen=new Set();
 for(const p of s.selections.filter(x=>pacific(x.eventStartsAt)===out.gameDay)){
  const k=p.id,b=out.byMarket[p.market]??={original:0,shadowSelected:0,
   shadowAbstained:0,unscoredShadow:0,participationHolds:0,reasons:{}};
  if(seen.has(k)){reason(out.exclusions,"duplicate_source_identity");continue;}
  seen.add(k);b.original++;out.all.original++;
  if(t(p.eventStartsAt)-t(frame.firstGitCommittedAt)<900000||p.autoPickEligible!==false||
    p.probability!==null||p.selectedSide!==p.offeredSide||
    !["Higher","Lower"].includes(p.selectedSide)){
    reason(out.exclusions,"original_unverified_identity_or_clock");continue;
  }
  out.all.firstGitFutureOriginal++;
  const z=shadow.filter(x=>x.originalId===p.id&&x.originalLine===p.line&&
   x.originalMarket===p.market&&x.originalSide===p.selectedSide);
  if(z.length!==1){reason(b.reasons,"missing_exact_precommitted_usage_shadow");
   b.unscoredShadow++;out.all.unscoredShadow++;continue;}
  const x=z[0];
  if(x.status==="shadow_selected_research_only"&&x.bettingEligible===false){
   b.shadowSelected++;out.all.shadowSelected++;
   // A research-only shadow cannot authenticate NFL game-day active status.
   // Even if a future bug sets this flag true, independent official
   // first-Git participation proof and provider identity remain missing.
   b.participationHolds++;out.all.participationHolds++;
   if(x.officialGameDayActive===true){
    out.all.untrustedShadowActiveClaims++;
    reason(b.reasons,"unverified_shadow_active_assertion");
   }else reason(b.reasons,"positive_game_day_participation_not_verified");
  }else{
   b.shadowAbstained++;out.all.shadowAbstained++;
   reason(b.reasons,x.reason||"unclassified_abstention");
  }
 }
 out.status=gate.policyEligible?"future_policy_frozen_research_only":"early_prepolicy_diagnostic_only";
 out.officialGameDayActiveStillUnverified=true;
 out.independentOfficialPositivePlayerEvidenceJoined=false;
 out.currentOriginalAppSideAndPayoutUnverified=true;
 return out;
}
function evaluate({nhlFrame,nflFrame,now,platform=null,trial=null,historicalNhlStandard=null}={}){
 const h=nhl(nhlFrame,now),f=nfl(nflFrame,now);
 // Descriptive prior frozen-line evidence is only an error diagnostic.
 // Never fit or select the new challenger thresholds using these same games.
 const history=historicalNhlStandard?.kind==="private_nhl_standard_proof_v1"?
  Object.fromEntries(["shotsOnGoal","assists","blockedShots","points"].map(m=>{
   const x=historicalNhlStandard.scorecard?.["market:"+m];
   return [m,x?{decided:x.decided,distinctGames:x.distinctGames,
    distinctDates:x.distinctDates,
    originalObservedHitRate:x.hitRates?.model??null,
    olderResearchChallengerObservedHitRate:x.hitRates?.challenger??null,
    alwaysHigherSameLine:x.hitRates?.alwaysHigher??null,
    alwaysLowerSameLine:x.hitRates?.alwaysLower??null,
    researchOnly:true,modelImprovementProven:false}:null];
  })):null;
 const app={verifiedExactOffers:platform?.authenticatedExactAppOffers===0?0:null,
  verifiedExactPayouts:platform?.authenticatedExactPayoutQuotes===0?0:null,
  verifiedSettlements:platform?.authenticatedFinalSettlements===0?0:null,
  providerBookabilityUnknown:true};
 const trialStats={nhlDecided:Number.isInteger(trial?.nhl?.all?.decided)?trial.nhl.all.decided:null,
  nflDecided:Number.isInteger(trial?.nfl?.all?.decided)?trial.nfl.all.decided:null,
  comparisonAgainstHigherAndLowerApproved:false,
  noHoldoutOutcomesUsedForModelTuning:true};
 return {kind:KIND,generatedAt:now,policyEffectiveAtOrAfter:POLICY,
  nhl:h,nfl:f,olderFrozenStandardMarketDiagnostics:history,
  historicalResultsNotTrainingDataForNewRules:true,
  platformEvidence:app,strictTrial:trialStats,
  noFreshSourceCalls:true,originalSelectionsRewritten:false,
  calibrationApproved:false,bettingRecommendationsApproved:false,
  jointLineupEVVerified:false,realEntriesPlaced:0,
  requiredBeforeRecommendations:[
   "actual current platform-side and threshold match",
   "positive game-day official participation and injury review",
   "fresh full-board pregame capture after any line move",
   "future-only paired baseline performance and calibrated probability",
   "entry-specific payout and correlated lineup joint-probability validation"]};
}
module.exports={KIND,POLICY,proof,pacific,weekendDays,nhl,nfl,evaluate};
