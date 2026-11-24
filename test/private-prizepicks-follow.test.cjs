"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validShareUrl,parseSlip,evaluateSharedLineup}=
 require("../src/private-prizepicks-follow-review.cjs");
const {discordPayload,shouldNotify,safeDiscordWebhook}=
 require("../src/private-follow-discord-alerts.cjs");
const target={username:"brigue",sourceMode:"user_supplied_share_links_only",
 alertsEnabled:false,maxDailyNotifications:0,autoSubmitEnabled:false};
const now="2026-11-06T00:15:45Z",eventStartsAt="2026-11-06T02:30:00Z";
const legs=[
 {player:"Player One",team:"COL",opponent:"NSH",market:"Shots On Goal",
 line:2.5,side:"Higher",tier:"Standard",period:"Full game",eventStartsAt},
 {player:"Player Two",team:"COL",opponent:"NSH",market:"Points",
 line:.5,side:"Lower",tier:"Standard",period:"Full game",eventStartsAt}
];
const slip={username:"brigue",shareUrl:"https://www.prizepicks.com/share/example",
 legs};
const board={provider:"independent-third-party",completePagination:true,
 sourceStatus:"fresh",safeForLiveUse:true,generatedAt:"2026-11-06T00:15:30Z",
 rows:[
  {player:"Player One",team:"COL",matchup:"NSH",market:"Shots On Goal",
   line:3.5,side:"Higher",tier:"Standard",period:"Full game",eventStartsAt,
   capturedAt:"2026-11-06T00:15:30Z",observedAt:"2026-11-06T00:15:25Z"},
  {player:"Player Two",team:"COL",matchup:"NSH",market:"Points",
   line:.5,side:"Lower",tier:"Standard",period:"Full game",eventStartsAt,
   capturedAt:"2026-11-06T00:15:30Z",observedAt:"2026-11-06T00:15:25Z"}
 ]};
test("only verified PrizePicks share URL hostname and target username are accepted",()=>{
 assert.equal(validShareUrl(slip.shareUrl),true);
 assert.equal(validShareUrl("https://prizepicks.onelink.me/share/abc"),true);
 assert.equal(validShareUrl("https://app.prizepicks.com/share/abc"),true);
 assert.equal(validShareUrl("https://prizepicks.com.evil.test/share/abc"),false);
 assert.equal(validShareUrl("http://www.prizepicks.com/share/abc"),false);
 assert.equal(validShareUrl("https://evil.test/share/abc"),false);
 assert.equal(parseSlip(slip,target).legs.length,2);
 assert.throws(()=>parseSlip({...slip,username:"not-brigue"},target),/username/);
 assert.throws(()=>parseSlip({...slip,legs:[legs[0]]},target),/2-6/);
 assert.throws(()=>parseSlip({...slip,legs:[{...legs[0],eventStartsAt:"missing"},legs[1]]},target),/Leg 1/);
});
test("unfavorable Higher bump is flagged while an exact match is only an independent observation",()=>{
 const r=evaluateSharedLineup(target,slip,board,{now});
 assert.equal(r.possibleUnfavorableBumps,1);
 assert.equal(r.legs[0].state,"possible_unfavorable_line_bump");
 assert.equal(r.legs[0].observedLine,3.5);
 assert.equal(r.legs[0].action,"hold_for_manual_review");
 assert.equal(r.legs[1].state,"matching_independent_line");
 assert.equal(r.allLegsOriginalPlatformAuthenticated,false);
 assert.equal(r.automaticSubmissionEnabled,false);
 assert.equal(r.paidEntriesPlaced,0);
 assert.equal(r.cannotVerifyBrigueAuthorship,true);
});
test("unfavorable Lower line moves downward and favorable Higher line moves downward",()=>{
 const copy=structuredClone(board);
 copy.rows[0].line=1.5;
 copy.rows[1].line=-.5;
 // Reject negative source line, do not accidentally mark an advantage.
 let r=evaluateSharedLineup(target,slip,copy,{now});
 assert.equal(r.legs[0].state,"different_but_potentially_favorable_line");
 assert.equal(r.legs[1].state,"source_offer_not_matched");
 copy.rows[1].line=0;
 r=evaluateSharedLineup(target,slip,copy,{now});
 assert.equal(r.legs[1].state,"possible_unfavorable_line_bump");
});
test("missing, stale, ambiguous and started markets cannot be reported as authenticated availability",()=>{
 const stale=evaluateSharedLineup(target,slip,board,{now:"2026-11-06T00:48:00Z"});
 assert.equal(stale.legs[0].state,"source_stale_or_unavailable");
 const missing=evaluateSharedLineup(target,slip,{...board,rows:[]},{now});
 assert.equal(missing.legs[0].state,"source_offer_not_matched");
 const ambig=evaluateSharedLineup(target,slip,{...board,rows:[
  ...board.rows,{...board.rows[0],line:2.5}]},{now});
 assert.equal(ambig.legs[0].state,"ambiguous_source_lines");
 const started=evaluateSharedLineup(target,slip,board,{now:"2026-11-06T02:30:00Z"});
 assert.equal(started.legs[0].state,"game_started_or_closed");
 const oldRow=evaluateSharedLineup(target,slip,{...board,rows:[
  {...board.rows[0],observedAt:"2026-11-05T23:00:00Z"},board.rows[1]]},{now});
 assert.equal(oldRow.legs[0].state,"source_offer_not_matched");
});
test("private Discord payload is no-mention, no-payout, review-only, and guarded",()=>{
 const report=evaluateSharedLineup(target,slip,board,{now});
 const payload=discordPayload(report);
 assert.equal(payload.allowed_mentions.parse.length,0);
 assert.match(payload.content,/POSSIBLE WORSE LINE/);
 assert.match(payload.content,/No entries placed/);
 assert.equal(payload.content.includes("http"),false);
 assert.deepEqual(shouldNotify(target,report,{explicitDispatchApproval:true,hasWebhook:true}).reasons,
  ["notification_opt_in_disabled"]);
 assert.equal(shouldNotify({...target,alertsEnabled:true,maxDailyNotifications:1},
  report,{explicitDispatchApproval:false,hasWebhook:true}).allow,false);
 assert.equal(safeDiscordWebhook("https://discord.com/api/webhooks/123456789012345678/a1234567890123456789012"),true);
 assert.equal(safeDiscordWebhook("https://evil.test/api/webhooks/123456789012345678/a1234567890123456789012"),false);
 assert.equal(safeDiscordWebhook("https://discord.com.evil.test/api/webhooks/123456789012345678/a1234567890123456789012"),false);
});
