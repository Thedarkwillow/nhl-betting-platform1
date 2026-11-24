"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const path=require("node:path"),fs=require("node:fs");
const {COLUMNS}=require("../src/partner-prizepicks-board.cjs");
const {NFL_COLUMNS,convertCompactArchive}=require("../src/partner-prizepicks-compact-archive.cjs");
const {loadCapture,buildOfflineReport}=require("../scripts/build-partner-board-preview.cjs");
const captureStart="2026-11-08T17:03:19.211Z";
const captureEnd="2026-11-08T17:03:52.537Z";
const observedNhl="2026-11-08T17:03:20.631Z";
const now="2026-11-08T17:10:00Z";
const sportInfo=(sport)=>({
 sport,leagueId:sport==="NHL"?8:9,rawCount:1,normalizedCount:1,
 parts:1,format:sport==="NHL"?"object_rows":"compact_21_columns",
 sourceObservedAt:sport==="NHL"?observedNhl:captureEnd,completePagination:true
});
const manifest={
 schemaVersion:1,kind:"actual_time_private_partner_offer_observations",
 source:"partner-api.prizepicks.com",
 snapshotMode:"direct_live_board_compact_mixed_formats",
 captureStartedUTC:captureStart,captureFinishedUTC:captureEnd,
 sourceAuthenticatedFirstParty:false,completePagination:true,
 captureWithinNineAmPacificWindow:true,exactNineAmInstantCertified:false,
 sports:[sportInfo("NHL"),sportInfo("NFL")]
};
const example={
 projectionId:"nhl-16805639",providerPlayerId:"111",player:"Joe Example",team:"BOS",
 position:"F",providerGameId:"200",gameExternalId:"NHL_game_example",
 eventStartsAt:"2026-11-08T20:00:00Z",opponent:"FLA",market:"SOG",line:2.5,
 tier:"standard",offeredWagerTypes:"under_or_over",
 boardTime:"2026-11-05T14:00:00Z",lineUpdatedAt:"2026-11-08T16:59:00Z",
 status:"pre_game",inGame:false,isLive:false,eventType:"team",
 period:"Full game",groupKey:"111-30-example",combo:false
};
const nflMetadata={
 schemaVersion:1,source:"partner-api.prizepicks.com",leagueId:9,
 sourceCount:1,parts:1,completePagination:true,sourceMeta:{current_page:1,total_pages:1},
 columns:NFL_COLUMNS,captureStartedUTC:"2026-11-08T17:03:49.484Z",
 captureFinishedUTC:captureEnd
};
const nflRow=Object.fromEntries(NFL_COLUMNS.map(k=>[k,
 k==="durationId"?"11":k==="projectionId"?"nfl-1":
 k==="player"?"QB Example":k==="position"?"QB":
 k==="team"?"BUF":k==="opponent"?"MIA":k==="market"?"Pass Yards":
 k==="line"?200.5:k==="tier"?"standard":
 k==="offeredWagerTypes"?"under_or_over":
 k==="eventStartsAt"?"2026-11-09T20:00:00Z":
 k==="lineUpdatedAt"?"2026-11-08T17:00:00Z":
 k==="boardTime"?"2026-11-08T14:00:00Z":
 k==="status"?"pre_game":
 k==="inGame"||k==="isLive"||k==="combo"?false:
 k==="eventType"?"team":"123"
]));
const nflValues=NFL_COLUMNS.map(k=>nflRow[k]);
test("NHL objects convert without changing original source evidence",()=>{
 const original=JSON.stringify(example);
 assert.equal(Object.keys(example).length,COLUMNS.length);
 const board=convertCompactArchive(manifest,[[example]],{sport:"NHL",now});
 assert.equal(board.rawOfferCount,1);
 assert.equal(board.rows.length,2);
 assert.equal(board.rows[0].capturedAt,observedNhl);
 assert.equal(board.rows[1].side,"Lower");
 assert.equal(board.captureWithinNineAmPacificWindow,true);
 assert.equal(board.exactNineAmInstantCertified,false);
 assert.equal(board.originalModelSelectionGitFrozen,false);
 assert.equal(JSON.stringify(example),original);
});
test("NFL 21-column source validates authoritative column metadata",()=>{
 const board=convertCompactArchive(manifest,[[nflValues]],{
  sport:"NFL",now,metadata:nflMetadata
 });
 assert.equal(board.rawOfferCount,1);
 assert.equal(board.rows.length,2);
 assert.equal(board.rows[0].period,"Full game");
 assert.equal(board.rows[0].providerGameId,"123");
 assert.throws(()=>convertCompactArchive(manifest,[[nflValues]],{
  sport:"NFL",now,metadata:{...nflMetadata,columns:[...NFL_COLUMNS].reverse()}
 }),/metadata mismatch/);
});
test("Reject gaps, mismatched source counts, bad timestamps, and missing IDs",()=>{
 assert.throws(()=>convertCompactArchive({...manifest,completePagination:false},
  [[example]],{sport:"NHL",now}));
 assert.throws(()=>convertCompactArchive(manifest,[],{sport:"NHL",now}));
 assert.throws(()=>convertCompactArchive(manifest,[[example,example]],{sport:"NHL",now}));
 assert.throws(()=>convertCompactArchive(manifest,[[{...example,projectionId:null}]],
  {sport:"NHL",now}));
 assert.throws(()=>convertCompactArchive({...manifest,captureWithinNineAmPacificWindow:false},
  [[example]],{sport:"NHL",now}));
 assert.equal(convertCompactArchive(manifest,[[{...example,eventStartsAt:null}]],
  {sport:"NHL",now}).rows.length,0);
});
test("Reject invented offered directions and started games",()=>{
 assert.equal(convertCompactArchive(manifest,[[{...example,offeredWagerTypes:null}]],
  {sport:"NHL",now}).rows.length,0);
 assert.equal(convertCompactArchive(manifest,[[{...example,eventStartsAt:"2026-11-08T16:00:00Z"}]],
  {sport:"NHL",now}).rows.length,0);
 assert.equal(convertCompactArchive(manifest,[[{...example,combo:true}]],
  {sport:"NHL",now}).rows.length,0);
 assert.equal(convertCompactArchive(manifest,[[example]],{
  sport:"NHL",now:"2026-11-08T18:10:00Z"
 }).sourceStatus,"stale");
});
test("Verify ALL original November 8 09:03 source parts remain readable privately",()=>{
 const dir="outputs/manual-board-captures/2026-11-08/20261108T170319Z";
 const root=path.join(__dirname,"..");
 // Fixture is part of the PRIVATE repository only; no raw exports to public.
 if(!fs.existsSync(path.join(root,dir,"manifest.json"))) throw Error("Private archive missing");
 const a=loadCapture(dir,{now});
 assert.equal(a.boards.NHL.rawOfferCount,1973);
 assert.equal(a.boards.NFL.rawOfferCount,8308);
 assert.equal(a.boards.NHL.normalization.totalOfferIDs,1973);
 assert.equal(a.boards.NFL.normalization.totalOfferIDs,8308);
 assert.equal(a.boards.NHL.originalModelSelectionGitFrozen,false);
 assert.equal(a.boards.NHL.exactNineAmInstantCertified,false);
 const r=buildOfflineReport(a,{now,projections:null});
 assert.equal(r.eligibleForOfficialProspectiveGrading,false);
 assert.equal(r.verifiedExpectedValue,false);
 assert.equal(r.accountWagersPlaced,0);
 assert.match(r.note,/09:00 Pacific hour/);
});
