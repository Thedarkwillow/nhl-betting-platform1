"use strict";
/**
 * Individual NHL 1P/2P/3P period-specific research means and strictly
 * forward-only diagnostic evaluation. NEVER divide full-game rates by 3,
 * count unplayed periods as zero or use period outcomes from the offer date.
 * All model calculations use predeclared fixed weights and no holdout tuning.
 */
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const MIN_PERIOD_GAMES=8;
const COUNT_MARKETS=Object.freeze([
 "shotsOnGoal","goals","assists","points","blockedShots","saves",
 "hits","faceoffsWon","goalsAgainst"
]);
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||"");
const round=n=>Number(n.toFixed(5));
const average=a=>a.reduce((s,n)=>s+n,0)/a.length;
// Deterministic game-cluster bootstrap of model-minus-rolling-empirical Brier.
// Resamples full NHL games, never independent player/threshold rows.
// This is only for synthetic-threshold exploratory model comparisons.
function bootstrapGameBrierDifference(groups,{replicates=400}={}){
 if(!Array.isArray(groups)||groups.length<10)return null;
 if(groups.some(g=>!Number.isFinite(g.diff)||!Number.isInteger(g.n)||g.n<=0))
  return null;
 let seed=0x71aab91f;
 const values=[];
 for(let i=0;i<replicates;i++){
  let diff=0,n=0;
  for(let j=0;j<groups.length;j++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   const g=groups[Math.floor(seed/4294967296*groups.length)];
   diff+=g.diff;n+=g.n;
  }
  values.push(diff/n);
 }
 values.sort((a,b)=>a-b);
 return {lower:round(values[Math.floor(.025*(replicates-1))]),
  upper:round(values[Math.ceil(.975*(replicates-1))]),
  simulations:replicates,unit:"NHL_official_game_cluster",
  interpretation:"Model minus rolling smoothed empirical Brier on synthetic thresholds; negative values favor model, NOT platform settlement or payout edge"};
}
function observedPeriodHistory(history,playerId,period,market,asOf){
 const date=new Date(Date.parse(asOf)).toISOString().slice(0,10);
 if(!COUNT_MARKETS.includes(market)||![1,2,3].includes(period))return [];
 const rows=history?.players?.[String(playerId)]?.[String(period)];
 return (Array.isArray(rows)?rows:[]).filter(r=>
  r.playedInPeriod===true&&r.period===period&&validDate(r.gameDate)&&
  r.gameDate<date&&Number.isInteger(r.gameId)&&r.gameId>0&&
  Number.isInteger(r[market])&&r[market]>=0)
  .sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
}
function periodCountModel(rows,market){
 const values=rows.map(r=>r[market]),n=values.length;
 if(n<MIN_PERIOD_GAMES)return null;
 const season=average(values),last5=average(values.slice(-5)),
  last10=average(values.slice(-10));
 const mean=Math.max(0,0.5*season+0.3*last10+0.2*last5);
 return {estimate:round(mean),count:n,
  seasonMean:round(season),last5Mean:round(last5),
  last10Mean:round(last10),
  firstIncludedGameDate:rows[0].gameDate,
  lastIncludedGameDate:rows.at(-1).gameDate,
  model:"nhl-regulation-period-fixed-form-shadow-v1",
  distribution:"poisson-unvalidated-v0",
  calibrated:false,probabilityHigher:null,probabilityLower:null,
  originalPlatformSettlementVerified:false,
  readyForResearch:true,readyForLineups:false};
}
function buildPeriodMarketResearch(history,{asOf=new Date().toISOString()}={}){
 const clock=Date.parse(asOf);
 if(history?.kind!=="nhl_official_period_history_v1"||
  !history.players||!Number.isFinite(clock))
  throw Error("Official period history and valid as-of required");
 const players={},coverage={},date=new Date(clock).toISOString().slice(0,10);
 for(const period of [1,2,3])for(const market of COUNT_MARKETS)
  coverage[period+"|"+market]={playersWith8PriorObservations:0,
   totalHistoricalObservations:0};
 for(const [id,periods] of Object.entries(history.players)){
  const forecasts={};
  for(const period of [1,2,3]){
   const result={};
   for(const market of COUNT_MARKETS){
    const rows=observedPeriodHistory(history,id,period,market,asOf);
    const cv=coverage[period+"|"+market];
    cv.totalHistoricalObservations+=rows.length;
    const model=periodCountModel(rows,market);
    if(model){result[market]=model;cv.playersWith8PriorObservations++;}
   }
   if(Object.keys(result).length)forecasts[String(period)]=result;
  }
  if(Object.keys(forecasts).length)players[id]=forecasts;
 }
 return {schemaVersion:1,kind:"nhl_regulation_period_model_shadow",
  builtAt:new Date(clock).toISOString(),cutoffDateExclusive:date,
  sourcePeriodHistoryDates:history.sourceDates?.length||0,
  modeledCountMarkets:COUNT_MARKETS,
  requiredPriorCompletedGamesPerPlayerPeriod:MIN_PERIOD_GAMES,
  periodModelMethod:"fixed predeclared 50% season, 30% last 10, 20% last 5",
  periodCountsDoNotDeriveFromFullGameDivision:true,
  playerCount:Object.keys(players).length,coverage,players,
  noOriginalPlatformLineQuotesUsed:true,estimatedHitRate:null,
  calibrated:false,productionEligible:false,
  automaticLineupEligible:false,sourceSettlementVerified:false,
  note:"Fixed exploratory expected counts only. Requires pregame original offer period, role and participant rules and out-of-sample model validation before generating platform picks."};
}
function walkForwardPeriodDiagnostics(history,{fromDate=null,toDate=null}={}){
 if(history?.kind!=="nhl_official_period_history_v1"||!history.players)
  throw Error("Official NHL period history required for walk-forward");
 const byMarket={},allDates=new Set();
 const thresholds=[0.5,1.5,2.5];
 for(const [id,periods] of Object.entries(history.players)){
  for(const p of [1,2,3]){
   const rows=periods[String(p)]||[];
   for(const market of COUNT_MARKETS){
    const historyRows=rows.filter(r=>r.playedInPeriod===true&&
     validDate(r.gameDate)&&Number.isInteger(r.gameId)&&
     Number.isInteger(r[market])&&r[market]>=0)
     .sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
    for(const row of historyRows){
     if(fromDate&&row.gameDate<fromDate||toDate&&row.gameDate>toDate)continue;
     const prior=historyRows.filter(x=>x.gameDate<row.gameDate);
     const model=periodCountModel(prior,market);
     if(!model)continue;
     const k=p+"|"+market,stats=byMarket[k]||{
      period:p,market,predictions:0,totalAbsError:0,
      baselineAbsError:0,thresholdEvaluations:0,
      brierSum:0,rollingEmpiricalBrierSum:0,baselineBrierSum:0,
      blendBrierSum:0,blendLogLoss:0,poissonLogLoss:0,blendGameBrierById:new Map(),blendReliability:Array.from({length:10},()=>({n:0,sumP:0,sumY:0})),
      gameIds:new Set(),gameDates:new Set(),gameBrierById:new Map()};
     const observed=row[market],mean=average(prior.map(x=>x[market]));
     stats.predictions++;
     stats.totalAbsError+=Math.abs(observed-model.estimate);
     stats.baselineAbsError+=Math.abs(observed-mean);
     stats.gameIds.add(row.gameId);stats.gameDates.add(row.gameDate);
     allDates.add(row.gameDate);
     const gameBrier=stats.gameBrierById.get(row.gameId)||{diff:0,n:0};
     const blendGame=stats.blendGameBrierById.get(row.gameId)||{diff:0,n:0};
     for(const line of thresholds){
      const probability=estimateCountProbabilities(model.estimate,line);
      if(!probability)continue;
      const outcome=Number(observed>line),pHigher=probability.higher;
      const empirical=(prior.filter(r=>r[market]>line).length+1)/(prior.length+2);
      const alwaysPrior=prior.filter(r=>r[market]>line).length/prior.length;
      // Fixed, prior-only blend; never fit weights on scored outcomes.
      const blend=.5*pHigher+.5*empirical;
      const clip=x=>Math.max(1e-9,Math.min(1-1e-9,x));
      const loss=x=>-(outcome*Math.log(clip(x))+(1-outcome)*Math.log(1-clip(x)));
      stats.blendBrierSum+=(blend-outcome)**2;
      stats.blendLogLoss+=loss(blend);stats.poissonLogLoss+=loss(pHigher);
      blendGame.diff+=(blend-outcome)**2-(pHigher-outcome)**2;blendGame.n++;
      const bin=stats.blendReliability[Math.min(9,Math.floor(blend*10))];bin.n++;bin.sumP+=blend;bin.sumY+=outcome;
      stats.thresholdEvaluations++;
      stats.brierSum+=(pHigher-outcome)**2;
      stats.rollingEmpiricalBrierSum+=(empirical-outcome)**2;
      stats.baselineBrierSum+=(alwaysPrior-outcome)**2;
      gameBrier.diff+=(pHigher-outcome)**2-(empirical-outcome)**2;
      gameBrier.n++;
     }
     if(gameBrier.n>0)stats.gameBrierById.set(row.gameId,gameBrier);
     if(blendGame.n>0)stats.blendGameBrierById.set(row.gameId,blendGame);
     byMarket[k]=stats;
    }
   }
  }
 }
 const summary={};
 for(const [key,x] of Object.entries(byMarket)){
  const gameCluster95=bootstrapGameBrierDifference([...x.gameBrierById.values()]);
  summary[key]={period:x.period,market:x.market,
   walkForwardPlayerPeriodPredictions:x.predictions,
   distinctHeldoutGames:x.gameIds.size,
   distinctHeldoutDates:x.gameDates.size,
   mae:round(x.totalAbsError/x.predictions),
   rollingMeanBaselineMae:round(x.baselineAbsError/x.predictions),
   fixedThresholdCount:x.thresholdEvaluations,
   poissonBrier:round(x.brierSum/x.thresholdEvaluations),
   smoothedEmpiricalBrier:round(x.rollingEmpiricalBrierSum/x.thresholdEvaluations),
   rawRollingFrequencyBrier:round(x.baselineBrierSum/x.thresholdEvaluations),
   predeclaredDiagnosticThresholds:thresholds,
   realPlatformOfferedLinesUsed:false,
   passesMinimumDiagnosticSize:x.predictions>=100&&
    x.gameIds.size>=20&&x.gameDates.size>=10,
   gameClusterUncertaintyComputed:gameCluster95!==null,
   modelMinusSmoothedEmpiricalGameCluster95:gameCluster95,
   fixedBlendResearch:{method:"equal-weight prior-only Poisson and smoothed empirical",brier:round(x.blendBrierSum/x.thresholdEvaluations),logLoss:round(x.blendLogLoss/x.thresholdEvaluations),poissonLogLoss:round(x.poissonLogLoss/x.thresholdEvaluations),blendMinusPoissonGameCluster95:bootstrapGameBrierDifference([...x.blendGameBrierById.values()]),reliability:x.blendReliability.map((b,i)=>({lower:i/10,upper:(i+1)/10,n:b.n,meanForecast:b.n?round(b.sumP/b.n):null,observedFrequency:b.n?round(b.sumY/b.n):null})),syntheticThresholdsOnly:true,approved:false},
   probabilityCalibrationApproved:false};
 }
 return {schemaVersion:1,kind:"nhl_period_walk_forward_diagnostics",
  generatedAt:new Date().toISOString(),evaluationEndDate:toDate??null,
  distinctHoldoutDates:allDates.size,
  requiresAtLeastEightEarlierPlayerPeriodGames:true,
  evaluationUsesDateStrictlyEarlierThanOutcome:true,
  countModelMethodPredeclaredBeforeTheseDiagnostics:true,
  platformOfferedLinesVerified:false,syntheticDiagnosticLinesOnly:true,
  productionPromotionAllowed:false,provenBettingEdge:false,
  byMarket:summary};
}
module.exports={MIN_PERIOD_GAMES,COUNT_MARKETS,observedPeriodHistory,
 periodCountModel,buildPeriodMarketResearch,walkForwardPeriodDiagnostics,
 bootstrapGameBrierDifference};
