"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeBoxscore } = require("../src/boxscore.cjs");

test("normalizes skaters and goalies without inventing missing stats", () => {
  const data = {
    id: 2026020001, gameDate: "2026-10-31", gameState: "OFF",
    homeTeam: { abbrev: "NYR" }, awayTeam: { abbrev: "BOS" },
    playerByGameStats: {
      homeTeam: {
        forwards: [{ playerId: 10, name: { default: "Test Skater" }, goals: 1, assists: 2, sog: 4, blockedShots: 1 }],
        defense: [],
        goalies: [{ playerId: 11, name: { default: "Test Goalie" }, saves: 28, shotsAgainst: 30 }]
      },
      awayTeam: { forwards: [], defense: [], goalies: [] }
    }
  };
  const rows = normalizeBoxscore(data);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].points, 3);
  assert.equal(rows[0].shotsOnGoal, 4);
  assert.equal(rows[1].saves, 28);
  assert.equal(rows[1].goals, null);
});
test("rejects malformed response", () => {
  assert.throws(() => normalizeBoxscore({}));
});
