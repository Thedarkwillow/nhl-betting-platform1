"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {NAME,primaryFailedBeforeBackup}=require("../src/nhl-backup-primary-run-gate.cjs");
const {status,API}=require("../scripts/nhl-backup-primary-run-gate.cjs");
const now="2026-11-05T17:45:00Z";
const make=(created_at,conclusion="failure",state="completed")=>({
 id:41900000001,name:NAME,event:"schedule",head_branch:"main",
 created_at,status:state,conclusion,
 html_url:"https://github.com/example/should-not_be_reprinted",secret:"not safe"
});
test("fallback can run only after same-day scheduled main primary completed with failure",()=>{
 const r=primaryFailedBeforeBackup([make("2026-11-05T17:30:00Z")],now);
 assert.equal(r.eligible,true);
 assert.equal(r.decision,"primary_failed_before_backup");
 assert.equal(r.billedProviderRequests,0);
 assert.equal(r.secret,undefined);
});
test("late schedule, same-day running, success, previous-day, manual fail all block fallback",()=>{
 const cases=[
 [make("2026-11-05T17:40:00Z",null,"in_progress")],
 [make("2026-11-05T17:30:00Z","success")],
 [make("2026-11-04T17:30:00Z")],
 [{...make("2026-11-05T17:30:00Z"),event:"workflow_dispatch"}],
 [make("2026-11-05T18:30:00Z")],
 []
 ];
 for(const runs of cases)assert.equal(primaryFailedBeforeBackup(runs,now).eligible,false);
});
test("latest primary attempt overrides earlier failure to prevent redundant paid calls",()=>{
 const latest=make("2026-11-05T17:42:00Z",null,"in_progress");
 const older=make("2026-11-05T17:25:00Z","failure");
 const r=primaryFailedBeforeBackup([older,latest],now);
 assert.equal(r.eligible,false);
 assert.equal(r.decision,"primary_still_running_or_queued");
});
test("unavailable GitHub input never assumes primary failed",async()=>{
 assert.throws(()=>primaryFailedBeforeBackup(null,now),/unavailable/);
 const client=async(url,opts)=>{
  assert.equal(url,API);
  assert.equal(opts.headers.Authorization,"Bearer test");
  return {ok:true,json:async()=>({workflow_runs:[make("2026-11-05T17:25:00Z")]})};
 };
 assert.equal((await status({token:"test",client,now})).eligible,true);
 await assert.rejects(status({token:"",client,now}),/Missing read-only/);
 await assert.rejects(status({token:"test",client:async()=>({ok:false,status:403}),now}),
  /HTTP 403/);
});
