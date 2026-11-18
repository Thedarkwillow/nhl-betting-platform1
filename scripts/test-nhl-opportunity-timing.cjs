"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),
 fs=require("node:fs");
const workflow=".github/workflows/private-nhl-shot-point-opportunity.yml";
test("NHL opportunities consume verified morning freeze before 30 minute cutoff",()=>{
 const src=fs.readFileSync(workflow,"utf8");
 assert.match(src,/workflows: \[.*'Freeze actual-time NHL and NFL pregame Higher Lower research'\]/);
 assert.match(src,/github\.event\.workflow_run\.conclusion == 'success'/);
 assert.match(src,/github\.event\.workflow_run\.head_branch == 'main'/);
 assert.match(src,/node scripts\/report-nhl-shot-point-opportunity\.cjs/);
 assert.match(src,/node scripts\/report-open-model-ideas\.cjs/);
 assert.match(src,/group: private-nhl-shot-point-opportunity/);
 assert.match(src,/node --test test\/nhl-shot-point-opportunity\.test\.cjs/);
 assert.doesNotMatch(src,/ODDS_API_KEY|THE_ODDS_API_KEY|PLACE_WAGER|AUTO_BET/);
});
