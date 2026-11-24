"use strict";
/**
 * Exploratory 2025-only market model selection evaluated descriptively on 2026.
 * The development choices and this code were authored after 2026 results were
 * already available. Thus this is NOT an untouched/blinded prospective holdout.
 */
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const MODELS=Object.freeze(["career_mean","last5_mean","last10_mean","shrunk_last5","ewma_035"]);
const MIN_DEV=100,MIN_EVAL=75,MIN_WEEKS=8;
function select(report){
 if(report?.kind!=="nfl_retro_chronological_stats_only_v1"||
  report.alwaysUsePriorWeeksOnly!==true||
  report.historicalPrizePicksLinesMatched!==false||
  report.historicalUnderdogLinesMatched!==false||
  !Array.isArray(report.byMarketYear))
  throw Error("Expected strictly retrospective stats-only NFL source report");
 const dev=new Map(report.byMarketYear.filter(x=>x.year===2025).map(x=>[x.market,x]));
 const test=new Map(report.byMarketYear.filter(x=>x.year===2026).map(x=>[x.market,x]));
 const selections=[],unavailable=[];
 for(const [market,d] of [...dev].sort((a,b)=>a[0].localeCompare(b[0]))){
  const t=test.get(market);
  if(!t||d.pairedObservations<MIN_DEV||t.pairedObservations<MIN_EVAL||
     d.distinctWeeks<MIN_WEEKS||t.distinctWeeks<MIN_WEEKS){
   unavailable.push({market,reason:"insufficient_matching_2025_dev_and_2026_retro_test"});continue;
  }
  if(!MODELS.every(name=>Number.isFinite(d.models?.[name]?.mae)&&
      Number.isFinite(t.models?.[name]?.mae)))
   throw Error("Incomplete paired NFL model comparison: "+market);
  const ranked=[...MODELS].sort((a,b)=>d.models[a].mae-d.models[b].mae||
    MODELS.indexOf(a)-MODELS.indexOf(b));
  const chosen=ranked[0],held=t.models[chosen],base=t.models.last5_mean;
  const change=base.mae-held.mae;
  selections.push({market,selectedFromYear:2025,chosenBy:"lowest_2025_MAE",
   selectedModel:chosen,developmentSample:d.pairedObservations,
   retrospective2026Sample:t.pairedObservations,
   developmentMAE:d.models[chosen].mae,
   test2026ChosenMAE:held.mae,baseline2026Last5MAE:base.mae,
   test2026AbsoluteImprovementVsLast5:Number(change.toFixed(4)),
   test2026RelativeImprovementPercent:base.mae>0?
    Number((100*change/base.mae).toFixed(2)):null,
   retrospective2026WeekBootstrapCI:held.improvementWeekBootstrap95,
   selectedFrom2026Results:false,originalPlatformLineHitRate:null});
 }
 if(!selections.length)throw Error("NFL development/test comparison has no eligible markets");
 return {schemaVersion:1,kind:"nfl_2025_development_model_selection_2026_retro_v1",
  sourceKind:report.kind,sourceGeneratedAt:report.generatedAt,
  developmentYear:2025,retrospectiveComparisonYear:2026,
  selectionRule:"min 2025 MAE per market (fixed deterministic tie order)",
  eligibleModels:MODELS,minimumDevelopmentObservations:MIN_DEV,
  minimum2026Observations:MIN_EVAL,minimumIndependentWeeks:MIN_WEEKS,
  developmentSelectionUsed2026OutcomeRows:false,
  modelResearchMethodDesignedAfter2026ResultsExisted:true,
  independentBlindedHoldoutVerified:false,
  noProspectivePredictions:true,
  truePrizePicksHitRate:null,trueUnderdogHitRate:null,
  prizePicksLineEV:null,autoPickEligible:false,allowModelPromotion:false,
  notProofOfBettingEdge:true,
  selectedMarkets:selections.length,
  selectedMarketsLowerMAEThanLast5In2026:selections.filter(x=>x.test2026AbsoluteImprovementVsLast5>0).length,
  selections,unavailable};
}
function main(){
 const input=path.join(ROOT,"outputs/nfl/backtests/stats-only-latest.json");
 const report=select(JSON.parse(fs.readFileSync(input,"utf8")));
 const target=path.join(ROOT,"outputs/nfl/backtests/2025-dev-model-selection-latest.json");
 fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({status:"development_selected_retrospective_only",
  selectedMarkets:report.selectedMarkets,
  positiveVsLast5:report.selectedMarketsLowerMAEThanLast5In2026,
  models:report.selections.map(x=>({market:x.market,chosen:x.selectedModel,
   developmentN:x.developmentSample,test2026N:x.retrospective2026Sample,
   relativeImprovementPct:x.test2026RelativeImprovementPercent})),
  originalPlatformHitRate:null}));
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={MODELS,select};
