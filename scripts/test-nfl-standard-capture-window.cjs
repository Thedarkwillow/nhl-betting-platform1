"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {shouldCapture,local}=require("../scripts/nfl-standard-capture-window.cjs");
test("delayed GitHub Sunday schedule cannot spend NFL quota after 7 AM Pacific",()=>{
 assert.deepEqual(local("2026-11-22T21:03:38Z"),{weekday:"Sun",hour:13});
 assert.equal(shouldCapture({event:"schedule",now:"2026-11-22T21:03:38Z"}),false);
 assert.equal(shouldCapture({event:"schedule",now:"2026-11-22T15:20:00Z"}),true);
 assert.equal(shouldCapture({event:"schedule",now:"2026-11-22T16:20:00Z"}),false);
});
test("scheduled NFL Standard is limited to local Sunday Monday Thursday and no duplicate archive",()=>{
 for(const when of ["2026-11-23T15:15:00Z","2026-11-26T15:15:00Z"])
  assert.equal(shouldCapture({event:"schedule",now:when}),true);
 assert.equal(shouldCapture({event:"schedule",now:"2026-11-24T15:15:00Z"}),false);
 assert.equal(shouldCapture({event:"schedule",now:"2026-11-22T15:15:00Z",freshArchive:true}),false);
});
test("workflow_run can recover only at 6 AM Pacific; manual remains explicit",()=>{
 assert.equal(shouldCapture({event:"workflow_run",now:"2026-11-22T14:10:00Z"}),true);
 assert.equal(shouldCapture({event:"workflow_run",now:"2026-11-22T15:10:00Z"}),false);
 assert.equal(shouldCapture({event:"workflow_run",now:"2026-11-22T14:10:00Z",freshArchive:true}),false);
 assert.equal(shouldCapture({event:"workflow_dispatch",now:"2026-11-22T21:03:38Z"}),true);
 assert.equal(shouldCapture({event:"other",now:"2026-11-22T15:10:00Z"}),false);
 assert.equal(shouldCapture({event:"schedule",now:"invalid"}),false);
});

test("alternate scheduled quota guard excludes actual delayed failure and respects authorized window",()=>{
 assert.equal(shouldCapture({event:"schedule",now:"2026-11-27T00:01:38Z"}),false);
 assert.equal(shouldCapture({event:"schedule",now:"2026-11-26T15:45:00Z"}),true);
 assert.equal(shouldCapture({event:"schedule",now:"2026-11-26T16:00:00Z"}),false);
 assert.equal(shouldCapture({event:"schedule",now:"2026-11-26T15:45:00Z",freshArchive:true}),false);
 assert.equal(shouldCapture({event:"workflow_dispatch",now:"2026-11-27T00:01:38Z"}),true);
});
test("alternate workflow gates private checkout and metered collection, keeping original quota reserves",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const s=fs.readFileSync(path.join(__dirname,"../.github/workflows/independent-nfl-alternate-private-preview.yml"),"utf8");
 assert.match(s,/id: window[\s\S]*?shouldCapture\(\{event:process\.env\.EVENT,now:Date\.now\(\)\}\)/);
 assert.match(s,/if: steps\.window\.outputs\.capture == 'true'\s+with:\s+repository:/);
 assert.match(s,/id: recovery[\s\S]*?b\.requestedTier===tier&&b\.completePagination===true/);
 assert.match(s,/name: Capture only the requested NFL alternate tier under legacy quota\s+if: steps\.recovery\.outputs\.capture == 'true'/);
 assert.match(s,/q\.requestsRemaining<\(pages===0\?150:110\)/);
 assert.match(s,/if\(!key\|\|calls>=36\)/);
});
