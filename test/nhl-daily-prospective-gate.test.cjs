"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {pacificDate,utcArchiveDate,checkDailyCapture}=
 require("../src/nhl-daily-prospective-gate.cjs");
const now="2026-11-06T14:25:00Z";
const base={now,eventName:"schedule",runAttempt:1,
 sourceArchiveFiles:["outputs/free-source/nhl/snapshots/20261106T001500Z.json"],
 researchArchiveFiles:["outputs/research/snapshots/20261106T001503Z.json"]};
test("recognizes UTC early hours as prior Pacific calendar day",()=>{
 assert.equal(pacificDate("2026-11-06T00:15:03Z"),"2026-11-05");
 assert.equal(pacificDate(now),"2026-11-06");
 assert.equal(utcArchiveDate("outputs/research/snapshots/20261106T001503Z.json"),
  "2026-11-06T00:15:03Z");
 assert.equal(checkDailyCapture(base).allow,true);
});
test("only a same-day 06:00 Pacific archived board prevents duplicate paid capture",()=>{
 for(const field of ["sourceArchiveFiles","researchArchiveFiles"]){
  assert.ok(checkDailyCapture({...base,
   [field]:["outputs/free-source/nhl/snapshots/20261106T142500Z.json"]})
   .reasons.includes("already_archived_on_this_pacific_day"));
  assert.equal(checkDailyCapture({...base,
   [field]:["outputs/free-source/nhl/snapshots/20261106T182500Z.json"]}).allow,true,
   "Unrelated 10:25 Pacific source must not suppress the 06:00 scheduled attempt");
 }
});
test("no manual, push, rerun or outside-safe-daytime event can request paid NHL daily quotes",()=>{
 for(const eventName of ["push","workflow_dispatch","workflow_run"]){
  assert.equal(checkDailyCapture({...base,eventName}).allow,false);
 }
 assert.equal(checkDailyCapture({...base,runAttempt:2}).allow,false);
 assert.equal(checkDailyCapture({...base,now:"2026-11-06T17:25:00Z"}).allow,true,
  "Delayed 06:00 GitHub schedule must not suppress a usable 09:25 actual board");
 assert.equal(checkDailyCapture({...base,now:"2026-11-07T03:25:00Z"}).allow,false);
});
test("daily schedule operates beyond the former Nov 6-13 trial window",()=>{
 assert.equal(checkDailyCapture({...base,now:"2026-11-14T14:25:00Z"}).allow,true);
 assert.equal(checkDailyCapture({...base,now:"2027-02-01T14:25:00Z"}).allow,true);
});
test("unsafe date stamps are not confused with a real saved source",()=>{
 for(const file of ["20261106T999999Z.json","20261106T001500Z.json.bak",
  "20261306T001500Z.json","../../20261106T0230Z.json"]){
  assert.equal(utcArchiveDate(file),null);
 }
 assert.equal(checkDailyCapture({...base,
  sourceArchiveFiles:["outputs/free-source/nhl/snapshots/20261106T999999Z.json"]}).allow,true);
});

test("metered 06:00 production route is paused while trusted offline grading remains manual",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
 const wf=read(".github/workflows/nhl-bounded-daily-pregame-freeze.yml");
 const reusable=read(".github/workflows/trial-free-prizepicks-nhl.yml");
 const grader=read(".github/workflows/grade-nhl-predictions.yml");
 assert.match(wf,/Metered NHL 6 AM Collector Paused/);
 assert.match(wf,/No Vendor Calls/);
 assert.match(wf,/workflow_dispatch:/);
 assert.doesNotMatch(wf,/^\s+schedule:/m);
 assert.doesNotMatch(wf,/^\s+workflow_run:/m);
 assert.doesNotMatch(wf,/PRIZEPICKSAPI_KEY|collect-prizepicks-asof-nhl\.cjs/);
 assert.match(reusable,/node scripts\/collect-prizepicks-asof-nhl\.cjs/);
 assert.match(reusable,/cron: '15 16 1 \* \*'/);
 assert.match(grader,/manual-only private fallback/);
 assert.match(grader,/workflow_dispatch:/);
 assert.doesNotMatch(grader,/^\s+workflow_run:/m);
});
test("late 06:00 capture is deduplicated using complete scheduled-purpose source evidence",()=>{
 const filename="outputs/free-source/nhl/snapshots/20261106T201700Z.json";
 const board={generatedAt:"2026-11-06T20:17:00.320Z",
  requestedScheduledSlotPacific:"06:00",provider:"prizepicksapi.com",
  sourceStatus:"fresh",completePagination:true,rows:[{projectionId:"x"}]};
 const late={...base,now:"2026-11-06T20:22:00Z",sourceArchiveFiles:[],
  researchArchiveFiles:[],sourceArchiveRecords:[{filename,board}]};
 const gate=checkDailyCapture(late);
 assert.equal(gate.allow,false);
 assert.equal(gate.alreadyArchived,true);
 assert.equal(gate.late,true);
 assert.ok(gate.reasons.includes("already_archived_on_this_pacific_day"));
 assert.equal(checkDailyCapture({...late,sourceArchiveRecords:[{
  filename,board:{...board,completePagination:false}
 }]}).allow,true);
});

test("retired Cloudflare dispatch cannot spend even if an offline hypothetical gate would permit it",()=>{
 const eventName="workflow_dispatch",externalTrigger="external_cloudflare_cron";
 const allowed=checkDailyCapture({...base,eventName,externalTrigger});
 assert.equal(allowed.allow,true);
 assert.equal(allowed.triggerKind,"external_cloudflare_cron");
 assert.equal(checkDailyCapture({...base,eventName,externalTrigger:"cloudflare"}).allow,false);
 assert.equal(checkDailyCapture({...base,eventName,externalTrigger,runAttempt:2}).allow,false);
 assert.equal(checkDailyCapture({...base,eventName,externalTrigger,
  now:"2026-11-06T12:00:00Z"}).allow,false);
 const fs=require("node:fs"),path=require("node:path");
 const workflow=fs.readFileSync(path.join(__dirname,
  "../.github/workflows/nhl-bounded-daily-pregame-freeze.yml"),"utf8");
 const delta=fs.readFileSync(path.join(__dirname,
  "../.github/workflows/nhl-0900-board-delta.yml"),"utf8");
 for(const text of [workflow,delta]){
  assert.match(text,/workflow_dispatch:/);
  assert.match(text,/trigger_source:/);
  assert.match(text,/Paused \(No Vendor Calls\)/);
  assert.doesNotMatch(text,/collect-prizepicks-asof-nhl\.cjs|PRIZEPICKSAPI_KEY/);
  assert.doesNotMatch(text,/^\s+schedule:/m);
 }
});
