"use strict";
const {normalizePriorityBoxscoreFields,underdogGoalieFantasyScore}=
 require("./nhl-four-priority-markets.cjs");

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function normalizeBoxscore(payload) {
  if (!payload || !Number.isInteger(payload.id) || !payload.playerByGameStats) {
    throw new Error("Unexpected NHL boxscore response");
  }
  const rows = [];
  for (const side of ["awayTeam", "homeTeam"]) {
    const team = payload[side]?.abbrev ?? null;
    const groups = payload.playerByGameStats[side];
    if (!groups) throw new Error("Missing " + side + " player stats");
    for (const group of ["forwards", "defense", "goalies"]) {
      for (const player of groups[group] || []) {
        if (!Number.isInteger(player.playerId)) continue;
        const goalie = group === "goalies";
        const priority=normalizePriorityBoxscoreFields(player,{goalie});
        rows.push({
          gameId: payload.id,
          gameDate: payload.gameDate ?? null,
          gameState: payload.gameState ?? null,
          team,
          side: side === "homeTeam" ? "home" : "away",
          playerId: player.playerId,
          name: player.name?.default ?? null,
          position: player.position ?? (goalie ? "G" : null),
          type: goalie ? "goalie" : "skater",
          goals: goalie ? null : numberOrNull(player.goals),
          assists: goalie ? null : numberOrNull(player.assists),
          points: goalie ? null : (numberOrNull(player.points) ?? (
            numberOrNull(player.goals) !== null && numberOrNull(player.assists) !== null
              ? Number(player.goals) + Number(player.assists) : null)),
          shotsOnGoal: goalie ? null : numberOrNull(player.sog),
          blockedShots: goalie ? null : numberOrNull(player.blockedShots),
          plusMinus: goalie ? null :
            (Number.isInteger(player.plusMinus)?player.plusMinus:null),
          // PP goals alone do not equal PP points. Use Stats REST ppPoints.
          powerPlayPoints:null,
          saves: goalie ? numberOrNull(player.saves) : null,
          shotsAgainst: goalie ? numberOrNull(player.shotsAgainst) : null,
          // Unknown counts remain null. NHL total TOI can include overtime;
          // Underdog TOI explicitly excludes it, so this alone cannot
          // settle an Underdog TOI prop.
          ...priority,
          regulationTimeOnIceSeconds:null,
          // Only calculate official-stat Underdog fantasy score with verified
          // goalie starting status, official win decision, saves and GA.
          underdogGoalieFantasyScore:goalie?
            underdogGoalieFantasyScore({...priority,type:"goalie",
              saves:numberOrNull(player.saves)}):null
        });
      }
    }
  }
  return rows;
}
module.exports = { normalizeBoxscore };
