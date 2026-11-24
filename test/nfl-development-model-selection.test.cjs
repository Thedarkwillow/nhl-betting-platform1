"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {MODELS,select}=require("../scripts/select-nfl-models-on-2025.cjs");
const m=(overrides={})=>Object.fromEntries(MODELS.map((name,i)=>[name,{
 mae:i===0?2:i===1?1:3+i,improvementWeekBootstrap95:null,...overrides[name]}]));
test("choose solely 2025 minimizing MAE even when 2026 favors different model",()=>{
 const report={kind:"nfl_retro_chronological_stats_only_v1",
  alwaysUsePriorWeeksOnly:true,historicalPrizePicksLinesMatched:false,
  historicalUnderdogLinesMatched:false,generatedAt:"now",
  byMarketYear:[
   {year:2025,market:"passing_yards",pairedObservations:200,distinctWeeks:18,
    models:m()},
   {year:2026,market:"passing_yards",pairedObservations:100,distinctWeeks:9,
    models:m({career_mean:{mae:0.5},last5_mean:{mae:2}})}
  ]};
 const x=select(report);
 assert.equal(x.selections[0].selectedModel,"last5_mean");
 assert.equal(x.selections[0].test2026RelativeImprovementPercent,0);
 assert.equal(x.developmentSelectionUsed2026OutcomeRows,false);
 assert.equal(x.independentBlindedHoldoutVerified,false);
 assert.equal(x.autoPickEligible,false);
 assert.equal(x.truePrizePicksHitRate,null);
});
test("no bad cohort or archived offer lines silently enter model selection",()=>{
 const report={kind:"nfl_retro_chronological_stats_only_v1",
  alwaysUsePriorWeeksOnly:true,historicalPrizePicksLinesMatched:false,
  historicalUnderdogLinesMatched:false,byMarketYear:[]};
 assert.throws(()=>select(report),/no eligible/);
 assert.throws(()=>select({...report,historicalPrizePicksLinesMatched:true}),/Expected strictly/);
});
