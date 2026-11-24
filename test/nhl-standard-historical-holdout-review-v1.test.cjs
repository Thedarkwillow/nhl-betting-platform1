"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {review}=require("../src/nhl-standard-historical-holdout-review-v1.cjs");
test("historical holdout remains synthetic and cannot approve the model",()=>{
 const holdout=Object.fromEntries(["shotsOnGoal","points","assists","blockedShots"].map(m=>
  [m,{games:40,thresholds:2000,baselineBrier:.16,
   challengerBrier:.159,pairedGameCI:{lower:-.002,upper:.001},
   expectedIceTimeAdjustmentAblation:{enhancedBrier:.159,rawPriorCountMeanBrier:.161,enhancedMinusNoIceTimeBrier:-.002,pairedGameCI:{lower:-.004,upper:.001}},
   pregamePowerPlayUsageEvidenceStrata:{present:{thresholds:3,enhancedBrier:.15},absent:{thresholds:2,enhancedBrier:.18}},
   prespecifiedGridHoldout:[{weights:[0,0,0],holdoutBrier:.16,
    modelMinusBaselineBrier:0,pairedGameCI:{lower:0,upper:0}}]}]));
 const chosen=Object.fromEntries(Object.keys(holdout).map(m=>
  [m,{trainingGames:1100,weights:[1,0,0]}]));
 const r=review({kind:"nhl_position_multiseason_weight_trial_v3",
  selectionSeason:"2025-26",evaluationSeason:"2026-27",
  syntheticOnly:true,holdout,chosen,cutoff:"2026-11-20"});
 a.equal(r.status,"historical_2026_27_evaluated");
 a.equal(r.byMarket.points.enhancedMinusBaselineBrier<0,true);
 a.equal(r.byMarket.points.gridAblations.length,1);
 a.equal(r.independentExpectedIceTimeCounterfactualTested,true);
 a.equal(r.independentPowerPlayLineupCounterfactualTested,false);
 a.equal(r.byMarket.points.clusterCIExcludesZeroInFavorOfEnhanced,false);
 a.equal(r.historicallyValidatedBettingEdge,false);
 a.equal(r.modelPromoted,false);
});
test("rejects missing or incorrect season lineage",()=>{
 a.equal(review(null).status,"historical_source_not_eligible");
 a.equal(review({kind:"nhl_position_multiseason_weight_trial_v3",
  selectionSeason:"2026-27",evaluationSeason:"2026-27",
  syntheticOnly:true,chosen:{},holdout:{}}).status,
  "historical_source_not_eligible");
});