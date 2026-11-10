"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),
 fs=require("node:fs"),path=require("node:path");
const y=fs.readFileSync(path.join(__dirname,"../.github/workflows/public-private-nhl-nfl-0900.yml"),"utf8");
test("scheduled full capture uses trusted 6/9 Pacific hours and has end-hour catchup",()=>{
 assert.match(y,/timezone: 'America\/Los_Angeles'/);
 for(const hour of [6,9])for(const minute of [0,12,27,43,51])
  assert.ok(y.includes("cron: '"+minute+" "+hour+" * * *'"),
   "Missing fallback "+hour+":"+minute);
 assert.match(y,/actual_hour="\$\(TZ=America\/Los_Angeles date \+%H\)"/);
 assert.match(y,/Capture full NEW NHL and NFL source responses inside private checkout/);
});
test("do not burn extra source requests before scheduled full board collection",()=>{
 const probe=y.slice(y.indexOf("- name: Diagnostic count-only probe"),y.indexOf("- name: Require actual 6 AM or 9 AM"));
 assert.match(probe,/if: github\.event_name == 'workflow_dispatch' && inputs\.mode == 'probe_now'/);
 assert.ok(!probe.includes("if: github.event_name == 'schedule'"));
 assert.ok(!/\n  push:/.test(y));
 assert.match(y,/steps\.gate\.outputs\.allowed == 'true'/);
});
test("public green health-only probe never counts as private archived board",()=>{
 assert.match(y,/No actual source archival changes/);
 assert.match(y,/No durable private 9 AM archive/);
 assert.match(y,/Actual Pacific 6 AM or 9 AM|actual_hour=/);
});
