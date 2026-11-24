"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const read=x=>fs.readFileSync(path.resolve(__dirname,"..",x),"utf8");

test("06:00 and 09:00 legacy metered workflows cannot call the vendor",()=>{
  const paths=[
    ".github/workflows/nhl-bounded-daily-pregame-freeze.yml",
    ".github/workflows/nhl-0900-board-delta.yml"
  ];
  for(const p of paths){
    const y=read(p);
    assert.match(y,/No Vendor Calls/);
    assert.match(y,/workflow_dispatch:/);
    assert.doesNotMatch(y,/^  schedule:/m);
    assert.doesNotMatch(y,/^  workflow_call:/m);
    assert.doesNotMatch(y,/\$\{\{\s*secrets\./);
    assert.doesNotMatch(y,/node\s+scripts\/collect-prizepicks/);
    assert.doesNotMatch(y,/uses:\s*\.\/\.github\/workflows\/trial-free-prizepicks-nhl\.yml/);
    assert.doesNotMatch(y,/curl\s|fetch\s*\(/);
    assert.match(y,/zero billable vendor requests/);
  }
});

test("bounded trial retains at most one automated monthly metered capture",()=>{
  const y=read(".github/workflows/trial-free-prizepicks-nhl.yml");
  const schedules=[...y.matchAll(/^    - cron:\s*['"]?([^'"\n]+)['"]?/gm)]
    .map(m=>m[1].trim());
  assert.deepEqual(schedules,["15 16 1 * *"]);
  assert.match(y,/PRIZEPICKSAPI_KEY/);
  assert.match(y,/collect-prizepicks-asof-nhl\.cjs/);
});

test("metered API collector still locks pre-reset even on explicit manual request",()=>{
  const {assertPrizePicksApiAllowed}=require("../src/prizepicksapi-november-quota-lock.cjs");
  assert.throws(()=>assertPrizePicksApiAllowed("2026-11-30T23:59:59Z"),
    x=>x.code==="PRIZEPICKSAPI_NOVEMBER_QUOTA_LOCK");
});
