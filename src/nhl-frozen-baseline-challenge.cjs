"use strict";
/**
 * EDGE-04/P03-06: predeclared prospective, SAME-THRESHOLD directional
 * baseline research. All rows come from original Git precommitted selections.
 * Nothing here authenticates a first-party platform offer, alternative
 * book pricing, or real payout. No predictions or live picks are changed.
 */
const KIND="nhl_frozen_same_threshold_baselines_v1";
const POLICY="nhl-standard-direction-baselines-v1";
// Fixed before trial outcomes: no stopping early after a favorable run.
const PRIMARY_TRIAL_END_UTC="2027-02-01T08:00:00Z";
const STATUS=new Set(["correct","incorrect","push","pending_official_player_stats"]);
const TIER=new Set(["Standard","Goblin","Demon"]);
const SIDE=new Set(["Higher","Lower"]);
const validTime=s=>typeof s==="string"&&Number.isFinite(Date.parse(s));
const safeResult=o=>o==="Higher"||o==="Lower"||o==="Push";
const pct=(n,d)=>d?Number((n/d).toFixed(6)):null;
function rowValid(r){
 if(!r||typeof r.id!=="string"||!r.id.trim()||
  !Number.isInteger(r.gameId)||!Number.isInteger(r.playerId)||
  !Number.isFinite(r.line)||r.line<0||!r.market||
  !TIER.has(r.tier)||!SIDE.has(r.selectedSide)||!STATUS.has(r.selectionStatus)||
  !["pending_official_player_stats","push"].includes(r.selectionStatus)&&
    !["correct","incorrect"].includes(r.selectionStatus))return false;
 if(![r.firstCaptureAt,r.firstResearchAt,r.firstGitCommittedAt,r.gameStartAt].every(validTime))
  return false;
 const t=[r.firstCaptureAt,r.firstResearchAt,r.firstGitCommittedAt,r.gameStartAt].map(Date.parse);
 // Git's %cI timestamp is second-precision; the matching model research
 // timestamp may have milliseconds inside that same second. No earlier full
 // second is tolerated, and first-commit provenance remains separately audited.
 const firstGitIsWholeSecond=!/[.]\d+(?:Z|[+-]\d\d:\d\d)$/.test(r.firstGitCommittedAt);
 const sameGitSecond=firstGitIsWholeSecond&&
   Math.floor(t[1]/1000)===Math.floor(t[2]/1000);
 if(t[0]>t[1]||(t[1]>t[2]&&!sameGitSecond)||t[2]>=t[3])return false;
 if(r.selectionStatus==="pending_official_player_stats")return r.officialResult==null;
 if(!safeResult(r.officialResult))return false;
 if(r.selectionStatus==="push")return r.officialResult==="Push"&&r.officialStat===r.line;
 if(!Number.isFinite(r.officialStat)||r.officialResult==="Push")return false;
 const actual=r.officialStat>r.line?"Higher":r.officialStat<r.line?"Lower":"Push";
 return actual===r.officialResult&&
  (r.selectionStatus==="correct") === (r.selectedSide===actual);
}
function paired(records){
 const played=records.filter(r=>r.selectionStatus!=="pending_official_player_stats"),
  decided=played.filter(r=>r.selectionStatus!=="push"),
  n=decided.length;
 const wins=r=>decided.reduce((a,x)=>a+(r(x)?1:0),0);
 const model=wins(r=>r.selectedSide===r.officialResult),
  higher=wins(r=>r.officialResult==="Higher"),
  lower=wins(r=>r.officialResult==="Lower");
 const changed=decided.filter(r=>r.selectedSide==="Lower");
 const result={observedSelected:records.length,ungraded:records.length-played.length,
  decided:n,pushes:played.length-n,
  distinctGames:new Set(decided.map(r=>r.gameId)).size,
  distinctGameDays:new Set(decided.map(r=>r.gameStartAt.slice(0,10))).size,
  higherModelChoices:decided.filter(r=>r.selectedSide==="Higher").length,
  lowerModelChoices:changed.length,
  modelWins:model,alwaysHigherWins:higher,alwaysLowerWins:lower,
  modelHitRate:pct(model,n),alwaysHigherRate:pct(higher,n),alwaysLowerRate:pct(lower,n),
  modelMinusAlwaysHigher:pct(model-higher,n),modelMinusAlwaysLower:pct(model-lower,n),
  // These are exact paired disagreements, never an independent-binomial comparison.
  modelWinsHigherLoses:changed.filter(r=>r.officialResult==="Lower").length,
  modelLosesHigherWins:changed.filter(r=>r.officialResult==="Higher").length,
  equivalentSidesAtOriginalPlatformVerified:false,actualPayoutEV:null};
 return result;
}
function seededCluster95(rows,{samples=4000,minGames=30,minDecisions=200,minLower=30}={}){
 const decided=rows.filter(r=>r.selectionStatus==="correct"||r.selectionStatus==="incorrect"),
  groups=new Map();
 for(const r of decided){if(!groups.has(r.gameId))groups.set(r.gameId,[]);groups.get(r.gameId).push(r);}
 const g=[...groups.values()],lower=decided.filter(r=>r.selectedSide==="Lower").length;
 if(decided.length<minDecisions||g.length<minGames||lower<minLower)
  return {status:"insufficient_distinct_future_game_evidence",interval95:null,
   minDecisions,minGames,minLowerDecisions:minLower,
   actualDecisions:decided.length,actualGames:g.length,actualLowerDecisions:lower};
 let seed=0x52ab34cc;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const deltas=[];
 for(let b=0;b<samples;b++){
  let n=0,diff=0;
  for(let k=0;k<g.length;k++){
   const group=g[Math.floor(random()*g.length)];n+=group.length;
   for(const r of group){
    const m=r.selectedSide===r.officialResult,h=r.officialResult==="Higher";
    diff+=Number(m)-Number(h);
   }
  }
  if(n)deltas.push(diff/n);
 }
 deltas.sort((a,b)=>a-b);
 return {status:"preliminary_cluster_interval_computed",
  method:"deterministic_game_cluster_bootstrap_v1",samples,
  minDecisions,minGames,minLowerDecisions:minLower,
  actualDecisions:decided.length,actualGames:g.length,actualLowerDecisions:lower,
  interval95:{lower:Number(deltas[Math.floor(.025*(deltas.length-1))].toFixed(6)),
   upper:Number(deltas[Math.ceil(.975*(deltas.length-1))].toFixed(6))}};
}
function evaluate(ledger,{baselinePolicyGitCommittedAt=null,
 asOf=new Date().toISOString()}={}){
 const unavailable=why=>({kind:KIND,policy:POLICY,status:why,
  evidenceValid:false,baselinePolicyGitCommittedAt:null,
  historicalSameSelectedLines:null,postPolicySameSelectedLines:null,
  modelPromoted:false,bettingEdgeEstablished:false,payoutAdjustedEV:null});
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
  ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
  !Array.isArray(ledger.records)||!ledger.counts)return unavailable("missing_original_frozen_precommit_ledger");
 const ids=new Set(),totals={registered:0,correct:0,incorrect:0,push:0,pending:0};
 for(const r of ledger.records){
  if(!rowValid(r)||ids.has(r.id))return unavailable("unverified_source_or_official_outcome_conflict");
  ids.add(r.id);totals.registered++;
  const key={correct:"correct",incorrect:"incorrect",push:"push",
   pending_official_player_stats:"pending"}[r.selectionStatus];totals[key]++;
 }
 if(Object.keys(totals).some(k=>ledger.counts[k]!==totals[k]))
  return unavailable("source_ledger_status_count_mismatch");
 const locked=validTime(baselinePolicyGitCommittedAt)?Date.parse(baselinePolicyGitCommittedAt):null,
  future=locked===null?[]:ledger.records.filter(r=>Date.parse(r.firstGitCommittedAt)>locked&&
   Date.parse(r.firstGitCommittedAt)<Date.parse(PRIMARY_TRIAL_END_UTC)),
  subsets=rs=>({
   allFrozenSelections:paired(rs),
   standardDirectional:paired(rs.filter(r=>r.tier==="Standard")),
   goblinHigherOnly:paired(rs.filter(r=>r.tier==="Goblin")),
   demonHigherOnly:paired(rs.filter(r=>r.tier==="Demon")),
   byStandardMarket:Object.fromEntries([...new Set(rs.filter(r=>r.tier==="Standard").map(r=>r.market))]
    .sort().map(m=>[m,paired(rs.filter(r=>r.tier==="Standard"&&r.market===m))]))
  });
 const historical=subsets(ledger.records),trial=subsets(future),
  standardFuture=future.filter(r=>r.tier==="Standard"),
  interval=seededCluster95(standardFuture),
  declaredBeforeNewPicks=locked!==null,
  primaryWindowComplete=validTime(asOf)&&Date.parse(asOf)>=Date.parse(PRIMARY_TRIAL_END_UTC),
  improvement=primaryWindowComplete&&interval.interval95?.lower>0;
 return {kind:KIND,policy:POLICY,status:"valid_original_git_precommitted_selection_cohort",
  evidenceValid:true,
  baselinePolicyGitCommittedAt:declaredBeforeNewPicks?baselinePolicyGitCommittedAt:null,
  primaryEvaluationEndUTC:PRIMARY_TRIAL_END_UTC,
  primaryEvaluationWindowComplete:primaryWindowComplete,
  primaryStatisticalClaimPremature:!primaryWindowComplete,
  historicalSameSelectedLines:historical,
  postPolicySameSelectedLines:trial,
  postPolicyGameClusterModelMinusHigher95:interval,
  directionalStrategyProofEligible:false,
  modelOutperformedAlwaysHigherWithClusterSupport:improvement===true,
  // A positive CI would still need verified offered Higher availability,
  // frozen eligible-universe/ranking, out-of-sample calibration and payouts.
  predeclaredComparisonAtModelFreezeVerified:declaredBeforeNewPicks,
  alternativeHigherSideAvailabilityAuthenticated:false,
  allEligibleSourceOffersPreservedForBothPolicies:false,
  crossMarketPayoutComparabilityVerified:false,
  sportsbookImpliedProbabilityBaselineVerified:false,
  originalPlatformSettlementVerified:false,
  noCalibrationOrModelPromotion:true,modelPromoted:false,
  bettingEdgeEstablished:false,payoutAdjustedEV:null,
  interpretation:"Historical whole-cohort comparisons are descriptive only and include one-sided special tiers. Evaluate Higher-versus-Lower skill primarily in Standard, on equal frozen selected lines; no proof either side was an executable original-platform offer. Post-policy comparisons become prospectively predeclared only for newly Git-frozen picks.",
  methodology:"Count pushes in graded totals but omit from decided denominators. Sample paired wins/losses by NHL game, not independent prop rows. Do not select probability thresholds after viewing these outcomes. All model, Higher and Lower rates use identical originally selected player/game/market/line; no fair full-board strategy or betting ROI comparison yet."};
}
module.exports={KIND,POLICY,PRIMARY_TRIAL_END_UTC,rowValid,paired,seededCluster95,evaluate};
