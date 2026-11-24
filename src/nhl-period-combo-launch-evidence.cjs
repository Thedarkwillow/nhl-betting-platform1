"use strict";
/**
 * Independent release-evidence gate for experimental NHL period and combo props.
 * A green Actions run, synthetic-line Brier score or third-party source label
 * is NOT platform authentication, official settlement or a verified edge.
 * Never returns a production-eligible pick.
 */
const crypto=require("node:crypto");
const {historicalDates}=require("../scripts/backfill-nhl-prior-season-periods.cjs");
const isDate=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+"T00:00:00Z"))&&
 new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const n=x=>Number.isFinite(x)?x:null;
const count=x=>Number.isInteger(x)&&x>=0?x:0;
const iso=s=>typeof s==="string"&&Number.isFinite(Date.parse(s))?Date.parse(s):NaN;
const uniq=xs=>[...new Set(xs)];
function auditSeasonCoverage(periodHistory,emptyDates=[],backfillStatus=null){
 const seasonDates=historicalDates(),valid=new Set(seasonDates);
 const recorded=uniq((periodHistory?.sourceDates||[]).filter(d=>isDate(d)&&valid.has(d)));
 const empty=uniq(emptyDates.filter(d=>isDate(d)&&valid.has(d)&&!recorded.includes(d)));
 const acknowledged=new Set([...recorded,...empty]);
 const pending=seasonDates.filter(d=>!acknowledged.has(d));
 return {calendarDays:seasonDates.length,completeOfficialGameDates:recorded.length,
  verifiedNoGameDates:empty.length,accountedDays:acknowledged.size,
  pendingDays:pending.length,earliestPendingDate:pending[0]||null,
  newestCompletedDate:recorded.sort().at(-1)||null,
  historicalArchiveFullyCovered:pending.length===0,
  latestBatch:backfillStatus?{
   status:backfillStatus.sourceStatus||"unknown",
   completeDates:count(backfillStatus.completeDates?.length),
   emptyDates:count(backfillStatus.emptyDates?.length),
   failedDates:count(backfillStatus.failed?.length),
   noPaidProviderRequests:backfillStatus.paidProviderRequests===0}:null,
  note:"Season-calendar coverage counts archived official complete days and verified no-game days; does not establish individual player/stat reconciliation or source licensing."};
}
function auditCalibration(walkforward){
 const rows=Object.entries(walkforward?.byMarket||{}).map(([key,r])=>{
  const enough=count(r.walkForwardPlayerPeriodPredictions)>=200&&
   count(r.distinctHeldoutGames)>=30&&count(r.distinctHeldoutDates)>=20;
  const brier=n(r.poissonBrier),baseline=n(r.smoothedEmpiricalBrier);
  const improvement=brier!==null&&baseline!==null?Number((baseline-brier).toFixed(6)):null;
  const directional=improvement!==null&&improvement>0;
  const missing=[];
  if(!enough)missing.push("heldout_sample_or_game_diversity_below_gate");
  if(!directional)missing.push("no_brier_improvement_vs_rolling_empirical_baseline");
  if(r.gameClusterUncertaintyComputed!==true)missing.push("no_game_cluster_uncertainty");
  if(r.probabilityCalibrationApproved!==true)missing.push("no_independent_calibration_approval");
  if(r.realPlatformOfferedLinesUsed!==true)missing.push("synthetic_thresholds_not_actual_platform_lines");
  return {key,period:r.period,market:r.market,observations:count(r.walkForwardPlayerPeriodPredictions),
   games:count(r.distinctHeldoutGames),dates:count(r.distinctHeldoutDates),
   modelBrier:brier,baselineBrier:baseline,brierImprovement:improvement,
   sufficientExploratorySample:enough,beatsExploratoryBaseline:directional,
   releaseApproved:false,missing};
 });
 return {evaluatedMarkets:rows.length,marketsWithExploratorySample:rows.filter(r=>r.sufficientExploratorySample).length,
  marketsBeatingSyntheticThresholdBaseline:rows.filter(r=>r.beatsExploratoryBaseline).length,
  actualProviderLineMarketsValidated:0,approvedMarkets:0,
  diagnosticOnly:true,markets:rows};
}
function auditPlatformSources(comboAudit,periodAudit){
 const structured=count(comboAudit?.withExactStructuredMembers);
 const periodResearch=count(periodAudit?.completeSourceAndModelResearchPreferences);
 return {comboRowsObserved:count(comboAudit?.comboRows),
  structuredComboRowsObserved:structured,
  periodRowsObserved:count(periodAudit?.periodRows),
  conditionalPeriodResearchRows:periodResearch,
  originalComboOfferAuthenticated:comboAudit?.originalProviderAuthenticated===true,
  originalPeriodOfferAuthenticated:periodAudit?.originalProviderOffersAuthenticated===true,
  originalPlatformSettlementVerified:
   comboAudit?.originalPlatformSettlementVerified===true&&
   periodAudit?.originalPlatformSettlementVerified===true,
  automaticPickSourceReady:false,
  gap:"Missing verified original PrizePicks/Underdog offer identity, complete combo member metadata, period/void rules and independent settlement records."};
}
function buildReleaseEvidence({periodHistory,walkforward,comboAudit,periodAudit,
 emptyDates=[],backfillStatus=null,now=new Date().toISOString()}={}){
 if(!Number.isFinite(iso(now)))throw Error("Valid evaluation timestamp required");
 const coverage=auditSeasonCoverage(periodHistory,emptyDates,backfillStatus);
 const source=auditPlatformSources(comboAudit,periodAudit);
 const calibration=auditCalibration(walkforward);
 const stages={
  "1_historical_coverage":{ready:coverage.historicalArchiveFullyCovered,detail:coverage},
  "2_original_platform_source":{ready:false,detail:source},
  "3_heldout_calibration":{ready:false,detail:calibration},
  "4_frozen_prospective_settlement":{ready:false,
   reason:"No verified original-quote pregame Git commit cohort, completed market-specific prospective grading, independently authenticated settlement, or approved calibration."},
  "5_lineup_release":{ready:false,
   reason:"Combo and period pick families remain excluded from the production optimizer until source, settlement, quality, dependency and platform payout rules are independently verified."}
 };
 return {schemaVersion:1,kind:"nhl_combo_period_release_evidence_v1",
  generatedAt:new Date(iso(now)).toISOString(),stages,
  automaticHigherLowerEnabled:false,optimizedLineupEligibilityEnabled:false,
  productionModelUnaffected:true,mlbProjectUnaffected:true,
  verifiedProspectiveHitRate:null,verifiedPlatformSettlementRate:null,
  expectedValue:null,officialWagersPlaced:0,
  note:"Automated research readiness, NOT model calibration or authorization to promote. Some tasks depend on future genuine provider records and completed games."};
}
/**
 * Create stable research-only PRE-COMMIT record from an actual quoted offer.
 * Does not assert original provider authenticity, platform settlement or
 * Git precommit; those are separate verifications made after Git push.
 */
function prepareResearchFreeze(offer,model,{asOf}={}){
 const captured=iso(offer?.sourceCapturedAt),now=iso(asOf),
  built=iso(model?.modelBuiltAt),starts=Array.isArray(offer?.eventStartsAt)?
    offer.eventStartsAt:[offer?.eventStartsAt];
 const eventTimes=starts.map(iso),players=offer?.memberPlayerIds||
  (Number.isInteger(offer?.officialPlayerId)?[offer.officialPlayerId]:[]);
 const ids=offer?.officialGameIds||
  (Number.isInteger(offer?.officialGameId)?[offer.officialGameId]:[]);
 const market=offer?.market,period=offer?.period;
 const combo=offer?.kind==="combo",singlePeriod=offer?.kind==="period";
 if(!combo&&!singlePeriod)return {eligible:false,reason:"not_period_or_combo"};
 if(!["PrizePicks","Underdog"].includes(offer?.platform)||
  typeof offer?.sourceQuoteId!=="string"||!offer.sourceQuoteId.trim()||
  typeof offer?.sourceVersion!=="string"||!offer.sourceVersion.trim())
  return {eligible:false,reason:"original_quote_locator_or_version_missing"};
 if(!Number.isFinite(offer?.line)||offer.line<0||
  typeof market!=="string"||!market||
  (singlePeriod&&![1,2,3].includes(period))||
  (combo&&period!=="full_game"))
  return {eligible:false,reason:"exact_market_period_or_line_missing"};
 if(!Array.isArray(players)||players.length!==(combo?2:1)||
  !players.every(x=>Number.isInteger(x)&&x>0)||
  uniq(players).length!==players.length||
  !Array.isArray(ids)||ids.length!==players.length||
  !ids.every(x=>Number.isInteger(x)&&x>=1000000000)||
  (combo&&eventTimes.length!==players.length)||
  (singlePeriod&&eventTimes.length!==1))
  return {eligible:false,reason:"exact_member_game_or_time_identity_missing"};
 if(![captured,now,built,...eventTimes].every(Number.isFinite)||
  built>captured||captured>now||now-captured>30*60000||
  eventTimes.some(t=>t<=now+15*60000||t<=captured))
  return {eligible:false,reason:"pregame_time_or_model_freeze_invalid"};
 if(!["Higher","Lower"].includes(model?.lean)||
  !Number.isFinite(model?.probability)||model.probability<=0||
  model.probability>=1||model?.researchOnly!==true)
  return {eligible:false,reason:"research_model_probability_or_direction_missing"};
 const snapshot={schemaVersion:1,kind:"nhl_period_combo_shadow_pregame_record",
  platform:offer.platform,sourceQuoteId:offer.sourceQuoteId,
  sourceVersion:offer.sourceVersion,sourceCapturedAt:offer.sourceCapturedAt,
  market,period,line:offer.line,playerIds:players,officialGameIds:ids,
  eventStartsAt:starts,modelBuiltAt:model.modelBuiltAt,
  modelVersion:model.modelVersion||"unverified",lean:model.lean,
  estimatedProbability:model.probability,asOf,
  originalPlatformAuthenticated:false,platformSettlementVerified:false,
  gitCommitPredatesEveryGame:false,verifiedProspectiveHitRate:null,
  eligibleForAutomaticHigherLower:false,eligibleForOptimizedLineups:false};
 const sha256=crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
 return {eligible:true,researchOnly:true,localFreezeHash:sha256,
  record:snapshot,
  warning:"Local SHA is not proof of pregame Git archival; no authenticated quote or verified platform outcome."};
}
module.exports={auditSeasonCoverage,auditCalibration,auditPlatformSources,
 buildReleaseEvidence,prepareResearchFreeze};