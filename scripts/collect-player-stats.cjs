"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { assertDate, normalizeSchedule } = require("../src/schedule.cjs");
const { normalizeBoxscore } = require("../src/boxscore.cjs");
const {faceoffsReportUrl,normalizeOfficialFaceoffWins,mergeOfficialFaceoffs}=
 require("../src/nhl-official-faceoff-wins.cjs");
const {goalieSummaryUrl,parseOfficialGoalieSummary,mergeOfficialGoalieFantasy}=
 require("../src/nhl-official-goalie-fantasy.cjs");
const {skaterSummaryUrl,normalizeOfficialSkaterSummary,mergeOfficialSkaterSummary}=
 require("../src/nhl-official-skater-summary.cjs");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function getJSON(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 5) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 60000)
      : Math.min(3000 * 2 ** attempt, 60000);
    console.warn(`HTTP ${response.status}; retry ${attempt + 1}/5 in ${delay}ms`);
    await sleep(delay);
  }
}
async function main() {
  const date = assertDate(process.argv[2] || new Date().toISOString().slice(0, 10));
  const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${date}`;
  const schedule = normalizeSchedule(await getJSON(scheduleUrl));
  // The schedule endpoint returns a week; select ONLY the requested date.
  const games = schedule.filter(game => game.date === date);
  const completed = games.filter(game => ["OFF", "FINAL"].includes(game.gameState));
  const results = [];
  const errors = [], supplementalWarnings = [];
  for (const game of completed) {
    try {
      const url = `https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`;
      const payload = await getJSON(url);
      let players=normalizeBoxscore(payload);
      // One bounded free official NHL Stats REST supplement per final game.
      // Boxscore often has only faceoff percentage; never infer wins without
      // an exact player+game row. Failure does not stop core NHL grading.
      try {
        const response=await fetch(faceoffsReportUrl(game.id),
          {signal:AbortSignal.timeout(9000)});
        if(!response.ok)throw Error("NHL Stats REST HTTP "+response.status);
        const wins=normalizeOfficialFaceoffWins(await response.json(),{gameId:game.id});
        players=mergeOfficialFaceoffs(players,wins,{gameId:game.id});
      }catch(error){
        supplementalWarnings.push({gameId:game.id,source:"NHL Stats REST faceoffwins",
          warning:error.message,faceoffsWonUnverifiedIfNull:true});
      }
      // Official per-goalie wins and shutouts cannot be inferred from GA=0,
      // the team's final score or the starting-goalie flag. Use one
      // exact, source-matched official NHL Stats REST game report.
      try {
        const response=await fetch(goalieSummaryUrl(game.id),
          {signal:AbortSignal.timeout(9000)});
        if(!response.ok)throw Error("NHL goalie Stats REST HTTP "+response.status);
        const summary=parseOfficialGoalieSummary(await response.json(),
          {gameId:game.id});
        players=mergeOfficialGoalieFantasy(players,summary,{gameId:game.id});
      }catch(error){
        supplementalWarnings.push({gameId:game.id,
          source:"NHL Stats REST goalie/summary",
          warning:error.message,prizePicksGoalieFantasyScoreUnverifiedIfNull:true});
      }
      // A distinct official skater/summary report supplies exact PP points
      // and cross-checks the gamecenter signed plus/minus. A missing or
      // incompatible report stays a warning: do not invent PPP from PPG.
      try{
        const response=await fetch(skaterSummaryUrl(game.id),
          {signal:AbortSignal.timeout(9000)});
        if(!response.ok)throw Error("NHL skater Stats REST HTTP "+response.status);
        const summary=normalizeOfficialSkaterSummary(await response.json(),
          {gameId:game.id});
        players=mergeOfficialSkaterSummary(players,summary,{gameId:game.id});
      }catch(error){
        supplementalWarnings.push({gameId:game.id,
          source:"NHL Stats REST skater/summary",
          warning:error.message,powerPlayPointsUnverifiedIfNull:true});
      }
      results.push({ gameId: game.id, players });
      await sleep(900);
    } catch (error) {
      errors.push({ gameId: game.id, error: error.message });
    }
  }
  const report = {
    requestedDate: date,
    sourceSchemaVersion:5,
    priorityMarketStatsCollected:["hits","timeOnIceSeconds","faceoffsWon",
      "underdogGoalieFantasyScore"],
    fetchedAt: new Date().toISOString(),
    source: "NHL public API",
    scheduledGames: games.length,
    completedGames: completed.length,
    collectedGames: results.length,
    errors,
    supplementalWarnings,
    players: results.flatMap(result => result.players)
  };
  const directory = path.join(__dirname, "..", "outputs", "player-stats");
  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(directory, date + ".json");
  await fs.writeFile(destination, JSON.stringify(report, null, 2) + "\n");
  console.log(`Saved ${report.players.length} player rows from ${results.length} games to ${destination}`);
  if (errors.length) {
    console.error(JSON.stringify(errors, null, 2));
    process.exitCode = 1;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
