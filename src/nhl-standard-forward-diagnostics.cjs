"use strict";
/**
 * No-fit / no-provider / private-only postgame diagnostics of originally
 * Git-committed Standard picks. These are descriptive errors, NOT evidence
 * that changing the selected side, market, or line would improve a strategy.
 */
const {rowValid}=require("./nhl-frozen-baseline-challenge.cjs");
const KIND="nhl_standard_frozen_postgame_miss_diagnostics_v1";
const MARKETS=["shotsOnGoal","points","assists","blockedShots","goals"];
const SIDES=["Higher","Lower"];
const isDecision=r=>r.selectionStatus==="correct"||r.selectionStatus==="incorrect";
const pct=(x,n)=>n?Number((x/n).toFixed(6)):null;
function pacificDay(dateTime){
 const at=Date.parse(dateTime);
 if(!Number.isFinite(at))return null;
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(at));
 const v=k=>parts.find(p=>p.type===k)?.value;
 return v("year")+"-"+v("month")+"-"+v("day");
}
function lineBucket(v){
 return v<=1.5?"line_at_most_1_5":v<=2.5?"line_2_0_to_2_5":"line_above_2_5";
}
function confidenceBucket(v){
 return v<.6?"50_to_59_pct":v<.7?"60_to_69_pct":v<.8?"70_to_79_pct":"80_to_100_pct";
}
function summarize(rows){
 const decided=rows.filter(isDecision);
 const correct=decided.filter(x=>x.selectionStatus==="correct").length;
 const high=decided.filter(x=>x.officialResult==="Higher").length;
 const lower=decided.filter(x=>x.officialResult==="Lower").length;
 const avg=(fn)=>decided.length?
  Number((decided.reduce((a,r)=>a+fn(r),0)/decided.length).toFixed(6)):null;
 return {registered:rows.length,decided:decided.length,correct,wrong:decided.length-correct,
  pushes:rows.filter(x=>x.selectionStatus==="push").length,
  pending:rows.filter(x=>x.selectionStatus==="pending_official_player_stats").length,
  distinctGames:new Set(decided.map(x=>x.gameId)).size,
  distinctDates:new Set(decided.map(x=>x.officialGameDate)).size,
  observedModelHitRate:pct(correct,decided.length),
  alwaysHigherSameLines:pct(high,decided.length),
  alwaysLowerSameLines:pct(lower,decided.length),
  meanEstimatedSelectedProbability:avg(x=>x.estimatedProbability),
  meanAbsoluteCalibrationGap:decided.length?
   Number(Math.abs(avg(x=>x.estimatedProbability)-pct(correct,decided.length)).toFixed(6)):null,
  brier:avg(x=>(x.estimatedProbability-Number(x.selectionStatus==="correct"))**2),
  logLoss:avg(x=>{const p=Math.max(1e-6,Math.min(1-1e-6,x.estimatedProbability));
   return x.selectionStatus==="correct"?-Math.log(p):-Math.log(1-p);}),
  meanOfficialStatMinusThreshold:avg(x=>Number.isFinite(x.officialStat)?
    x.officialStat-x.line:0),
  officialStatMissing:decided.filter(x=>!Number.isFinite(x.officialStat)).length};
}
function groups(rows,field){
 const bucket={};
 for(const r of rows){
  const k=field(r);
  (bucket[k]??=[]).push(r);
 }
 return Object.fromEntries(Object.keys(bucket).sort().map(k=>[k,summarize(bucket[k])]));
}
function audit(ledger){
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
  ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
  !Array.isArray(ledger.records)||!ledger.counts)
  return {kind:KIND,status:"unavailable_unproven_original_ledger",researchOnly:true};
 const seen=new Set(),tally={registered:0,correct:0,incorrect:0,push:0,pending:0};
 for(const r of ledger.records){
  if(!rowValid(r)||seen.has(r.id)||
   (isDecision(r)&&(!Number.isFinite(r.estimatedProbability)||
     r.estimatedProbability<=0||r.estimatedProbability>=1))||
   (isDecision(r)&&r.officialStat!==null&&
     (!Number.isFinite(r.officialStat)||r.officialStat<0)))
   return {kind:KIND,status:"unavailable_invalid_or_repeated_original",researchOnly:true};
  seen.add(r.id);tally.registered++;
  tally[r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus]++;
 }
 if(Object.keys(tally).some(k=>tally[k]!==ledger.counts[k]))
  return {kind:KIND,status:"unavailable_inconsistent_ledger_counts",researchOnly:true};
 const standard=ledger.records.filter(r=>r.tier==="Standard");
 const decided=standard.filter(isDecision);
 const latestDate=decided.map(r=>r.officialGameDate).filter(Boolean).sort().at(-1)||null;
 const last=standard.filter(r=>r.officialGameDate===latestDate||
  (r.selectionStatus==="pending_official_player_stats"&&
   pacificDay(r.gameStartAt)===latestDate));
 const markets=groups(standard,r=>r.market);
 const sog=standard.filter(r=>r.market==="shotsOnGoal");
 return {kind:KIND,status:"descriptive_original_precommitted_only",
  generatedAt:new Date().toISOString(),latestCompletedOfficialGameDate:latestDate,
  fullStandard:summarize(standard),lastCompletedDate:summarize(last),
  lastDateByMarket:groups(last,r=>r.market),
  lastDateBySelectedSide:groups(last,r=>r.selectedSide),
  byMarket:markets,bySide:groups(standard,r=>r.selectedSide),
  byMarketAndSide:groups(standard,r=>r.market+"|"+r.selectedSide),
  sogBySelectedSide:groups(sog,r=>r.selectedSide),
  sogByOriginalThreshold:groups(sog,r=>lineBucket(r.line)),
  sogByOriginalConfidence:groups(sog,r=>confidenceBucket(r.estimatedProbability)),
  sogByOpponent:groups(sog,r=>r.opponent||"opponent_unavailable"),
  // Prospective calibration/miss diagnostics across every Standard market.
  // Confidence is the original probability of the selected direction, not P(Higher).
  bySelectedConfidence:groups(standard,r=>confidenceBucket(r.estimatedProbability)),
  byMarketAndSelectedConfidence:groups(standard,r=>r.market+"|"+confidenceBucket(r.estimatedProbability)),
  byMarketAndSelectedSide:groups(standard,r=>r.market+"|"+r.selectedSide),
  byMarketAndLineBucket:groups(standard,r=>r.market+"|"+lineBucket(r.line)),
  fixedMarketOrder:MARKETS,fixedSideOrder:SIDES,
  source:"original_first_git_frozen_picks_plus_official_nhl_final_boxscores",
  unverifiedAuthenticPlatformSettlement:true,asOfLedgerBuiltAt:ledger.builtAt,
  noSideThresholdOrMarketRuleReoptimized:true,
  actionableModelChangeApproved:false,modelPromoted:false,
  interpretation:"Same selected lines only. Last-slate/market/opponent slices are diagnostic, correlated and prone to small-sample noise. Historical miss categories cannot justify retroactively changing predictions or fitting a winning rule."};
}
module.exports={KIND,MARKETS,SIDES,pacificDay,lineBucket,confidenceBucket,summarize,groups,audit};
