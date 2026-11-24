"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { assertDate, normalizeSchedule } = require("../src/schedule.cjs");

test("validates dates", () => {
  assert.equal(assertDate("2026-10-31"), "2026-10-31");
  assert.throws(() => assertDate("2026-02-30"));
});
test("normalizes games", () => {
  const games = normalizeSchedule({ gameWeek: [{ date: "2026-10-31", games: [{ id: 1, homeTeam: { abbrev: "NYR" }, awayTeam: { abbrev: "BOS" }, startTimeUTC: "2026-10-31T23:00:00Z" }] }] });
  assert.equal(games[0].home, "NYR");
  assert.equal(games[0].away, "BOS");
});
