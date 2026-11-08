"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { pacificDate, normalizeScoreboard } = require("./collect-public-nhl-games.cjs");
const sample = {
  currentDate: "2026-11-08", apiToken: "never-copy",
  games: [{ id: 2026020211, startTimeUTC: "2026-11-09T03:00:00Z",
    gameState: "FUT", awayTeam: {abbrev:"SEA", score:0},
    homeTeam: {abbrev:"SJS", score:0},
    proprietaryLine: { player: "never copy", line: 2.5 } }]
};
test("Pacific date observes DST", () => {
  assert.equal(pacificDate(new Date("2026-07-08T15:00:00Z")), "2026-07-08");
  assert.equal(pacificDate(new Date("2026-11-08T14:00:00Z")), "2026-11-08");
});
test("NHL game status includes only allowlisted public game facts", () => {
  const a = normalizeScoreboard(sample, "2026-11-08", "2026-11-08T14:08:00.000Z");
  const json = JSON.stringify(a);
  assert.equal(a.games[0].away, "SEA");
  assert.equal(a.games[0].awayScore, 0);
  assert.equal(a.kind, "public_official_nhl_game_status_not_prop_lines");
  assert.ok(!json.includes("apiToken"));
  assert.ok(!json.includes("proprietaryLine"));
  assert.ok(!json.includes("never-copy"));
  assert.ok(!json.includes("never copy"));
});
test("Refuse wrong-day, malformed or duplicate scoreboard identity", () => {
  assert.throws(() => normalizeScoreboard(sample,"2026-11-07","2026-11-08T14:08:00Z"));
  assert.throws(() => normalizeScoreboard({currentDate:"2026-11-08"}, "2026-11-08","2026-11-08T14:08:00Z"));
  assert.throws(() => normalizeScoreboard({...sample,games:[sample.games[0],sample.games[0]]},
    "2026-11-08","2026-11-08T14:08:00Z"));
  assert.throws(() => normalizeScoreboard({...sample,games:[{...sample.games[0],awayTeam:{}}]},
    "2026-11-08","2026-11-08T14:08:00Z"));
});
test("Zero games is a valid verified rest day, never silently inferred", () => {
  const a=normalizeScoreboard({currentDate:"2026-11-08", games:[]},"2026-11-08","2026-11-08T14:08:00Z");
  assert.deepEqual(a.games,[]);
});
