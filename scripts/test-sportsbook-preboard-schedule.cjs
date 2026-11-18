"use strict";
const test=require("node:test"),a=require("node:assert/strict"),fs=require("node:fs");
const file=".github/workflows/private-bounded-sportsbook-quotes.yml";
test("existing two quote runs precede original 06/09 Pacific boards without added paid triggers",()=>{
 const s=fs.readFileSync(file,"utf8");
 a.match(s,/cron: '45 5 \* \* \*'/);
 a.match(s,/cron: '45 8 \* \* \*'/);
 a.equal((s.match(/cron:/g)||[]).length,2);
 a.equal((s.match(/timezone: America\/Los_Angeles/g)||[]).length,2);
 a.doesNotMatch(s,/workflow_run:/);
 a.doesNotMatch(s,/^  push:/m);
 a.match(s,/if: github.event_name == 'schedule' \|\| github.event_name == 'workflow_dispatch'/);
 a.equal((s.match(/node scripts\/collect-bounded-sportsbook-quotes\.cjs/g)||[]).length,1);
 a.match(s,/ODDS_API_KEY: \$\{\{ secrets\.ODDS_API_KEY \}\}/);
 a.match(s,/private-bounded-odds-quota/);
});
