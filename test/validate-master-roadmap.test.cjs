"use strict";
const assert=require("node:assert/strict"),test=require("node:test"),
 fs=require("node:fs"),path=require("node:path");
const {validate}=require("../scripts/validate-master-roadmap.cjs");
const original=fs.readFileSync(path.join(__dirname,"../docs/MASTER_BETTING_PLATFORM_ROADMAP.md"),"utf8");
test("real roadmap has distinct tasks, evidence and MLB last",()=>{
 const x=validate(original);
 assert.deepEqual(x.errors,[]);
 assert.ok(x.tasks>=140);
 assert.ok(x.checked>=13);
 assert.equal(x.completionLogEntries,x.checked);
 assert.equal(x.pending,x.tasks-x.checked);
});
test("checking a task without evidence is rejected",()=>{
 const x=validate(original.replace("- [ ] **[SHARP-01]**","- [x] **[SHARP-01]**"));
 assert.ok(x.errors.some(s=>s.includes("SHARP-01 requires completion log")));
});
test("duplicate task ID rejected",()=>{
 const x=validate(original.replace("**[SHARP-02]**","**[SHARP-01]**"));
 assert.ok(x.errors.some(s=>s.includes("Duplicate task ID SHARP-01")));
});
test("rollout priority cannot move MLB forward",()=>{
 const x=validate(original.replace("2. **NFL SECOND","2. **MLB SECOND"));
 assert.ok(x.errors.some(s=>s.includes("MLB LAST")));
});
