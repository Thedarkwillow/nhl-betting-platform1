"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {summarize,pacificDay}=require("../assets/daily-ranking-readiness.js");
const now=Date.parse("2026-11-17T19:20:00Z");
const health={
 kind:"public_nhl_nfl_pacific_morning_collection_health_v1",
 generatedAt:"2026-11-17T19:15:00Z",pacificDate:"2026-11-17",
 slots:{"06:00":{status:"privately_archived_complete",observedAt:"2026-11-17T14:05:00Z",nhlOffers:3004,nflOffers:3463},
 "09:00":{status:"privately_archived_complete",observedAt:"2026-11-17T17:05:00Z",nhlOffers:3328,nflOffers:3761}}
};
const freeze={
 kind:"public_safe_nhl_nfl_original_pregame_freeze_status_v1",
 captureSlotPacific:"09:00",
 sourceCaptureFinishedUTC:"2026-11-17T17:05:00Z",originalPrivateGitCommitUTC:"2026-11-17T17:06:00Z",
 firstGitAdditionVerified:true,originalModelDirectionsBeforeKickoff:true,
 pregameSelections:{NHL:{count:402},NFL:{count:238}}
};
const diagnostic={
 kind:"public_nhl_freshness_diagnostic_v1",publicExportApproved:true,
 publishedRows:6,originalPlatformAvailabilityVerified:false,
 generatedAt:"2026-11-17T19:13:00Z",approvedArchiveAt:"2026-11-17T19:09:00Z",
 reason:"fresh_approved_rows"
};
test("verified source and frozen research are distinct from public lines",()=>{
 const x=summarize({health,freeze,diagnostic},now);
 assert.equal(x.six,true);assert.equal(x.nine,true);assert.equal(x.frozen,true);
 assert.equal(x.approved,true);assert.match(x.frozenStatus,/402 NHL \/ 238 NFL/);
 assert.equal(x.originalAppVerified,false);assert.equal(x.calibrated,false);
});
test("stale approved source or diagnostic never produces a live ranking",()=>{
 const x=summarize({health,freeze,diagnostic:{...diagnostic,approvedArchiveAt:"2026-11-17T17:09:00Z"}},now);
 assert.equal(x.approved,false);assert.match(x.rankingStatus,/withheld/);
});
test("missing, invalid or future source never becomes a capture",()=>{
 const empty=summarize({},now);assert.equal(empty.six,false);assert.equal(empty.frozen,false);
 const future=summarize({health:{...health,generatedAt:"2026-11-17T20:20:00Z"},freeze,diagnostic},now);
 assert.equal(future.nine,false);
 const unmatched=summarize({health,freeze:{...freeze,sourceCaptureFinishedUTC:"2026-11-17T18:05:00Z"},diagnostic},now);
 assert.equal(unmatched.frozen,false);
});
test("Pacific local day is used, not a UTC calendar date",()=>{
 assert.equal(pacificDay(Date.parse("2026-11-17T02:00:00Z")),"2026-11-16");
 const stale=summarize({health,freeze,diagnostic},Date.parse("2026-11-18T20:00:00Z"));
 assert.equal(stale.six,false);assert.equal(stale.nine,false);
});
test("9 AM-only evidence stays visible alongside a missing 6 AM archive",()=>{
 const absent={status:"no_verified_full_capture"};
 const x=summarize({health:{...health,slots:{"06:00":absent,"09:00":health.slots["09:00"]}},freeze},now);
 assert.match(x.sourceStatus,/6 AM no verified archive · 9 AM verified/);
 assert.equal(x.six,false);assert.equal(x.nine,true);assert.equal(x.frozen,true);
});
test("audit timing distinguishes not due, awaiting verification and missing",()=>{
 const missing={...health,generatedAt:"2026-11-17T15:05:00Z",
  slots:{"06:00":{status:"no_verified_full_capture"},"09:00":{status:"no_verified_full_capture"}}};
 assert.match(summarize({health:missing},Date.parse("2026-11-17T16:00:00Z")).sourceStatus,
  /6 AM no verified archive · 9 AM not yet due/);
 assert.match(summarize({health:missing},Date.parse("2026-11-17T17:20:00Z")).sourceStatus,
  /9 AM awaiting verification/);
 assert.match(summarize({health:missing},now).sourceStatus,/9 AM post-window audit pending/);
});
test("wrong-slot capture or freeze commit preceding the source cannot be promoted",()=>{
 const x=summarize({health:{...health,slots:{...health.slots,"09:00":{
  ...health.slots["09:00"],observedAt:"2026-11-17T18:05:00Z"}}},freeze},now);
 assert.equal(x.nine,false);assert.equal(x.frozen,false);
 assert.equal(summarize({health,freeze:{...freeze,captureSlotPacific:"06:00"}},now).frozen,false);
 assert.equal(summarize({health,freeze:{...freeze,originalPrivateGitCommitUTC:"2026-11-17T17:04:00Z"}},now).frozen,false);
});
