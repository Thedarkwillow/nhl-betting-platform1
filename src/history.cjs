"use strict";

const FIELDS = {
  skater: ["goals", "assists", "points", "shotsOnGoal", "blockedShots",
    "hits", "faceoffsWon", "timeOnIceSeconds", "powerPlayPoints", "plusMinus"],
  goalie: ["saves", "shotsAgainst", "goalsAgainst", "timeOnIceSeconds",
    "goalieOfficialWins", "goalieOfficialShutouts",
    "underdogGoalieFantasyScore", "prizePicksGoalieFantasyScore"]
};

function mean(rows, field) {
  const values = rows.map(r => r[field]).filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length*1000)/1000 : null;
}

function buildHistory(reports) {
  const unique = new Map();
  for (const report of reports) {
    if (!Array.isArray(report.players) || (report.errors || []).length) {
      throw new Error("Missing or incomplete daily player stats");
    }
    for (const row of report.players) {
      if (!Number.isInteger(row.playerId) || !Number.isInteger(row.gameId) ||
          !FIELDS[row.type] || !row.gameDate) throw new Error("Invalid player record");
      const key = row.gameId + ":" + row.playerId;
      if (unique.has(key) && JSON.stringify(unique.get(key)) !== JSON.stringify(row)) {
        throw new Error("Conflicting duplicate record: " + key);
      }
      unique.set(key, row);
    }
  }
  const groups = new Map();
  for (const row of unique.values()) {
    const key = String(row.playerId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const players = {};
  for (const [key, games] of groups) {
    games.sort((a,b)=>a.gameDate.localeCompare(b.gameDate) || a.gameId-b.gameId);
    const last = games.at(-1);
    const rolling = {};
    for (const [label, n] of [["last5",5],["last10",10],["all",games.length]]) {
      rolling[label] = Object.fromEntries(FIELDS[last.type].map(f=>[f,mean(games.slice(-n),f)]));
    }
    players[key] = {
      playerId:last.playerId,name:last.name,team:last.team,type:last.type,
      position:last.position,gamesPlayed:games.length,
      lastGameDate:last.gameDate,rolling,games
    };
  }
  return {schemaVersion:1,playerCount:Object.keys(players).length,
    gamePlayerRecords:unique.size,players};
}
module.exports = {buildHistory,mean};
