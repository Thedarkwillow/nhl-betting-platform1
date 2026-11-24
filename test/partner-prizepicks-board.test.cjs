"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {COLUMNS,offeredSides,normalizeArchive}=require("../src/partner-prizepicks-board.cjs");
const {buildOfflineReport}=require("../scripts/build-partner-board-preview.cjs");
const start="2026-11-08T15:30:53.669Z",captured="2026-11-08T15:30:57.037Z",
 end="2026-11-08T15:30:57.149Z",now="2026-11-08T15:32:00Z";
const info={sport:"NHL",source:"https://partner-api.prizepicks.com/projections?league_id=8",
  sourceObservedAt:captured,rawCount:1,normalizedCount:1,parts:1};
const manifest={schemaVersion:1,source:"partner-api.prizepicks.com",
 snapshotMode:"direct_live_board",completePagination:true,notSixOrNineAmSlot:true,
 captureStartedUTC:start,captureFinishedUTC:end,columns:COLUMNS,sports:[info]};
const row=["16805639","111","Joe Example","BOS","F","200","NHL_game_example",
  "2026-11-08T18:00:00Z","FLA","Shots On Goal",2.5,"standard",
  "under_or_over","2026-11-05T14:00:00Z","2026-11-07T14:00:00Z",
  "pre_game",false,false,"team","Full","group",false];
const chunk={sport:"NHL",observedAtUTC:captured,startIndex:0,rows:[row]};
test("Never guess an absent or restricted side",()=>{
 assert.deepEqual(offeredSides("standard","under_or_over"),["Higher","Lower"]);
 assert.deepEqual(offeredSides("demon","under_or_over"),["Higher"]);
 assert.deepEqual(offeredSides("standard","over"),["Higher"]);
 assert.deepEqual(offeredSides("goblin",null),[]);
 assert.deepEqual(offeredSides("standard",null),[]);
});
test("Complete live partner snapshot permits old unchanged lines only with actual board membership",()=>{
 const b=normalizeArchive(manifest,[chunk],{sport:"NHL",now});
 assert.equal(b.provider,"partner-api.prizepicks.com");
 assert.equal(b.completePagination,true);
 assert.equal(b.snapshotMode,"direct_live_board");
 assert.equal(b.rows.length,2);
 assert.equal(b.rows[0].observedAt,"2026-11-07T14:00:00Z");
 assert.equal(b.rows[0].capturedAt,captured);
 assert.equal(b.rows[1].side,"Lower");
 assert.equal(b.originalModelSelectionGitFrozen,false);
});
test("Never count expired or already-started offers as actionable",()=>{
 assert.equal(normalizeArchive(manifest,[chunk],{sport:"NHL",
  now:"2026-11-08T16:30:58Z"}).sourceStatus,"stale");
 assert.equal(normalizeArchive(manifest,[chunk],{sport:"NHL",
  now:"2026-11-08T19:00:00Z"}).rows.length,0);
});
test("Reject incomplete, duplicate or spoofed source coverage",()=>{
 assert.throws(()=>normalizeArchive({...manifest,completePagination:false},[chunk],{sport:"NHL",now}));
 assert.throws(()=>normalizeArchive(manifest,[],{sport:"NHL",now}));
 assert.throws(()=>normalizeArchive(manifest,[{...chunk,rows:[row,row]}],{sport:"NHL",now}));
 assert.throws(()=>normalizeArchive({...manifest,source:"wrong"},[chunk],{sport:"NHL",now}));
});
test("Block combo, absent sides, unknown opponents, started offers",()=>{
 for(const [field,value] of [["combo",true],["offeredWagerTypes",null],
  ["opponent",null],["inGame",true],["period","1Q"]]){
  const r=row.slice();r[COLUMNS.indexOf(field)]=value;
  assert.equal(normalizeArchive(manifest,[{...chunk,rows:[r]}],{sport:"NHL",now}).rows.length,0,field);
 }
});
test("A preview never upgrades quotes to actual prospective picks",()=>{
 const b=normalizeArchive(manifest,[chunk],{sport:"NHL",now});
 const report=buildOfflineReport({boards:{NHL:b,NFL:{...b,rawOfferCount:1,rows:[]}}},{now,projections:null});
 assert.equal(report.eligibleForOfficialProspectiveGrading,false);
 assert.equal(report.originalModelSelectionGitFrozen,false);
 assert.equal(report.accountWagersPlaced,0);
 assert.equal(report.nfl.playerPropsReadyForAutomaticLineups,false);
});


test("genuine complete 6 AM NHL NFL manifests are accepted; fake morning claims fail",()=>{
 const started="2026-11-10T14:20:18Z",finished="2026-11-10T14:20:19Z",
  sports=[{...info,sourceObservedAt:"2026-11-10T14:20:19Z",missingPlayers:0,missingGames:0,belowMorningMinimumInventory:false},
   {sport:"NFL",rawCount:2000,missingPlayers:0,missingGames:0,
    belowMorningMinimumInventory:false}];
 const real={...manifest,notSixOrNineAmSlot:false,captureSlotPacific:"06:00",
  actualCaptureInRequestedHour:true,pacificDate:"2026-11-10",
  captureStartedUTC:started,captureFinishedUTC:finished,
  hasBelowMorningMinimumInventory:false,sports};
 const part={...chunk,observedAtUTC:"2026-11-10T14:20:19Z"};
 const b=normalizeArchive(real,[part],{sport:"NHL",now:"2026-11-10T14:21:00Z"});
 assert.equal(b.completePagination,true);
 assert.equal(b.rawOfferCount,1);
 assert.throws(()=>normalizeArchive({...real,actualCaptureInRequestedHour:false},[part],
  {sport:"NHL",now:"2026-11-10T14:21:00Z"}),/Untrusted/);
 assert.throws(()=>normalizeArchive({...real,hasBelowMorningMinimumInventory:true},[part],
  {sport:"NHL",now:"2026-11-10T14:21:00Z"}),/Untrusted/);
 assert.throws(()=>normalizeArchive({...real,captureStartedUTC:"2026-11-10T13:20:18Z"},[part],
  {sport:"NHL",now:"2026-11-10T14:21:00Z"}),/Untrusted/);
 assert.throws(()=>normalizeArchive({...real,pacificDate:"2026-11-09"},[part],
  {sport:"NHL",now:"2026-11-10T14:21:00Z"}),/Untrusted/);
});
