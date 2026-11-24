"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { buildHistory } = require("../src/history.cjs");

async function main() {
  const root = path.join(__dirname, "..");
  const folder = path.join(root, "outputs", "player-stats");
  const files = (await fs.readdir(folder)).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
  if (!files.length) throw new Error("No daily player stats found");
  const reports = [];
  for (const name of files) {
    reports.push(JSON.parse(await fs.readFile(path.join(folder, name), "utf8")));
  }
  const result = { ...buildHistory(reports), sourceFiles: files, builtAt: new Date().toISOString() };
  const out = path.join(root, "outputs", "history");
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, "players.json"), JSON.stringify(result, null, 2) + "\n");
  console.log("Built " + result.playerCount + " players from " + files.length + " daily reports");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
