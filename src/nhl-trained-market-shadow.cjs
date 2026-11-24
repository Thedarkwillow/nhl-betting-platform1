"use strict";
/**
 * Market-trained, read-only NHL projection challenger.
 *
 * Select the estimator for each market exclusively from 2024-25 official
 * training observations. Report 2025-26 performance AFTER selection; never
 * feed the holdout into a model-choice decision. No synthetic fantasy lines,
 * settled picks, payout claims, bets, or production model promotion.
 */
const {createHash}=require("node:crypto");
const {MARKETS,candidateMeans}=require("./nhl-season-model-lab.cjs");
const CHOICES=Object.freeze(["weighted-form-v1","prior-mean","stable-blend","stable-shrink-v2"]);
const MIN_ROWS=1000,MIN_GAMES=100,MIN_DATES=30;
const round=n=>Number(n.toFixed(6));
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0,24);
function selectTrainingPolicies(lab){
 if(lab?.kind!=="nhl_official_stat_two_season_projection_lab"||
    lab.trainingSeason!=="2024-25"||lab.holdoutSeason!=="2025-26"||
    !lab.byMarket||typeof lab.byMarket!=="object")
  throw Error("Expected 2024-25 training / 2025-26 evaluation official NHL research report");
 const policies={};
 for(const market of MARKETS){
  const sample=lab.byMarket[market]?.training||{};
  const rows=sample.playerGames||0,games=sample.distinctGames||0,dates=sample.distinctDates||0;
  const eligible=Number.isInteger(rows)&&rows>=MIN_ROWS&&
   Number.isInteger(games)&&games>=MIN_GAMES&&
   Number.isInteger(dates)&&dates>=MIN_DATES&&
   CHOICES.every(name=>Number.isFinite(sample.models?.[name]?.mae)&&sample.models[name].mae>=0);
  const ranked=eligible?CHOICES.slice().sort((a,b)=>
   sample.models[a].mae-sample.models[b].mae||CHOICES.indexOf(a)-CHOICES.indexOf(b)):[];
  const chosen=ranked[0]||null;
  // This is a consistency check, not a lookup into the holdout.
  if(chosen&&lab.byMarket[market].selectedOn2024Only!==chosen)
   throw Error("Training-only selector disagrees with frozen official-season lab: "+market);
  const trainingErrors=eligible?Object.fromEntries(CHOICES.map(m=>[m,sample.models[m].mae])):null;
  policies[market]={method:chosen,
   status:chosen?"eligible_training_only":"not_trainable_from_2024_sample",
   trainingRows:rows,trainingGames:games,trainingDates:dates,trainingMAE:trainingErrors,
   holdoutUsedToSelect:false};
 }
 const proof=MARKETS.map(k=>[k,policies[k]]);
 return {schemaVersion:1,kind:"nhl_2024_training_only_market_selection_v1",
  policyId:"nhl-2024-train-market-v3-"+hash(proof),
  trainedOn:"2024-25",holdoutSeason:"2025-26",
  minimumTrainingRows:MIN_ROWS,minimumDistinctGames:MIN_GAMES,
  minimumDistinctDates:MIN_DATES,
  hyperparametersChosenUsingHoldout:false,policies};
}
function buildMarketTrainedShadow(history,lab,{asOf=new Date().toISOString()}={}){
 const parsed=Date.parse(asOf);
 if(!Number.isFinite(parsed)||!history?.players||typeof history.players!=="object")
  throw Error("Official player histories and valid model evaluation time required");
 const cutoff=new Date(parsed).toISOString().slice(0,10);
 const policy=selectTrainingPolicies(lab),players={};
 let readyPlayers=0,readyMarkets=0;
 for(const [id,p] of Object.entries(history.players)){
  if(!p||!Array.isArray(p.games)||!["skater","goalie"].includes(p.type))
   continue;
  // End-of-day exclusion means even a previous game on today's UTC date
  // cannot leak into a model snapshot for another game that day.
  const past=p.games.filter(g=>/^\d{4}-\d{2}-\d{2}$/.test(g?.gameDate||"")&&
   g.gameDate<cutoff).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||
    Number(a.gameId||0)-Number(b.gameId||0));
  const fields=p.type==="goalie"?["saves"]:MARKETS.filter(m=>m!=="saves");
  const projections={};let playerReady=false;
  for(const market of fields){
   const observations=past.map(g=>g[market]).filter(x=>Number.isInteger(x)&&x>=0);
   const method=policy.policies[market].method,ready=!!method&&observations.length>=5;
   const estimate=ready?candidateMeans(observations)[method]:null;
   if(ready&&(!Number.isFinite(estimate)||estimate<0))
    throw Error("Invalid NHL market trained estimate");
   projections[market]={estimate:ready?Number(estimate.toFixed(3)):null,
    ready,observations:observations.length,
    method:method||null,
    source:"official_nhl_past_only",eligibleToDeploy:false,
    lastHistoricalGameDate:past.at(-1)?.gameDate||null};
   if(ready){playerReady=true;readyMarkets++;}
  }
  if(playerReady)readyPlayers++;
  players[id]={playerId:p.playerId,name:p.name,team:p.team,type:p.type,
   gamesBeforeCutoff:past.length,projections};
 }
 return {schemaVersion:1,model:"nhl-market-trained-v3-shadow",
  status:"research_shadow_not_deployed",builtAt:new Date(parsed).toISOString(),
  latestIncludedGameDateMustPrecede:cutoff,
  trainingPolicyId:policy.policyId,trainingSeason:"2024-25",
  holdoutNotUsedForMethodSelection:true,probabilityCalibrated:false,
  prospectiveHitRateVerified:false,originalFantasyPlatformSettlementsVerified:false,
  inferredPayouts:false,productionModelUnchanged:true,
  playerCount:Object.keys(players).length,readyPlayers,readyMarketProjections:readyMarkets,
  training:policy,players};
}
/** Interpret historical holdout AFTER choosing each training-only method.
 * Not an untouched preregistered prospective experiment.
 */
function compareHistoricalHoldout(lab,policy=selectTrainingPolicies(lab)){
 const markets={};let evaluated=0,improved=0;
 for(const market of MARKETS){
  const chosen=policy.policies[market].method,
   holdout=lab.byMarket[market]?.holdout||{};
  const champion=holdout.models?.["weighted-form-v1"]?.mae;
  const challenger=chosen?holdout.models?.[chosen]?.mae:null;
  const eligible=chosen&&Number.isFinite(champion)&&Number.isFinite(challenger)&&
   holdout.playerGames>=100&&holdout.distinctGames>=20;
  const delta=eligible?round(champion-challenger):null;
  if(eligible){evaluated++;if(delta>0)improved++;}
  markets[market]={selectedOn2024Only:chosen,trainingRows:policy.policies[market].trainingRows,
   holdoutRows:holdout.playerGames||0,championMAE:Number.isFinite(champion)?champion:null,
   challengerMAE:eligible?challenger:null,
   championMinusChallengerMAE:delta,
   eligibleForFutureResearch:!!eligible,
   eligibleForProductionPromotion:false};
 }
 return {schemaVersion:1,kind:"nhl_market_trained_v3_official_holdout_audit",
  policyId:policy.policyId,trainSeason:"2024-25",holdoutSeason:"2025-26",
  marketsEvaluated:evaluated,marketsWithLowerObservedHoldoutMAE:improved,byMarket:markets,
  modelPromoted:false,publishedLineHitRate:null,verifiedPayoutAdjustedEV:null,
  trulyUntouchedProspectiveHoldout:false,
  warning:"The holdout has already been inspected in prior research. These are selected historical player-stat forecasts, not prospectively frozen PrizePicks selections or independent payouts. Prospective calibration and 30+ games needed before promotion."};
}
module.exports={CHOICES,selectTrainingPolicies,buildMarketTrainedShadow,
 compareHistoricalHoldout,MIN_ROWS,MIN_GAMES,MIN_DATES};
