"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),
 fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {pacific,intendedScheduledSlot,decide,main,RETRIES}=require("./pacific-morning-capture-gate.cjs");
test("PDT and PST source capture hours use Pacific wall time and not UTC",()=>{
 assert.deepEqual(pacific("2026-07-07T13:07:00Z"),{day:"2026-07-07",hour:6,minute:7});
 assert.deepEqual(pacific("2026-07-07T16:17:00Z"),{day:"2026-07-07",hour:9,minute:17});
 assert.deepEqual(pacific("2026-11-10T14:29:00Z"),{day:"2026-11-10",hour:6,minute:29});
 assert.deepEqual(pacific("2026-11-10T17:41:00Z"),{day:"2026-11-10",hour:9,minute:41});
 assert.deepEqual(pacific("2026-11-10T22:33:37Z"),{day:"2026-11-10",hour:14,minute:33});
});
test("non-hour-start retries correctly label BOTH morning originals",()=>{
 for(const h of [6,9])for(const m of RETRIES){
  const result=decide({eventName:"schedule",schedule:m+" "+h+" * * *",
    now:new Date("2026-11-10T"+String(h+8).padStart(2,"0")+":"+
     String(m).padStart(2,"0")+":04Z")});
  assert.equal(result.allowed,true);
  assert.equal(result.expected,h===6?"06:00":"09:00");
 }
});
test("out-of-hour delayed schedule skips without provider requests, even when launched at 2 PM",()=>{
 const late=decide({eventName:"schedule",schedule:"7 9 * * *",
  now:"2026-11-10T22:33:37Z"});
 assert.equal(late.allowed,false);
 assert.equal(late.state,"skipped_late_or_outside_original_pacific_hour");
 assert.equal(late.providerRequests,0);
 assert.equal(late.originalSixToNineCaptureClaim,false);
});
test("original 6AM cron delayed into 9AM must NOT masquerade as genuine 9AM",()=>{
 const wrong=decide({eventName:"schedule",schedule:"7 6 * * *",
  now:"2026-11-10T17:07:02Z"});
 assert.equal(wrong.actualSlot,"09:00");
 assert.equal(wrong.expected,"06:00");
 assert.equal(wrong.allowed,false);
});
test("capture too near top of hour skips rather than crossing original observed-time",()=>{
 const d=decide({eventName:"schedule",schedule:"53 9 * * *",
  now:"2026-11-10T17:57:00Z"});
 assert.equal(d.allowed,false);
 assert.equal(decide({eventName:"schedule",schedule:"53 9 * * *",
  now:"2026-11-10T17:54:00Z"}).allowed,true);
});
test("explicit 6AM/9AM manual dispatch respects time; counts-only probe is isolated",()=>{
 assert.equal(decide({eventName:"workflow_dispatch",mode:"capture_0600",
  now:"2026-11-10T14:20:00Z"}).allowed,true);
 assert.equal(decide({eventName:"workflow_dispatch",mode:"capture_0900",
  now:"2026-11-10T14:20:00Z"}).allowed,false);
 assert.equal(decide({eventName:"workflow_dispatch",mode:"probe_now",
  now:"2026-11-10T22:10:00Z"}).state,"probe_only");
 assert.throws(()=>decide({eventName:"workflow_dispatch",mode:"capture_0200",
  now:"2026-11-10T14:20:00Z"}),/not recognized/);
});
test("unknown cron, missing authentication for genuine slot, invalid event never dispatch",()=>{
 assert.throws(()=>intendedScheduledSlot("0 9 * * *"),/Unrecognized/);
 assert.throws(()=>intendedScheduledSlot("7 14 * * *"),/Unrecognized/);
 assert.throws(()=>decide({eventName:"repository_dispatch",
  now:"2026-11-10T14:20:00Z"}),/Unrecognized/);
 assert.throws(()=>main({now:"2026-11-10T14:20:00Z",
  env:{GITHUB_EVENT_NAME:"schedule",GITHUB_EVENT_SCHEDULE:"7 6 * * *"}}),/Missing/);
});
test("late-run skip emits output and success-state without checking a private credential",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pacific-capture-gate-"));
 try{
  const out=path.join(dir,"output");
  const s=main({now:"2026-11-10T22:33:00Z",env:{
   GITHUB_EVENT_NAME:"schedule",GITHUB_EVENT_SCHEDULE:"7 9 * * *",
   GITHUB_OUTPUT:out}});
  assert.equal(s.eligible,false);
  const file=fs.readFileSync(out,"utf8");
  assert.match(file,/allowed=false/);
  assert.match(file,/state=skipped_late_or_outside_original_pacific_hour/);
  assert.match(file,/slot=\n/);
  assert.doesNotMatch(file,/token|Bearer|secret/i);
 }finally{fs.rmSync(dir,{force:true,recursive:true})}
});
