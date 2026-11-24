"use strict";
// Strict prospective evaluation of *new* NFL directional shadow commits.
// Original frozen source directions never change. Not a retrospective trial.
const {KIND,POLICY}=require("./nfl-directional-v2-prospective.cjs");
const selective=require("./nfl-market-usage-selective-future-v1.cjs");
const t=x=>typeof x==="string"?Date.parse(x):NaN;
const pct=(k,n)=>n?k/n:null;
function summarize(rows){
 const d=rows.filter(x=>x.status==="decided");
 const base={included:rows.length,decided:d.length,pending:rows.length-d.length,correct:d.filter(x=>x.correct).length,
  alwaysHigher:d.filter(x=>x.actualSide==="Higher").length,alwaysLower:d.filter(x=>x.actualSide==="Lower").length,
  distinctFinalGames:new Set(d.map(x=>x.officialGameId)).size,distinctGameDays:new Set(d.map(x=>x.gameDay)).size};
 return {...base,hitRate:pct(base.correct,base.decided),alwaysHigherHitRate:pct(base.alwaysHigher,base.decided),alwaysLowerHitRate:pct(base.alwaysLower,base.decided)};
}
function audit(frames,originalGrade){
 const rows=[],reject={},original=new Map(originalGrade?.explicitFrozenDirections?.rows?.map(x=>[x.id,x])||[]),seenThreshold=new Set(),seenMarket=new Set();
 if(originalGrade?.kind!=="nfl_private_pregame_evidence_separated_outcome_audit_v1"||
 originalGrade?.nflverseFinalStatsNotPlatformSettlement!==true)throw Error("Original verified NFL grade required");
 const skip=k=>reject[k]=(reject[k]||0)+1;
 for(const f of [...frames].sort((a,b)=>t(a.firstGitAt)-t(b.firstGitAt))){
  const s=f.snapshot,first=t(f.firstGitAt),created=t(s?.createdAt),earliest=t(s?.originalFirstGitCommittedAt);
  if(s?.kind!==KIND||s.policy!==POLICY||s.originalSidesUnchanged!==true||s.approvedForProduction!==false||
  s.noOutcomeStatsConsumed!==true||f.gitHistoryCount!==1||![first,created,earliest].every(Number.isFinite)||
  created-first>=1000||first<created-1000||earliest>created||!Array.isArray(s.rows)){skip("invalid_or_changed_first_git_shadow");continue;}
  for(const x of s.rows){
   const start=t(x.eventStartsAt),ref=original.get(x.originalId);
   if(!ref||!Number.isFinite(start)||start-first<15*60000||x.originalSide!==ref.modeledSide||
    x.originalLine!==ref.line||x.originalFrozenProjection!==ref.modelProjection||x.sourceGameId!==ref.sourceGameId||x.market!==ref.market||
    x.historicalPlayerId==null||x.originalDirectionUnchanged!==true||x.candidateOnly!==true){skip("not_verifiable_same_original_offer");continue;}
   if(x.status!=="directional_candidate_research_only"){skip("strict_direction_or_availability_abstention");continue;}
   const key=JSON.stringify([x.sourceGameId,x.historicalPlayerId,x.market,x.originalLine]);
   if(seenThreshold.has(key)){skip("repeated_threshold_observation");continue;}
   seenThreshold.add(key);
   const mark=JSON.stringify([x.sourceGameId,x.historicalPlayerId,x.market]);const firstPlayerMarket=!seenMarket.has(mark);seenMarket.add(mark);
   const gameDay=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(start));
   const policyAt=t(s.selectivePolicyFirstGitAt);
   const newPolicyValid=s.selectiveMarketPolicy===selective.KIND&&
    Number.isFinite(policyAt)&&policyAt>0&&earliest>=policyAt&&
    first>=policyAt&&start>policyAt+15*60000;
   const selectedNew=x.selectiveFuture?.kind===selective.KIND&&
    x.selectiveFuture.originalSideUnchanged===true&&
    x.selectiveFuture.bettingEligible===false&&
    x.selectiveFuture.status==="selective_future_research_candidate_only"&&
    newPolicyValid;
   rows.push({selectiveFutureEligible:!!selectedNew,
    market:x.market,side:x.originalSide,sourceGameId:x.sourceGameId,
     officialGameId:ref.officialScheduleGameId??null,gameDay,
     status:ref.status,actualSide:ref.actualSide??null,
     correct:ref.status==="decided"?ref.selectedSideResult==="correct":null,
     firstPlayerMarket,originalPlatformSettlementVerified:false});
  }
 }
 const eligible=rows.filter(r=>r.status==="decided"||r.status==="pending_official_final"||r.status==="pending_official_game_match"||r.status==="unresolved_player_appearance"||r.status==="missing_official_stat"||r.status==="unsupported_market_or_projection");
 const one=eligible.filter(r=>r.firstPlayerMarket);
 const byMarket=Object.fromEntries([...new Set(eligible.map(r=>r.market))].sort().map(m=>[m,summarize(eligible.filter(x=>x.market===m))]));
 const bySelectedSide=Object.fromEntries(["Higher","Lower"].map(s=>[s,summarize(eligible.filter(x=>x.side===s))]));
 const strict=summarize(one);
 const selectiveRows=one.filter(r=>r.selectiveFutureEligible===true);
 const selectiveByMarket=Object.fromEntries([...new Set(selectiveRows.map(r=>r.market))].sort().map(m=>
  [m,selective.summarize(selectiveRows.filter(x=>x.market===m))]));
 const selectiveFuture={kind:selective.KIND,firstFrozenOnly:true,
  onePerPlayerMarket:selective.summarize(selectiveRows),byMarket:selectiveByMarket,
  sampleIsSubsetOfV2OriginalDirections:true,authenticOppositeOffersVerified:false,
  calibratedProbabilitiesApproved:false,productionApproved:false};
 return {kind:"nfl_directional_v2_original_first_git_future_holdout_v1",
  evaluation:"first_shadow_commit_before_kickoff_only",policy:POLICY,
  uniqueThresholds:summarize(eligible),onePerPlayerMarket:strict,byMarket,bySelectedSide,selectiveFuture,rejections:reject,
  futureHoldoutMinimumGames:30,futureHoldoutMinimumGameDates:20,
  evidenceMinimumMet:strict.distinctFinalGames>=30&&strict.distinctGameDays>=20,
  baselineUsesIdenticalOriginalThresholds:true,gameObservationsNotIndependent:true,
  noHistoricalPolicyBackdating:true,payoutQuotesVerified:false,calibratedProbabilities:false,
  betterThanAlwaysLowerWithClusterSupport:false,productionApproved:false,wagersPlaced:0};
}
module.exports={audit,summarize};
