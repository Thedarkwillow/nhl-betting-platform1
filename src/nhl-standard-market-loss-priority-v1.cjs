"use strict";
/**
 * Error budget, not a fitted forecast. Diagnose the SAME original first-Git
 * Standard offers vs always-Higher and always-Lower, by original market.
 * The priority order is descriptive/post-hoc and may NEVER choose a future
 * production direction, threshold, calibrated probability, or payout EV.
 */
const KIND="nhl_standard_original_market_loss_priority_v1";
const markets=["shotsOnGoal","blockedShots","points","assists"];
const probability=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=1;
function audit(source){
 const base={kind:KIND,status:"unverified_source",markets:[],totalDecided:0,
  actionableConfidenceApproved:false,modelChanged:false,bettingEligible:false,
  diagnosticOnly:true,selectedMarketMustBeRetestedOnUntouchedFutureDates:true};
 if(source?.kind!=="nhl_future_first_git_standard_vs_baseline_clusters_v1"||
    source.status!=="original_pregame_research_only"||
    !Number.isInteger(source.decided)||source.decided<1||
    !Number.isInteger(source.distinctPacificSlates)||source.distinctPacificSlates<1||
    !source.byOriginalMarket)return base;
 const entries=[];
 for(const market of markets){
  const r=source.byOriginalMarket[market];
  if(!r)continue;
  if(!Number.isInteger(r.decided)||r.decided<1||
     ![r.modelHitRate,r.alwaysHigherSameLineHitRate,
       r.alwaysLowerSameLineHitRate].every(probability)||
     Math.abs(r.alwaysHigherSameLineHitRate+r.alwaysLowerSameLineHitRate-1)>1e-7)
   return {...base,status:"invalid_market_comparison"};
  const delta=(r.modelHitRate-r.alwaysLowerSameLineHitRate),
   winsBehindLower=(r.alwaysLowerSameLineHitRate-r.modelHitRate)*r.decided;
  entries.push({market,decided:r.decided,modelHitRate:r.modelHitRate,
   alwaysHigherSameLine:r.alwaysHigherSameLineHitRate,
   alwaysLowerSameLine:r.alwaysLowerSameLineHitRate,
   modelMinusLower:delta,modelMinusHigher:r.modelHitRate-r.alwaysHigherSameLineHitRate,
   expectedAdditionalWinsToMatchLower:Number(Math.max(0,winsBehindLower).toFixed(6)),
   slateCluster95VsLower:r.slateCluster95??null,
   postHocNotASelectionCriterion:true,
   marketEdgeValidated:false});
 }
 // Other markets (e.g. goals) are never silently removed from total.
 // We explicitly count only the audited four Standard prop markets here.
 entries.sort((a,b)=>b.expectedAdditionalWinsToMatchLower-
  a.expectedAdditionalWinsToMatchLower||b.decided-a.decided);
 return {...base,status:"source_verified_descriptive_only",
  totalDecided:source.decided,distinctPacificSlates:source.distinctPacificSlates,
  markets:entries,mostModelWinsLostVsAlwaysLower:entries[0]?.market??null,
  totalMarketDecisionsIncluded:entries.reduce((n,r)=>n+r.decided,0),
  needsMinimumTwentySlates:source.distinctPacificSlates<20,
  automaticPolicySelection:false,originalPlatformPayoutVerified:false,
  newModelImprovementProven:false};
}
module.exports={KIND,audit};
