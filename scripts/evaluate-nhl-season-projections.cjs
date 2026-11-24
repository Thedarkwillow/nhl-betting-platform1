"use strict";
const fs=require("node:fs"),path=require("node:path");
const {collectOfficialSeasons,evaluateSeasonLab}=require("../src/nhl-season-model-lab.cjs");
const ROOT=path.resolve(__dirname,"..");
function load(rel){return JSON.parse(fs.readFileSync(path.join(ROOT,rel),"utf8"));}
function main(){
 const source=collectOfficialSeasons({
  reference2024:load("outputs/official-nhl/2024-25/referenced-players-latest.json"),
  officialLogs:load("outputs/oddspapi/nhl/official-historical-player-logs-latest.json")
 });
 const result={...evaluateSeasonLab(source),generatedAt:new Date().toISOString(),
  sources:["Official NHL 2024-25 referenced-player logs","Official NHL 2025-26 independently cached game logs"],
  historicalLineResearch:{
   separateReport:"outputs/oddspapi/nhl/retrospective-model-latest.json",
   originalHistoricOfferModelForecastsArchivedPregame:false,
   retrospectiveModelHitRatesAreProspective:false,
   caution:"Historical official boxscore outcomes can be verified; historical model picks were reconstructed, not originally timestamped predictions."
  }};
 if(result.evaluatedTrainingRows<1||result.evaluatedHoldoutRows<1)
  throw Error("Missing two-season evaluation observations; report not publishable");
 fs.mkdirSync(path.join(ROOT,"outputs","backtests"),{recursive:true});
 fs.writeFileSync(path.join(ROOT,"outputs/backtests/nhl-official-season-projection-lab-latest.json"),JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({
  training:result.evaluatedTrainingRows,holdout:result.evaluatedHoldoutRows,
  sourceCounts:result.sourceCounts,
  markets:Object.fromEntries(Object.entries(result.byMarket).map(([key,v])=>
   [key,{selected2024:v.selectedOn2024Only,train:v.training.playerGames,
    holdout:v.holdout.playerGames,championMae:v.championHoldoutMae,
    challengerMae:v.shadowHoldoutMae,improvement:v.measuredShadowImprovement,
    eligibleToDeploy:v.eligibleToDeploy}]))
 }));
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e.message);process.exitCode=1}
module.exports={main};
