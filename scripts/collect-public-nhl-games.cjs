"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");

const ENDPOINT = "https://api-web.nhle.com/v1/score/";

function pacificDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric",
    month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return value.year + "-" + value.month + "-" + value.day;
}

function requiredTeam(team) {
  assert.ok(team && typeof team.abbrev === "string" &&
    /^[A-Z]{2,4}$/.test(team.abbrev), "Missing official NHL team identity");
  return team.abbrev;
}

function normalizeScoreboard(raw, requestedDate, fetchedAt) {
  assert.match(requestedDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(raw && raw.currentDate === requestedDate &&
    Array.isArray(raw.games), "Unverified NHL score date or absent game list");
  const games = raw.games.map(game => {
    const id = Number(game.id);
    assert.ok(Number.isSafeInteger(id) && id > 0, "Missing NHL game ID");
    assert.ok(typeof game.startTimeUTC === "string" &&
      Number.isFinite(Date.parse(game.startTimeUTC)), "Missing game start time");
    assert.ok(typeof game.gameState === "string" &&
      /^[A-Z_]{2,16}$/.test(game.gameState), "Missing NHL game state");
    const result = {
      gameId: id, startTimeUTC: game.startTimeUTC,
      state: game.gameState, away: requiredTeam(game.awayTeam),
      home: requiredTeam(game.homeTeam)
    };
    // These are public final/live score facts, never a prop or provider offer.
    for (const side of ["away", "home"]) {
      const score = game[side + "Team"].score;
      if (Number.isSafeInteger(score) && score >= 0) {
        result[side + "Score"] = score;
      }
    }
    return result;
  });
  assert.equal(new Set(games.map(g => g.gameId)).size, games.length,
    "Duplicate NHL game identity in official scoreboard");
  assert.ok(Number.isFinite(Date.parse(fetchedAt)), "Missing actual fetch timestamp");
  return {
    schemaVersion: 1,
    kind: "public_official_nhl_game_status_not_prop_lines",
    source: "NHL Web API", endpoint: ENDPOINT + requestedDate,
    pacificDate: requestedDate, observedAtUTC: fetchedAt,
    note: "Public NHL scores only. No player props, model predictions or platform settlements.",
    games
  };
}

async function main() {
  const date = pacificDate();
  const response = await fetch(ENDPOINT + date, {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error("NHL scoreboard HTTP " + response.status);
  const data = normalizeScoreboard(await response.json(), date, new Date().toISOString());
  fs.writeFileSync("nhl-games.json", JSON.stringify(data, null, 2) + "\n");
  console.log("Archived public NHL game-status metadata: " + date +
    ", " + data.games.length + " games. Not a prop-board capture.");
}
if (require.main === module) {
  main().catch(error => {
    console.error("Public official NHL status collection failed:", error.message);
    process.exitCode = 1;
  });
}
module.exports = { pacificDate, normalizeScoreboard };
