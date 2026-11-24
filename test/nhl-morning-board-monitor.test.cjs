"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {stampFromFilename,findCompleteSourceArchive,captureGate,watchdog}=
 require("../src/nhl-morning-board-monitor.cjs");
const six="2026-11-06T14:02:00.372Z";
const nine="2026-11-06T17:11:00.251Z";
const files=[
 "outputs/free-source/nhl/snapshots/20261106T140200Z.json",
 "outputs/free-source/nhl/snapshots/20261106T171100Z.json"];
const board=at=>JSON.stringify({generatedAt:at,provider:"prizepicksapi.com",
 sourceStatus:"fresh",completePagination:true,rows:[{player:"Sample"}]});
const source={ [files[0]]:board(six),[files[1]]:board(nine)};
const read=p=>source[p];
test("archive filenames parsed strictly, including genuine timestamp fractions",()=>{
 assert.equal(stampFromFilename(files[0]),"2026-11-06T14:02:00Z");
 assert.equal(stampFromFilename("20261306T140200Z.json"),null);
 assert.equal(stampFromFilename("bad.json"),null);
 assert.equal(findCompleteSourceArchive(files,read,{day:"2026-11-06",slot:"06:00"}).rows,1);
 assert.equal(findCompleteSourceArchive(files,read,{day:"2026-11-06",slot:"09:00"}).at,nine);
});
test("09:00 paid collection is refused after a real complete 09:00 archive",()=>{
 const now="2026-11-06T17:29:00Z";
 assert.equal(captureGate({now,eventName:"schedule",files:[files[0]],readFile:read}).allow,true);
 const skip=captureGate({now,eventName:"schedule",files,readFile:read});
 assert.equal(skip.allow,false);
 assert.ok(skip.reasons.includes("already_archived_complete_0900_board"));
 assert.equal(captureGate({now:"2026-11-06T20:00:00Z",eventName:"schedule",files:[],readFile:read}).allow,true,
  "Delayed 09:00 run must still attempt a fresh actual-time capture");
 assert.equal(captureGate({now:"2026-11-07T03:00:00Z",eventName:"schedule",files:[],readFile:read}).allow,false);
 assert.equal(captureGate({now,eventName:"push",files:[],readFile:read}).allow,false);
});
test("incomplete partial, corrupt and stale provider archives never prove a full board",()=>{
 const faulty={...source,[files[1]]:JSON.stringify({generatedAt:nine,
   provider:"prizepicksapi.com",sourceStatus:"stale",completePagination:false,rows:[{}]})};
 const result=captureGate({now:"2026-11-06T17:29:00Z",eventName:"schedule",
   files,readFile:p=>faulty[p]});
 assert.equal(result.allow,true);
});
test("watchdog requires real 06:00 and 09:00 boards and matching change evidence",()=>{
 const movement={morningDelta:{status:"valid_independent_source_delta_only",
   previousAt:six,currentAt:nine}};
 const healthy=watchdog({now:"2026-11-06T18:55:00Z",files,readFile:read,movement});
 assert.equal(healthy.missingSix,false);
 assert.equal(healthy.missingNine,false);
 assert.equal(healthy.validSameDayDelta,true);
 assert.equal(healthy.noPaidCallsByWatchdog,true);
 const missing=watchdog({now:"2026-11-06T18:55:00Z",files:[files[1]],
   readFile:read,movement});
 assert.equal(missing.missingSix,true);
 assert.equal(missing.validSameDayDelta,false);
});
test("watchdog remains scheduled while old metered daily backups stay disabled",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const readLocal=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
 const sixWorkflow=readLocal(".github/workflows/nhl-bounded-daily-pregame-freeze.yml");
 const nineWorkflow=readLocal(".github/workflows/nhl-0900-board-delta.yml");
 const watcher=readLocal(".github/workflows/nhl-morning-board-watchdog.yml");
 for(const wf of [sixWorkflow,nineWorkflow]){
  assert.match(wf,/Paused \(No Vendor Calls\)/);
  assert.match(wf,/workflow_dispatch:/);
  assert.doesNotMatch(wf,/^\s+schedule:/m);
  assert.doesNotMatch(wf,/PRIZEPICKSAPI_KEY|collect-prizepicks-asof-nhl\.cjs/);
 }
 for(const clock of ["17 8","53 10"])
  assert.ok(watcher.includes("cron: '"+clock+" * * *'"));
 assert.ok(watcher.includes("gh issue create"));
 assert.ok(!watcher.includes("PRIVATE_DISCORD_WEBHOOK_URL"));
});
test("later backup is not billed twice after a complete delayed 09:00-intent board",()=>{
 const lateAt="2026-11-06T22:21:00.245Z";
 const lateFile="outputs/free-source/nhl/snapshots/20261106T222100Z.json";
 const lateSource=JSON.stringify({generatedAt:lateAt,
  requestedScheduledSlotPacific:"09:00",provider:"prizepicksapi.com",
  completePagination:true,sourceStatus:"fresh",rows:[{player:"Sample"}]});
 const gate=captureGate({now:"2026-11-06T22:38:00Z",
  eventName:"schedule",files:[lateFile],readFile:p=>p===lateFile?lateSource:null});
 assert.equal(gate.allow,false);
 assert.equal(gate.alreadyArchived,true);
 assert.equal(gate.late,true);
 assert.ok(gate.reasons.includes("already_archived_complete_0900_board"));
 const invalid=captureGate({now:"2026-11-06T22:38:00Z",
  eventName:"schedule",files:[lateFile],readFile:()=>JSON.stringify({
   ...JSON.parse(lateSource),completePagination:false})});
 assert.equal(invalid.allow,true);
});

test("late tagged catch-up is acknowledged but never counts as a 09:00 morning capture",()=>{
 const lateAt="2026-11-06T22:21:00.245Z";
 const lateFile="outputs/free-source/nhl/snapshots/20261106T222100Z.json";
 const lateBoard=JSON.stringify({generatedAt:lateAt,
  requestedScheduledSlotPacific:"09:00",provider:"prizepicksapi.com",
  completePagination:true,sourceStatus:"fresh",rows:[{player:"Sample"}]});
 const state=watchdog({now:"2026-11-06T23:00:00Z",
  files:[files[0],lateFile],readFile:p=>p===lateFile?lateBoard:source[p],
  movement:null});
 assert.equal(state.six.complete,true);
 assert.equal(state.nine.complete,false);
 assert.equal(state.missingNine,true);
 assert.equal(state.missingDelta,true);
 assert.equal(state.lateSlotIntentCaptures.nine.at,lateAt);
 assert.equal(state.lateCatchupIsNotAnOnTimeMorningSnapshot,true);
});
