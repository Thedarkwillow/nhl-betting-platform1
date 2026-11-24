"use strict";

function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z")) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
    throw new Error("Date must be a real YYYY-MM-DD date");
  }
  return date;
}

function normalizeSchedule(payload) {
  if (!payload || !Array.isArray(payload.gameWeek)) throw new Error("Unexpected NHL schedule response");
  return payload.gameWeek.flatMap(day => (day.games || []).map(game => ({
    id: game.id,
    date: day.date,
    startTimeUTC: game.startTimeUTC,
    gameState: game.gameState,
    away: game.awayTeam?.abbrev || null,
    home: game.homeTeam?.abbrev || null
  })));
}

module.exports = { assertDate, normalizeSchedule };
