"use strict";
/**
 * Official-only period history; independent of NHL full-game training data.
 * Each period row has verified participation and market-specific null-on-
 * source-disagreement values, never an interpolated share of full-game stats.
 */
const {PERIOD_MARKETS}=require("./nhl-official-period-events.cjs");
function buildNhlPeriodHistory(daily){
 if(!Array.isArray(daily))throw Error("Require official period date reports");
 const players={},games=new Set(),unique=new Set(),sourceDates=new Set();
 const diagnostics={reports:0,acceptedGames:0,playerPeriods:0,
  perMarketValid:Object.fromEntries(PERIOD_MARKETS.map(m=>[m,0])),
  perMarketQuarantined:Object.fromEntries(PERIOD_MARKETS.map(m=>[m,0]))};
 for(const report of daily){
  if(report.kind!=="nhl_official_period_event_history_daily"||
   report.complete!==true||report.gameCount!==report.completedGameResults||
   (report.errors||[]).length!==0||!Array.isArray(report.playerPeriodRows)||
   !/^\d{4}-\d{2}-\d{2}$/.test(report.requestedDate||"")||
   sourceDates.has(report.requestedDate))
   throw Error("Incomplete, duplicate or invalid official period source");
  diagnostics.reports++;sourceDates.add(report.requestedDate);
  for(const row of report.playerPeriodRows){
   if(!Number.isInteger(row.gameId)||!Number.isInteger(row.playerId)||
    ![1,2,3].includes(row.period)||row.gameDate!==report.requestedDate||
    row.periodCompleted!==true||row.playedInPeriod!==true||
    !Number.isInteger(row.timeOnIceSeconds)||row.timeOnIceSeconds<=0||
    !row.stats||typeof row.stats!=="object")
    throw Error("Period result is not source verified");
   const key=[row.gameId,row.playerId,row.period].join("|");
   if(unique.has(key))throw Error("Duplicate official period player-game");
   unique.add(key);games.add(row.gameId);
   const player=players[String(row.playerId)]||{};
   const period=String(row.period),rows=player[period]||[];
   const result={gameId:row.gameId,gameDate:row.gameDate,
    playerId:row.playerId,period:row.period,
    playedInPeriod:true,source:"NHL_final_events_and_shifts"};
   for(const market of PERIOD_MARKETS){
    const actual=row.stats[market];
    if(actual===undefined)continue;
    if(actual!==null&&(!Number.isInteger(actual)||actual<0))
     throw Error("Official period stat not nonnegative integer");
    result[market]=actual;
    diagnostics[actual===null?"perMarketQuarantined":"perMarketValid"][market]++;
   }
   rows.push(result);player[period]=rows;players[String(row.playerId)]=player;
  }
 }
 for(const periods of Object.values(players))
  for(const rows of Object.values(periods))
   rows.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
 diagnostics.acceptedGames=games.size;diagnostics.playerPeriods=unique.size;
 return {schemaVersion:1,kind:"nhl_official_period_history_v1",
  source:"official_NHL_gamecenter_events_and_shiftcharts_reconciled",
  sourceDates:[...sourceDates].sort(),
  completedGames:games.size,playerPeriodObservations:unique.size,
  players,coverage:diagnostics,
  originalPlatformSettlementVerified:false,
  liveAutomaticPeriodPickEligibility:false,
  note:"Historical per-period results only. Null when event totals disagree with official final full-game boxscore; participation from completed shiftchart."};
}
module.exports={buildNhlPeriodHistory};
