"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const y=fs.readFileSync(".github/workflows/publish-safe-research-progress.yml","utf8");
test("safe NHL history counts automatically follow the private source readiness report",()=>{
 assert.match(y,/workflow_run:[\s\S]*Refresh private source readiness after collection and grading/);
 assert.match(y,/github\.event\.workflow_run\.conclusion == 'success'/);
 assert.match(y,/cron: '23 2,8,14,20 \* \* \*'/);
 assert.match(y,/node public\/scripts\/publish-safe-research-progress\.cjs/);
 assert.match(y,/source-completion-readiness-latest\.json/);
 assert.match(y,/age>24\*60\*60000/);
 assert.match(y,/git add data\/research-evidence-progress\.json/);
 assert.doesNotMatch(y,/git add -A|git add \./);
});
test("public historical progress excludes private lines and cannot claim settlement",()=>{
 assert.match(y,/x\.proprietaryRowsPublished!==0/);
 assert.match(y,/x\.paper\.verifiedROI!==null/);
 assert.match(y,/x\.periodHistory\.accountedDays\+x\.periodHistory\.pendingDays/);
 assert.doesNotMatch(y,/ODDS_API_KEY|UNDERDOG_API_KEY|PRIZEPICKS_API_KEY/);
 assert.match(y,/persist-credentials: false/);
});
