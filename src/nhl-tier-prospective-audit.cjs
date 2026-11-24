"use strict";
/**
 * Research-only comparison of strictly future, first-Git-frozen NHL props.
 * Never infer that the opposite Higher/Lower side was actually offered.
 * Never promote models, authenticate PrizePicks, or infer payout value.
 */
const KIND = "nhl_original_future_tier_accuracy_audit_v1";
const isTime = s => typeof s==="string" && Number.isFinite(Date.parse(s));
const valid = r => r && typeof r.id==="string" && r.id &&
  Number.isInteger(r.gameId) && ["Higher","Lower"].includes(r.selectedSide) &&
  ["Standard","Goblin","Demon"].includes(r.tier) &&
  Number.isFinite(r.estimatedProbability) &&
  r.estimatedProbability>0 && r.estimatedProbability<1 &&
  ["correct","incorrect"].includes(r.selectionStatus) &&
  ["Higher","Lower"].includes(r.officialResult) &&
  (r.selectionStatus==="correct") === (r.selectedSide===r.officialResult) &&
  typeof r.officialGameDate==="string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(r.officialGameDate) &&
  isTime(r.firstCaptureAt) && isTime(r.firstResearchAt) &&
  isTime(r.firstGitCommittedAt) && isTime(r.gameStartAt) &&
  Date.parse(r.firstCaptureAt)<=Date.parse(r.firstResearchAt) &&
  Date.parse(r.firstResearchAt)<=Date.parse(r.firstGitCommittedAt)+999 &&
  Date.parse(r.firstGitCommittedAt)<Date.parse(r.gameStartAt);
const round = x => x===null?null:Number(x.toFixed(6));
function summarize(rows,{comparators=false}={}){
  const n=rows.length;
  const output={decisions:n,distinctGames:new Set(rows.map(r=>r.gameId)).size,
    distinctGameDates:new Set(rows.map(r=>r.officialGameDate)).size,
    winCount:rows.filter(r=>r.selectionStatus==="correct").length,
    observedHitRate:null,meanRawProbability:null,rawCalibrationGap:null,rawBrier:null,
    hypotheticalAlwaysHigherHitRate:null,hypotheticalAlwaysLowerHitRate:null,
    relativeToBestHypotheticalBaseline:null};
  if(!n)return output;
  const avg=f=>rows.reduce((s,r)=>s+f(r),0)/n;
  output.observedHitRate=round(output.winCount/n);
  output.meanRawProbability=round(avg(r=>r.estimatedProbability));
  output.rawCalibrationGap=round(output.meanRawProbability-output.observedHitRate);
  output.rawBrier=round(avg(r=>(r.estimatedProbability-Number(r.selectionStatus==="correct"))**2));
  if(comparators){
    output.hypotheticalAlwaysHigherHitRate=round(avg(r=>Number(r.officialResult==="Higher")));
    output.hypotheticalAlwaysLowerHitRate=round(avg(r=>Number(r.officialResult==="Lower")));
    output.relativeToBestHypotheticalBaseline=round(output.observedHitRate-Math.max(
      output.hypotheticalAlwaysHigherHitRate,output.hypotheticalAlwaysLowerHitRate));
  }
  return output;
}
function audit(ledger,policyFirstCommittedAt){
  const blocked=reason=>({kind:KIND,status:"unavailable",reason,
    calibrationApproved:false,modelPromoted:false,optimizedLineupsApproved:false,
    payoutEVVerified:false,providerCalls:0});
  if(!isTime(policyFirstCommittedAt)||ledger?.kind!==
    "private_immutable_source_linked_nhl_selected_predictions"||
    ledger?.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
    !Array.isArray(ledger?.records))return blocked("missing_original_ledger_or_first_git_policy");
  const policyTime=Date.parse(policyFirstCommittedAt), ids=new Set(), rows=[];
  let invalidResolved=0,prePolicy=0,pushes=0,pending=0;
  for(const r of ledger.records){
    if(!r||typeof r.id!=="string"||!r.id||ids.has(r.id))
      return blocked("duplicate_or_invalid_original_id");
    ids.add(r.id);
    if(r.selectionStatus==="push"){pushes++;continue;}
    if(r.selectionStatus==="pending_official_player_stats"){pending++;continue;}
    if(!valid(r)){invalidResolved++;continue;}
    if(r.tier!=="Standard"&&r.selectedSide!=="Higher")continue;
    if(Date.parse(r.firstGitCommittedAt)<=policyTime||
      Date.parse(r.gameStartAt)<=policyTime){prePolicy++;continue;}
    rows.push(r);
  }
  if(invalidResolved)return blocked("invalid_resolved_pregame_outcome_in_ledger");
  const tiers={};
  for(const tier of ["Standard","Goblin","Demon"]){
    const selected=rows.filter(r=>r.tier===tier);
    const byMarket={};
    for(const market of [...new Set(selected.map(r=>r.market||"unknown"))].sort())
      byMarket[market]=summarize(selected.filter(r=>(r.market||"unknown")===market),
        {comparators:tier==="Standard"});
    tiers[tier]={...summarize(selected,{comparators:tier==="Standard"}),byMarket,
      calibrated:false,modelPromoted:false};
  }
  return {kind:KIND,status:"strict_future_research_only",
    policyFirstCommittedAt,excluded:{pushes,pending,prePolicy},
    tiers,
    standardVsSimpleHypotheticalBaselineOnSameSelectedLines:
      tiers.Standard.relativeToBestHypotheticalBaseline,
    standardBelowBestSimpleBaselineOnThisSample:
      tiers.Standard.decisions>0&&tiers.Standard.relativeToBestHypotheticalBaseline<0,
    calibrationApproved:false,modelPromoted:false,optimizedLineupsApproved:false,
    payoutEVVerified:false,providerCalls:0,
    sourceScope:"exact original first-Git-frozen selected sides only; no full-offer coverage",
    importantLimitations:[
      "Standard opposite sides are hypothetical: the original platform's availability is unverified",
      "Goblin and Demon offered sides are Higher only in this cohort; no opposite-side comparison",
      "Rows from the same NHL game and date are dependent, so raw hit rates are not independent evidence",
      "No validated calibration, profit, payout-adjusted expected value, or joint lineup probability"
    ]};
}
module.exports={KIND,audit,summarize};
