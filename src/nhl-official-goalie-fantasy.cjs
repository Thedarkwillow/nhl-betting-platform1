"use strict";
/**
 * NHL official Stats REST goalie/summary per-game bonus verification.
 * The gamecenter "decision" belongs to the credited goalie and does
 * not indicate an official shutout; source rows include explicit wins
 * and shutouts. No platform-authenticated PrizePicks settlement here.
 */
const {prizePicksGoalieFantasyScore,underdogGoalieFantasyScore}=
 require("./nhl-four-priority-markets.cjs");
const MAX_RECORDS=50;
function goalieSummaryUrl(gameId){
 if(!Number.isInteger(gameId)||gameId<1000000000||gameId>9999999999)
  throw Error("Invalid official NHL goalie summary game ID");
 const p=new URLSearchParams({isAggregate:"false",isGame:"true",
  start:"0",limit:String(MAX_RECORDS),cayenneExp:"gameId="+gameId});
 return "https://api.nhle.com/stats/rest/en/goalie/summary?"+p.toString();
}
function parseOfficialGoalieSummary(report,{gameId}={}){
 if(!Number.isInteger(gameId)||!Array.isArray(report?.data)||
   !Number.isInteger(report?.total)||report.total<0||
   report.total>report.data.length||report.data.length>MAX_RECORDS)
  throw Error("Incomplete official per-game NHL goalie summary");
 const map=new Map();
 for(const q of report.data){
  const id=Number(q?.playerId);
  if(!Number.isInteger(id)||id<=0||Number(q.gameId)!==gameId||
    map.has(id)||![0,1].includes(q.gamesStarted)||
    ![0,1].includes(q.wins)||![0,1].includes(q.shutouts)||
    !Number.isInteger(q.saves)||q.saves<0||
    !Number.isInteger(q.goalsAgainst)||q.goalsAgainst<0||
    (q.shutouts===1&&q.goalsAgainst!==0))
   throw Error("Invalid/ambiguous official NHL goalie win/shutout identity or stat");
  map.set(id,{goalieOfficialWins:q.wins,goalieOfficialShutouts:q.shutouts,
   goalieOfficialGamesStarted:q.gamesStarted,
   officialSaves:q.saves,officialGoalsAgainst:q.goalsAgainst});
 }
 return map;
}
function mergeOfficialGoalieFantasy(players,summary,{gameId}={}){
 if(!Array.isArray(players)||!(summary instanceof Map)||
    !Number.isInteger(gameId))throw Error("Require official goalie source, player-game identity");
 const playersById=new Map();
 for(const p of players){
  if(p.gameId!==gameId||!Number.isInteger(p.playerId)||
    playersById.has(p.playerId))throw Error("Duplicate/invalid official final player-game row");
  playersById.set(p.playerId,p);
 }
 for(const [id,official] of summary){
  const p=playersById.get(id);
  if(!p||p.type!=="goalie")throw Error("Goalie summary player not matched to official final gamecenter");
  // Missing gamecenter start is unknown, not evidence of a valid start.
  if(typeof p.goalieStarted!=="boolean"||
    Number(p.goalieStarted)!==official.goalieOfficialGamesStarted||
    !Number.isInteger(p.saves)||p.saves!==official.officialSaves||
    !Number.isInteger(p.goalsAgainst)||p.goalsAgainst!==official.officialGoalsAgainst)
   throw Error("Official NHL goalie summary disagrees with gamecenter");
 }
 return players.map(p=>{
  const official=p.type==="goalie"?summary.get(p.playerId):null;
  if(!official)return p;
  const withOfficial={...p,goalieOfficialWins:official.goalieOfficialWins,
   goalieOfficialShutouts:official.goalieOfficialShutouts};
  return {...withOfficial,
   prizePicksGoalieFantasyScore:prizePicksGoalieFantasyScore(withOfficial),
   // Preserve the existing Underdog-specific score; no shared coefficients.
   underdogGoalieFantasyScore:underdogGoalieFantasyScore(withOfficial)};
 });
}
module.exports={MAX_RECORDS,goalieSummaryUrl,
 parseOfficialGoalieSummary,mergeOfficialGoalieFantasy};
