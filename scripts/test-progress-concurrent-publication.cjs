"use strict";
const test=require("node:test"),a=require("node:assert/strict"),fs=require("node:fs");
const s=fs.readFileSync(".github/workflows/publish-safe-research-progress.yml","utf8");
test("race-safe progress publisher never rebases stale JSON over a newer source report",()=>{
 a.match(s,/git fetch -q origin main/);
 a.match(s,/git reset --hard -q origin\/main/);
 a.match(s,/Date\.parse\(current\.sourceReportAt\)>Date\.parse\(next\.sourceReportAt\)/);
 a.match(s,/Date\.parse\(current\.generatedAt\)>=Date\.parse\(next\.generatedAt\)/);
 a.match(s,/git add data\/research-evidence-progress\.json/);
 a.doesNotMatch(s,/git -c rebase\.autoStash=true rebase/);
 a.doesNotMatch(s,/git add -A|git add \./);
 a.match(s,/equal or newer sanitized source already published/);
});
test("current private source and original account reporting safeguards survive concurrent retry",()=>{
 a.match(s,/source-completion-readiness-latest\.json/);
 a.match(s,/age>24\*60\*60000/);
 a.match(s,/x\.periodHistory\.accountedDays\+x\.periodHistory\.pendingDays/);
 a.match(s,/persist-credentials: false/);
});
