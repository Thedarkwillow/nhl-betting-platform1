"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {RESET_AT_UTC, assertPrizePicksApiAllowed} =
  require("../src/prizepicksapi-november-quota-lock.cjs");

test("November full-board collector quota lock prevents paid requests before reset", () => {
  assert.equal(RESET_AT_UTC, "2026-12-01T00:00:00.000Z");
  for (const now of [
    "2026-11-19T23:41:00Z",
    "2026-11-30T23:59:59.999Z",
  ]) {
    assert.throws(() => assertPrizePicksApiAllowed(now), err =>
      err.code === "PRIZEPICKSAPI_NOVEMBER_QUOTA_LOCK" &&
      /no metered vendor request/.test(err.message));
  }
});

test("spending lock expires at the UTC billing boundary; regular provider quota preflight still applies", () => {
  assert.equal(assertPrizePicksApiAllowed("2026-12-01T00:00:00.000Z"), true);
  assert.equal(assertPrizePicksApiAllowed("2026-12-02T06:00:00Z"), true);
  assert.throws(() => assertPrizePicksApiAllowed("not-a-date"), /Invalid clock/);
});

test("all standard billable CLI collector paths guard before the first provider request", () => {
  const cases = [
    ["scripts/collect-prizepicks-asof-nhl.cjs", "async function main(){"],
    ["scripts/collect-prizepicks-free-api.cjs", "async function main(){"],
    ["scripts/backfill-prizepicksapi-nhl-history.cjs", "async function main(){"],
    ["scripts/probe-prizepicksapi-nhl.cjs", "async function probe(key,{client=fetch}={}){"],
  ];
  for (const [filename, marker] of cases) {
    const content = fs.readFileSync(path.resolve(__dirname, "..", filename), "utf8");
    assert.ok(content.includes('require("../src/prizepicksapi-november-quota-lock.cjs")'), filename);
    assert.ok(content.includes(marker + "\n assertPrizePicksApiAllowed();"),
      filename + " must block before vendor I/O");
  }
});
