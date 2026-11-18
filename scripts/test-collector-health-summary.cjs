"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {clock,validCapture,summarize,sportsbookPreboard}=require("./collector-health-summary.cjs");
const nhl={sport:"NHL",rawCount:927,missingPlayers:0,missingGames:0};
const nfl={sport:"NFL",rawCount:1808,missingPlayers:0,missingGames:0};
const example=(slot,start,finished)=>({
 schemaVersion:1,source:"partner-api.prizepicks.com",
 captureSlotPacific:slot,pacificDate:"2026-11-09",
 captureStartedUTC:start,captureFinishedUTC:finished,
 completePagination:true,actualCaptureInRequestedHour:true,
 sourceAuthenticatedFirstParty:false,sports:[nhl,nfl]
});
const six=example("06:00","2026-11-09T14:02:00Z","2026-11-09T14:03:00Z");
const nine=example("09:00","2026-11-09T17:20:16Z","2026-11-09T17:22:17Z");
const freeze={kind:"public_safe_nhl_nfl_original_pregame_freeze_status_v1",
 firstGitAdditionVerified:true,sameCommitForBothSports:true,
 originalModelDirectionsBeforeKickoff:true,
 sourceCaptureFinishedUTC:nine.captureFinishedUTC,
 originalPrivateGitCommitUTC:"2026-11-09T17:26:51Z",
 pregameSelections:{NHL:{count:49},NFL:{count:115}}};
test("truthful Pacific DST hour and full board proof",()=>{
 assert.equal(clock("2026-11-09T14:02:00Z").hour,6);
 assert.equal(clock("2026-06-09T13:02:00Z").hour,6);
 assert.equal(validCapture(six,"06:00","2026-11-09"),true);
 assert.equal(validCapture({...nine,actualCaptureInRequestedHour:false},"09:00","2026-11-09"),false);
 assert.equal(validCapture({...nine,completePagination:false},"09:00","2026-11-09"),false);
});
test("green health probe and successful 9 AM never invent a 6 AM board or 6-9 delta",()=>{
 const x=summarize([nine],freeze,{now:"2026-11-09T17:29:00Z"});
 assert.equal(x.slots["06:00"].status,"no_verified_full_capture");
 assert.equal(x.slots["09:00"].status,"privately_archived_complete");
 assert.deepEqual(x.missingSlots,["06:00"]);
 assert.equal(x.sixToNineChangesVerified,false);
 assert.equal(x.originalPregameFreezeVerifiedForToday,true);
 assert.equal(x.latestSourceFreshWithin30Minutes,true);
 assert.equal(x.rawPlayerRowsPublic,0);
});
test("missing/mismatched freeze reports unavailable and stale archive not current",()=>{
 const t="2026-11-09T19:20:00Z",x=summarize([six,nine],{...freeze,
  originalPrivateGitCommitUTC:"2026-11-09T17:21:00Z"},{now:t});
 assert.equal(x.originalPregameFreezeVerifiedForToday,false);
 assert.equal(x.allMorningCapturesVerified,true);
 assert.equal(x.latestSourceFreshWithin30Minutes,false);
});

test("Nov 18 six-AM board success does not turn Nov 17 sportsbook odds into today",()=>{
 const sixNow={...six,pacificDate:"2026-11-18",
  captureStartedUTC:"2026-11-18T14:05:31Z",
  captureFinishedUTC:"2026-11-18T14:05:32Z"};
 const stale={kind:"bounded_sportsbook_capture_v1",
  pacificDate:"2026-11-17",generatedAt:"2026-11-17T14:06:12Z",
  status:"fresh_bounded_archive",requests:4,newPurchase:false,
  verifiedLiveConsensus:false};
 const r=summarize([sixNow],null,{now:"2026-11-18T14:13:16Z",
  sportsbook:stale});
 assert.equal(r.slots["06:00"].status,"privately_archived_complete");
 assert.equal(r.sportsbookPreboard.slots["05:45"].status,"no_fresh_preboard_odds_archive");
 assert.equal(r.sportsbookPreboard.slots["08:45"].status,"not_due");
 assert.equal(r.sportsbookPreboard.liveAppOfferVerified,false);
 assert.equal(r.sportsbookPreboard.actualProviderRequestsMadeByAudit,0);
});
test("same-day pre-board quote archive is research-only and cannot become verified consensus",()=>{
 const quoted={kind:"bounded_sportsbook_capture_v1",
  pacificDate:"2026-11-18",generatedAt:"2026-11-18T13:47:12Z",
  status:"fresh_bounded_archive",requests:4,newPurchase:false,
  verifiedLiveConsensus:false};
 const board={slots:{"06:00":{observedAt:"2026-11-18T14:05:32Z"},
   "09:00":{observedAt:null}}};
 const r=sportsbookPreboard(quoted,null,{now:"2026-11-18T14:13:16Z",...board});
 assert.equal(r.slots["05:45"].status,"archived_before_board_unmatched");
 assert.equal(r.slots["05:45"].capturedAt,quoted.generatedAt);
 assert.equal(r.slots["05:45"].independentConsensusVerified,false);
 assert.equal(r.slots["08:45"].status,"not_due");
});
test("future/late/unsupported odds are not misreported as successful preboard capture",()=>{
 const base={kind:"bounded_sportsbook_capture_v1",
  pacificDate:"2026-11-18",generatedAt:"2026-11-18T14:06:44Z",
  status:"fresh_bounded_archive",requests:2,newPurchase:false,
  verifiedLiveConsensus:false};
 const slots={"06:00":{observedAt:"2026-11-18T14:05:32Z"}};
 for(const d of [base,{...base,generatedAt:"2026-11-18T15:05:00Z"},
  {...base,status:"status_only"}, {...base,verifiedLiveConsensus:true}]){
  const r=sportsbookPreboard(d,null,{now:"2026-11-18T14:13:16Z",slots});
  assert.equal(r.slots["05:45"].status,"no_fresh_preboard_odds_archive");
 }
});
