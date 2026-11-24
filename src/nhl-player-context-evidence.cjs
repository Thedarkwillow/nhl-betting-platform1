"use strict";
const {uniqueRows,scheduleIndex,scheduledOpponent}=require("./nhl-fixed-ensemble-research.cjs");
const {opponentPositionTable,playerProfile}=require("./player-context-evidence.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const SKATER=["shotsOnGoal","goals","assists","points","blockedShots","hits","faceoffsWon","powerPlayPoints","timeOnIceSeconds","plusMinus"];
const GOALIE=["saves","goalsAgainst","timeOnIceSeconds"];
const POSITIONS=["C","LW","RW","D"];
const pos=p=>({L:"LW",R:"RW",LW:"LW",RW:"RW",C:"C",D:"D",G:"G"}[String(p||"").toUpperCase()]||null);
const validStat=(g,m)=>Number.isFinite(g[m])&&(m==="plusMinus"||g[m]>=0)&&Number.isInteger(g[m]);
// Require an official complete schedule, explicit regular season and exact
// event, team and date reconciliation. No today rows and no guessed opponent.
function adapt(history,schedule,beforeDate){
 const idx=scheduleIndex(schedule),games=new Map(),rows=[],teams=[...new Set([...idx.values()].filter(g=>g.gameType===2).flatMap(g=>[canonical(g.home),canonical(g.away)]))].sort();
 for(const g of uniqueRows(history)){
  const event=idx.get(g.gameId),opponent=scheduledOpponent(g,idx),team=canonical(g.team);
  if(!event||event.gameType!==2||!opponent||g.gameDate>=beforeDate||typeof event.season!=="string"||event.season!==schedule.season)continue;
  const info={g,event,opponent:canonical(opponent),team,position:pos(g.position)};
  const a=games.get(g.gameId)||[];a.push(info);games.set(g.gameId,a);
 }
 for(const a of games.values()){
  const skaters=a.filter(r=>r.g.type==="skater"),clubs=[...new Set(skaters.map(r=>r.team))];
  const rosterComplete=clubs.length===2&&clubs.every(t=>skaters.filter(r=>r.team===t).length===18)&&skaters.every(r=>POSITIONS.includes(r.position));
  const complete=Object.fromEntries(SKATER.map(m=>[m,rosterComplete&&skaters.every(r=>validStat(r.g,m))]));
  for(const {g,event,team,opponent,position} of a){
   for(const m of g.type==="skater"?SKATER:GOALIE){
    if(!validStat(g,m))continue;
    rows.push({sport:"NHL",gameId:g.gameId,playerId:g.playerId,gameDate:g.gameDate,season:event.season,position,team,opponent,venue:team===canonical(event.home)?"home":"away",market:m,period:"full_game",value:g[m],exposureSeconds:g.timeOnIceSeconds,powerPlaySeconds:Number.isInteger(g.powerPlayTimeOnIceSeconds)&&g.powerPlayTimeOnIceSeconds>=0&&g.powerPlayTimeOnIceSeconds<=g.timeOnIceSeconds?g.powerPlayTimeOnIceSeconds:null,officialFinal:true,participated:true,completeGame:g.type==="skater"&&complete[m]===true});
   }
  }
 }
 return {rows,leagueTeams:teams,scheduleSeason:schedule?.season??null,fullLeague:teams.length===32};
}
function report(history,schedule,beforeDate){
 const {rows,leagueTeams,scheduleSeason,fullLeague}=adapt(history,schedule,beforeDate),coverage={};
 for(const market of [...new Set([...SKATER,...GOALIE])]){
  const a=rows.filter(r=>r.market===market);
  const byPosition={};
  for(const position of POSITIONS){
   if(!SKATER.includes(market))continue;
   const table=fullLeague?opponentPositionTable(a,{sport:"NHL",market,period:"full_game",beforeDate,season:scheduleSeason,position,leagueTeams}):null;
   byPosition[position]={seasonRankedTeams:table?Object.values(table.teams).filter(r=>r.season.rank!==null).length:0,last20RankedTeams:table?Object.values(table.teams).filter(r=>r.last20.rank!==null).length:0,last10RankedTeams:table?Object.values(table.teams).filter(r=>r.last10.rank!==null).length:0,last5RankedTeams:table?Object.values(table.teams).filter(r=>r.last5.rank!==null).length:0,completePositionGames:new Set(a.filter(r=>r.position===position&&r.completeGame).map(r=>r.gameId)).size};
  }
  coverage[market]={appearances:a.length,players:new Set(a.map(r=>r.playerId)).size,games:new Set(a.map(r=>r.gameId)).size,byPosition};
 }
 return {kind:"nhl_player_context_coverage_v1",beforeDate,season:scheduleSeason,leagueTeams:leagueTeams.length,coverage,scope:"official schedule matched regular-season full-game history only",asOfHistoricalSourceAvailabilityVerified:false,forecastValidated:false,publicPlayerProfilesPublished:false};
}
module.exports={adapt,report,playerProfile,opponentPositionTable};
