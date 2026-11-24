"use strict";
const {projectPlayer}=require("./projections.cjs");
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {quantifyHistoricalUncertainty}=require("./nhl-historical-uncertainty.cjs");
const {benchmarkHistoricalSelections}=require("./nhl-historical-baselines.cjs");
function normalizeNhlLog(payload,season){
 if(!Array.isArray(payload?.gameLog))throw Error("Official NHL game log missing");
 const rows=[];
 for(const g of payload.gameLog){
  const date=g.gameDate,id=Number(g.gameId);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date??"")||!Number.isInteger(id))continue;
  const numeric=(...keys)=>{
   for(const k of keys)if(typeof g[k]==="number"&&Number.isFinite(g[k]))return g[k];
   return null;
  };
  rows.push({gameId:id,gameDate:date,season,
   goals:numeric("goals"),assists:numeric("assists"),points:numeric("points"),
   shotsOnGoal:numeric("shots"),blockedShots:numeric("blockedShots"),
   saves:numeric("saves")});
 }
 return rows;
}
function walkForwardLine(line,gameLogs){
 const current=gameLogs.find(g=>String(g.gameId)===String(line.gameId));
 if(!current)return {status:"missing_official_game_in_player_log"};
 if(!Number.isFinite(current[line.market]))return {status:"official_stat_unavailable_in_game_log"};
 if(current[line.market]!==line.actual)return {status:"official_game_log_disagrees_with_boxscore"};
 const prior=gameLogs.filter(g=>g.gameDate<current.gameDate&&Number.isFinite(g[line.market]));
 if(prior.length<5)return {status:"fewer_than_five_pregame_stats",priorGames:prior.length};
 const type=line.market==="saves"?"goalie":"skater";
 const p=projectPlayer({playerId:line.playerId,name:line.playerName,type,
  games:prior});
 const estimate=p.projections[line.market];
 if(!estimate?.ready||!Number.isFinite(estimate.estimate))return {status:"model_market_unavailable"};
 const probabilities=estimateCountProbabilities(estimate.estimate,line.line);
 if(!Number.isFinite(probabilities?.higher)||!Number.isFinite(probabilities?.lower))
  return {status:"invalid_model_probability"};
 const side=probabilities.higher>=probabilities.lower?"Higher":"Lower",probability=Math.max(probabilities.higher,probabilities.lower);
 return {status:"evaluated",priorGames:prior.length,pregameModelEstimate:estimate.estimate,
  modelChosenSide:side,modelSelectedProbability:probability,
  correct:line.outcome==="Push"?null:line.outcome===side};
}
function evaluateArchiveOutcomes(report,logsByPlayer){
 const details=[],excluded={};for(const row of report.lines||[]){
  const key=String(row.playerId),r=walkForwardLine(row,logsByPlayer[key]||[]);
  if(r.status!=="evaluated")excluded[r.status]=(excluded[r.status]||0)+1;
  details.push({season:row.season,playerId:row.playerId,player:row.playerName,
   gameId:row.gameId,market:row.market,line:row.line,tier:"unverified",
   officialOutcome:row.outcome,officialStat:row.actual,
   sourceLastObservedAt:row.sourceLastObservedAt,gameStartAt:row.gameStartAt,
   ...r,prospectiveVerified:false,payoutVerified:false});
 }
 const bySeason={},graded=details.filter(x=>x.status==="evaluated"&&x.correct!==null);
 for(const season of ["2025-26","2026-27"]){
  const all=details.filter(x=>x.season===season),valid=graded.filter(x=>x.season===season);
  const brier=valid.length?valid.reduce((sum,x)=>sum+(x.modelSelectedProbability-(x.correct?1:0))**2,0)/valid.length:null;
  bySeason[season]={archivedLinesWithOfficialOutcome:all.length,modelEvaluable:valid.length,
   correct:valid.filter(x=>x.correct).length,retrospectiveHitRate:valid.length?valid.filter(x=>x.correct).length/valid.length:null,
   distinctGames:new Set(valid.map(x=>x.gameId)).size,brierScore:brier};
 }
 return {kind:"retrospective_actual_prizepicks_line_model_test",bySeason,
  evaluated:graded.length,excluded,decisions:details,
  uncertainty:quantifyHistoricalUncertainty(details),
  directionalBenchmarks:benchmarkHistoricalSelections(details),
  dataSource:"OddsPapi historic PrizePicks line + official NHL final result + earlier regular-season game logs",
  calibrated:false,prospectiveVerified:false,payoutsVerified:false,
  tiersVerified:false,expectedValue:null,
  warning:"Actual archived PrizePicks lines, not synthetic thresholds. Reconstructed model decisions were not published before those games; historical selection and incomplete games can bias results. Goblin/Demon/Standard labels are unknown, so payout-based EV and tier accuracy cannot be claimed."};
}
module.exports={normalizeNhlLog,walkForwardLine,evaluateArchiveOutcomes};
