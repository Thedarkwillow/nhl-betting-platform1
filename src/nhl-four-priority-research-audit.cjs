"use strict";
/**
 * Read-only NHL accuracy, source, and calibration audit.
 * Every number is retrospective or a frozen-future denominator.
 * No model selection, gambling recommendation or new fitted probability.
 */
const {validateFirstGit}=require("./goblin-opportunity-evidence.cjs");
const dt=s=>typeof s==="string"?Date.parse(s):NaN;
const n=x=>Number.isInteger(x)&&x>=0;
const rate=(x,y)=>y?Number((x/y).toFixed(6)):null;
const MARKET=new Set(["shotsOnGoal","points","blockedShots","assists"]);
function pendingTriage(records,finals,{policyAt,now,grade}={}){
 const out={kind:"nhl_firstgit_goblin_pending_final_triage_v1",
  sourceProofRequired:true,registered:0,abstained:0,
  eligibleResearch:0,verifiedFinalDecisions:0,verifiedPushes:0,
  beforeKickoff:0,afterStartWithinFourHours:0,
  afterFourHoursWithoutVerifiedStat:0,
  ambiguousOrInvalidFinal:0,missingOrInvalidFirstGit:0,
  distinctOriginalGames:0,byMarket:{},coherentWithGrader:false,
  bettingEligible:false,calibrationApproved:false,
  modelPromoted:false,approvedLineups:0};
 const time=dt(now);if(!Number.isFinite(time)||!Number.isFinite(dt(policyAt)))return out;
 const games=new Set(),finalMap=new Map();
 for(const x of finals||[]){
  const k=[x.sport,x.gameId,x.playerId,x.market].join("|");
  const a=finalMap.get(k)||[];a.push(x);finalMap.set(k,a);
 }
 for(const r of records||[]){
  if(!validateFirstGit(r,policyAt)||r.sport!=="NHL"||!MARKET.has(r.market)){
   out.missingOrInvalidFirstGit++;continue;
  }
  out.registered++;games.add(r.gameId);
  const m=out.byMarket[r.market]??={registered:0,abstained:0,officialDecisions:0,
   officialPushes:0,beforeKickoff:0,earlyAfterStart:0,lateNoVerifiedStat:0,
   invalidFinal:0};
  m.registered++;
  if(r.status==="abstain"||!r.internalChallengerSide){out.abstained++;m.abstained++;continue;}
  out.eligibleResearch++;
  const start=dt(r.gameStartsAt);
  const q=finalMap.get(["NHL",r.gameId,r.playerId,r.market].join("|"))||[];
  const verified=q.filter(x=>x.gameState==="FINAL"||x.gameState==="OFF")
   .filter(x=>x.officialVerified===true&&Number.isInteger(x.actual)&&x.actual>=0&&
    Number.isFinite(dt(x.officialFinalAt))&&dt(x.officialFinalAt)>start);
  if(q.length>1||verified.length>1||q.length===1&&verified.length===0){
   out.ambiguousOrInvalidFinal++;m.invalidFinal++;continue;
  }
  if(verified.length===1){
   if(verified[0].actual===r.line){out.verifiedPushes++;m.officialPushes++;}
   else{out.verifiedFinalDecisions++;m.officialDecisions++;}
   continue;
  }
  if(time<start){out.beforeKickoff++;m.beforeKickoff++;}
  else if(time-start<4*3600000){out.afterStartWithinFourHours++;m.earlyAfterStart++;}
  else{out.afterFourHoursWithoutVerifiedStat++;m.lateNoVerifiedStat++;}
 }
 out.distinctOriginalGames=games.size;
 const reconciled=out.abstained+out.verifiedFinalDecisions+out.verifiedPushes+
  out.beforeKickoff+out.afterStartWithinFourHours+
  out.afterFourHoursWithoutVerifiedStat+out.ambiguousOrInvalidFinal;
 out.coherentWithGrader=reconciled===out.registered&&
  grade?.registered===out.registered&&grade?.abstained===out.abstained&&
  grade?.decided===out.verifiedFinalDecisions&&
  grade?.pushes===out.verifiedPushes&&
  grade?.pending===out.beforeKickoff+out.afterStartWithinFourHours+
    out.afterFourHoursWithoutVerifiedStat+out.ambiguousOrInvalidFinal;
 return out;
}
function standardMarkets(report){
 const out={kind:"nhl_frozen_standard_market_vs_simple_baselines_v1",
  valid:false,originalSameFrozenLines:true,
  distinctMarkets:0,decided:0,byMarket:{},
  modelBeatsAlwaysHigherOnEveryMarket:false,
  modelBeatsAlwaysLowerOnEveryMarket:false,
  prospectiveOutperformanceApproved:false,releaseApproved:false};
 if(report?.kind!=="nhl_frozen_same_threshold_baselines_v1"||
    report.evidenceValid!==true||
    !report.postPolicySameSelectedLines?.byStandardMarket)return out;
 for(const [market,v] of Object.entries(report.postPolicySameSelectedLines.byStandardMarket)){
  if(!MARKET.has(market)||!n(v.decided)||!n(v.modelWins)||
     !n(v.alwaysHigherWins)||!n(v.alwaysLowerWins)||
     !n(v.distinctGames)||v.alwaysHigherWins+v.alwaysLowerWins!==v.decided||
     v.modelWins>v.decided)continue;
  out.byMarket[market]={decided:v.decided,distinctGames:v.distinctGames,
   modelHitRate:rate(v.modelWins,v.decided),
   alwaysHigherRate:rate(v.alwaysHigherWins,v.decided),
   alwaysLowerRate:rate(v.alwaysLowerWins,v.decided),
   modelMinusLower:rate(v.modelWins-v.alwaysLowerWins,v.decided),
   modelMinusHigher:rate(v.modelWins-v.alwaysHigherWins,v.decided),
   sampleMinimum200DecisionsMet:v.decided>=200,
   needsNewFrozenProspectiveChallenger:true,
   releaseApproved:false};
  out.decided+=v.decided;
 }
 out.distinctMarkets=Object.keys(out.byMarket).length;
 out.valid=out.distinctMarkets>0;
 out.modelBeatsAlwaysHigherOnEveryMarket=out.valid&&
  Object.values(out.byMarket).every(v=>v.modelMinusHigher>0);
 out.modelBeatsAlwaysLowerOnEveryMarket=out.valid&&
  Object.values(out.byMarket).every(v=>v.modelMinusLower>0);
 return out;
}
function sportsbookGap(benchmark,legacy){
 const out={kind:"nhl_source_native_conditional_vs_original_frozen_benchmark_v1",
  archiveKindValid:false,conditionalSameOfferSides:0,
  independentBookGroups:0,conditionalExactThresholdGroups:0,
  independentlyAuthenticatedSamePropModelComparisons:0,
  historicalModelComparisonRows:0,
  currentQuoteFresh:false,sharedPlayerIdentifierVerified:false,
  originalAppAvailabilityVerified:false,verifiedPayoutEV:false,
  matchedQuoteIsNotBettable:true,newProviderRequests:0};
 const m=benchmark?.bySport?.NHL;
 if(benchmark?.kind!=="private_same_line_sportsbook_board_benchmark_v1"||
    benchmark.researchOnly!==true||benchmark.sharedProviderIdsVerified!==false||
    benchmark.originalPlatformAvailabilityVerified!==false||
    !n(benchmark.matchedSides)||!n(m?.native)||!n(m?.exactBoardGroups)||
    !n(m?.matchedOfferSides)||
    !Array.isArray(benchmark.matches)||benchmark.matches.length!==benchmark.matchedSides||
    !Number.isFinite(dt(benchmark.generatedAt))||
    // Real archives legitimately include NHL plus NFL. Do not compare
    // combined matchedSides with NHL-only matchedOfferSides; require that
    // the exact NHL subset and the NFL remainder reconcile independently.
    benchmark.matches.some(x=>!["NHL","NFL"].includes(x.sport))||
    benchmark.matches.filter(x=>x.sport==="NHL").length!==m.matchedOfferSides||
    (benchmark.bySport?.NFL&&(
     !n(benchmark.bySport.NFL.matchedOfferSides)||
     benchmark.matches.filter(x=>x.sport==="NFL").length!==benchmark.bySport.NFL.matchedOfferSides))||
    (!benchmark.bySport?.NFL&&benchmark.matches.some(x=>x.sport==="NFL"))||
    benchmark.matches.filter(x=>x.sport==="NHL").some(x=>
      x.conditionalIdentityOnly!==true||
      !["Higher","Lower"].includes(x.side)||!Number.isFinite(x.line)||
      !n(x.books)||x.books<1||!Number.isFinite(x.consensusHigher)||
      x.consensusHigher<0||x.consensusHigher>1))return out;
 out.archiveKindValid=true;
 out.conditionalSameOfferSides=m.matchedOfferSides;
 out.independentBookGroups=m.native;
 out.conditionalExactThresholdGroups=m.exactBoardGroups;
 if(legacy?.kind==="private_nhl_archived_benchmark_comparison_v2"&&
    n(legacy.matchedNHLRows)){
  out.historicalModelComparisonRows=legacy.matchedNHLRows;
 }
 return out;
}
function calibrationHoldout(report){
 const out={kind:"nhl_standard_original_probability_calibration_readiness_v1",
  sourceValid:false,decided:0,distinctGames:0,distinctDates:0,
  originalAverageProbability:null,observedHitRate:null,rawBrier:null,
  absoluteOverconfidenceGap:null,rawProbabilityOverconfidenceObserved:false,
  minimum20DistinctDatesMet:false,perMarketTierCalibrationValidated:false,
  independentHoldoutCalibratorValidated:false,
  sportsbookConsensusAndPayoutEVVerified:false,
  approvedProbabilityDisplay:false,approvedLineups:0,modelPromoted:false};
 if(report?.kind!=="private_nhl_prospective_probability_validation_v1"||
    report.status!=="research_validation_only"||
    report.modelChanged!==false||
    report.calibrated!==false||
    report.originalPlatformSettlementsVerified!==false||
    report.productionRecommendationsApproved!==false)return out;
 const h=report.futureHoldout;
 if(!n(h?.decided)||!n(h.distinctGames)||!n(h.distinctGameDates)||
    !(h.meanPredictedProbability>0&&h.meanPredictedProbability<1)||
    !(h.observedHitRate>=0&&h.observedHitRate<=1)||
    !(h.brier>=0&&h.brier<=1))return out;
 out.sourceValid=true;out.decided=h.decided;
 out.distinctGames=h.distinctGames;out.distinctDates=h.distinctGameDates;
 out.originalAverageProbability=h.meanPredictedProbability;
 out.observedHitRate=h.observedHitRate;out.rawBrier=h.brier;
 out.absoluteOverconfidenceGap=Number(Math.abs(h.meanPredictedProbability-h.observedHitRate).toFixed(6));
 out.rawProbabilityOverconfidenceObserved=h.meanPredictedProbability>h.observedHitRate;
 out.minimum20DistinctDatesMet=h.distinctGameDates>=20;
 return out;
}
module.exports={pendingTriage,standardMarkets,sportsbookGap,calibrationHoldout};
