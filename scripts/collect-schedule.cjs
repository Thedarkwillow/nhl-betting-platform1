"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { assertDate, normalizeSchedule } = require("../src/schedule.cjs");

async function main() {
  const date = assertDate(process.argv[2] || new Date().toISOString().slice(0, 10));
  const url = `https://api-web.nhle.com/v1/schedule/${date}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`NHL API returned HTTP ${response.status}`);
  const games = normalizeSchedule(await response.json());
  const dir = path.join(__dirname, "..", "outputs", "schedule");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${date}.json`);
  await fs.writeFile(file, JSON.stringify({ requestedDate: date, fetchedAt: new Date().toISOString(), source: url, games }, null, 2) + "\n");
  console.log(`Saved ${games.length} games to ${file}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
