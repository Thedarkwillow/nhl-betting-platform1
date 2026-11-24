"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {recoveryGate}=require("../src/nhl-no-credit-freeze-recovery.cjs");
const t="2026-11-08T14:12:00Z";
const board={provider:"prizepicksapi.com",sourceStatus:"fresh",
 completePagination:true,requestedScheduledSlotPacific:"06:00",
 generatedAt:"2026-11-08T14:05:00Z",rows:[{projectionId:1}]};
test("only a complete same-Pacific-day fresh 6 AM purpose board can be reused without a paid call",()=>{
 const a=recoveryGate({now:t,board});
 assert.equal(a.recover,true);
 assert.equal(a.status,"fresh_archived_board_eligible_for_no_credit_recovery");
 assert.equal(a.providerQuoteRequestsAuthorized,0);
 assert.equal(recoveryGate({now:t,board,alreadyFrozen:1}).recover,false);
 assert.equal(recoveryGate({now:t,board:{...board,requestedScheduledSlotPacific:"09:00"}}).recover,false);
 assert.equal(recoveryGate({now:t,board:{...board,rows:[]}}).recover,false);
 assert.equal(recoveryGate({now:"2026-11-08T14:45:00Z",board}).recover,false);
 assert.equal(recoveryGate({now:"2026-11-09T14:12:00Z",board}).recover,false);
});
test("invalid clock and manipulated future capture fail safely",()=>{
 assert.throws(()=>recoveryGate({now:"invalid",board}),/clock/);
 assert.equal(recoveryGate({now:t,board:{...board,generatedAt:"2026-11-08T15:00:00Z"}}).recover,false);
});
test("workflow never grants any paid quote provider credential or reruns collector",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const yaml=fs.readFileSync(path.join(__dirname,
 "../.github/workflows/nhl-no-credit-pregame-freeze-recovery.yml"),"utf8");
 assert.match(yaml,/Bounded Daily NHL Pregame Freeze \(Legacy Requests\)/);
 assert.match(yaml,/ref: main/);
 assert.match(yaml,/fetch-depth: 0/);
 assert.match(yaml,/node scripts\/verify-nhl-frozen-pregame-commit\.cjs/);
 assert.match(yaml,/steps\.verify\.outputs\.verified/);
 assert.match(yaml,/gh issue create/);
 for(const forbidden of ["PRIZEPICKSAPI_KEY","PRIZEPICKS_KEY","collect-prizepicks-asof-nhl.cjs",
   "NHL_EXTERNAL_GITHUB_PAT","CLOUDFLARE_API_TOKEN"])assert.equal(yaml.includes(forbidden),false);
});
