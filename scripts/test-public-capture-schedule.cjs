"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),
 fs=require("node:fs"),path=require("node:path");
const {RETRIES,decide}=require("./pacific-morning-capture-gate.cjs");
const y=fs.readFileSync(path.join(__dirname,"../.github/workflows/public-private-nhl-nfl-0900.yml"),"utf8");
test("full NHL/NFL source capture runs EVERY DAY with non-peak Pacific cron and five retries each",()=>{
 assert.match(y,/timezone: 'America\/Los_Angeles'/);
 for(const hour of [6,9])for(const minute of RETRIES)
  assert.ok(y.includes("cron: '"+minute+" "+hour+" * * *'"),
   "Missing actual "+hour+":"+minute+" scheduled opportunity");
 assert.equal(RETRIES.length,5);
 for(const hour of [6,9])assert.ok(!y.includes("cron: '0 "+hour+" * * *'"),
  "Avoid start-of-hour GitHub high-load delay");
 assert.match(y,/GITHUB_EVENT_SCHEDULE: \$\{\{ github\.event\.schedule \}\}/);
 assert.match(y,/pacific-morning-capture-gate\.cjs/);
 assert.match(y,/Capture full NEW NHL and NFL source responses inside private checkout/);
});
test("source preflight is before private checkout; late jobs never contact providers",()=>{
 const probeStart=y.indexOf("- name: Diagnostic count-only probe");
 const gateStart=y.indexOf("- name: Verify the ORIGINAL scheduled slot");
 const privateCheckout=y.indexOf("- name: Checkout private repository ONLY");
 const providerCall=y.indexOf("- name: Capture full NEW NHL and NFL");
 assert.ok(probeStart>0&&probeStart<gateStart&&gateStart<privateCheckout&&
  privateCheckout<providerCall);
 assert.match(y,/if: steps\.gate\.outputs\.allowed == 'true'/);
 assert.match(y,/GITHUB_EVENT_SCHEDULE:/);
 assert.ok(!/\n  push:/.test(y),"Don't trigger old 6/9 slots on arbitrary Git commits");
 const d=decide({eventName:"schedule",schedule:"7 9 * * *",
  now:"2026-11-10T22:33:37Z"});
 assert.equal(d.allowed,false);
 assert.equal(d.providerRequests,0);
});
test("counts-only probes cannot masquerade as complete private-source board captures",()=>{
 const probe=y.slice(y.indexOf("- name: Diagnostic count-only probe"),
  y.indexOf("- name: Verify the ORIGINAL scheduled slot"));
 assert.match(probe,/if: github\.event_name == 'workflow_dispatch' && inputs\.mode == 'probe_now'/);
 assert.ok(!probe.includes("github.event_name == 'schedule'"));
 assert.match(y,/No actual source archival changes/);
 assert.match(y,/No durable private 9 AM archive/);
 assert.match(y,/Private runner processes|private checkout|private-only/i);
});
test("slot-specific failure protection rejects a 6AM cron seen at 9AM",()=>{
 const d=decide({eventName:"schedule",schedule:"7 6 * * *",
  now:"2026-11-10T17:17:01Z"});
 assert.equal(d.allowed,false);
 assert.equal(d.expected,"06:00");
 assert.equal(d.actualSlot,"09:00");
});
