"use strict";
const t=require("node:test"),a=require("node:assert/strict"),fs=require("node:fs");
const odds=fs.readFileSync(".github/workflows/private-bounded-sportsbook-quotes.yml","utf8"),
 period=fs.readFileSync(".github/workflows/private-nhl-period-backfill.yml","utf8");
t("fresh board source triggers the existing capped 6/9 research odds collector",()=>{
 a.match(odds,/workflow_run:[\s\S]*Public Free Runners - Private NHL and NFL 6 and 9 AM Boards/);
 a.match(odds,/github\.event\.workflow_run\.conclusion == 'success'/);
 a.match(odds,/github\.event\.workflow_run\.head_branch == 'main'/);
 a.match(odds,/group: private-bounded-odds-quota/);
 a.match(odds,/node scripts\/collect-bounded-sportsbook-quotes\.cjs/);
 a.match(odds,/No additional daily provider requests or quota allocation/);
 a.match(odds,/5 \* \* \*|45 5/);
 a.match(odds,/45 8 \* \* \*/);
 a.doesNotMatch(odds,/AUTO_WAGER|PLACE_BET/);
});
t("NHL final five dates keep bounded official source pacing and isolate production",()=>{
 a.match(period,/node --test test\/nhl-prior-season-period-backfill/);
 a.match(period,/npm run backfill:period-prior/);
 a.match(period,/max(imum)? five.date|maximum five dates|five-date limit/i);
 a.match(period,/concurrency:[\s\S]*private-nhl-period-backfill-public-runner/);
 a.match(period,/timeout-minutes: 35/);
 a.match(period,/1\.2-second official-source pacing/);
 a.match(period,/zero paid-provider requests/);
 a.match(period,/Private NHL specialist period history backfill via public runner/);
});
