"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {compareNhlPrizePicksSources,quarantineBackupRows,safeKey}=
 require("../src/nhl-cross-source-prizepicks-audit.cjs");
const now="2026-11-05T18:00:00Z",observed="2026-11-05T17:59:00Z",
  start="2026-11-05T20:00:00Z";
const offer={player:"Example Skater",team:"BOS",matchup:"NYR",
  eventStartsAt:start,market:"Shots On Goal",line:2.5,
  side:"Higher",tier:"Standard",observedAt:observed,
  capturedAt:now,isLive:false};
const primary={provider:"prizepicksapi.com",sourceStatus:"fresh",
  generatedAt:now,completePagination:true,rows:[offer]};
const backup={provider:"The Odds API",sourceScope:"verified_selected_events",
  coverage:{scopeComplete:true},completePagination:true,
  generatedAt:now,rows:[{...offer,sourceProvider:"The Odds API"}]};
test("same player/event/stat/direction/line confirms independent agreement, not original platform",()=>{
 const r=compareNhlPrizePicksSources(primary,backup,{now});
 assert.equal(r.comparisonPossible,true);
 assert.equal(r.matchedSameLine,1);
 assert.equal(r.conflictingLine,0);
 assert.equal(r.originalPrizePicksPlatformVerified,false);
 assert.equal(r.completeLeagueBoardVerified,false);
 assert.equal(r.verifiedPayout,false);
 assert.equal(r.providerRequests,0);
 assert.equal(quarantineBackupRows(backup.rows,r).quarantined,0);
});
test("disagreement quarantines only conflicting original Standard offers",()=>{
 const wrong={...backup,rows:[{...offer,line:3.5},
  {...offer,player:"Different Player",line:1.5}]};
 const result=compareNhlPrizePicksSources(primary,wrong,{now});
 assert.equal(result.conflictingLine,1);
 assert.equal(result.unmatchedBackup,1);
 const guarded=quarantineBackupRows(wrong.rows,result);
 assert.equal(guarded.quarantined,1);
 assert.equal(guarded.rows.length,1);
 assert.equal(guarded.rows[0].player,"Different Player");
});
test("competing identical keys/unknown standard offers are ambiguous, never silently selected",()=>{
 const b={...backup,rows:[offer,{...offer,line:3.5}]};
 const r=compareNhlPrizePicksSources(primary,b,{now});
 assert.equal(r.ambiguousBackup,1);
 assert.equal(r.conflictingLine,0);
 assert.equal(quarantineBackupRows(b.rows,r).quarantined,2);
 const p={...primary,rows:[offer,{...offer,line:3.5}]};
 const q=compareNhlPrizePicksSources(p,backup,{now});
 assert.equal(q.ambiguousPrimary,1);
 assert.equal(quarantineBackupRows(backup.rows,q).rows.length,0);
});
test("stale/partial snapshots never claim two-source cross-validation or force false disagreement",()=>{
 const stale={...primary,generatedAt:"2026-11-05T15:00:00Z"};
 const partial={...primary,completePagination:false};
 for(const one of [stale,partial,null]){
  const r=compareNhlPrizePicksSources(one,backup,{now});
  assert.equal(r.comparisonPossible,false);
  assert.equal(r.status,"comparison_not_possible_source_missing_stale_or_incomplete");
  assert.equal(r.conflictingLine,0);
  const q=quarantineBackupRows(backup.rows,r);
  assert.equal(q.comparisonUnavailable,true);
  assert.equal(q.rows.length,1);
 }
});
test("non-full-game/unverified alternate, already-started, stale, or unsupported rows never enter comparison",()=>{
 const a={...primary,rows:[offer]};
 const b={...backup,rows:[{...offer,tier:"Unverified alternate"},
  {...offer,eventStartsAt:"2026-11-05T15:00:00Z"},
  {...offer,observedAt:"2026-11-05T16:00:00Z"},
  {...offer,market:"Time On Ice"}]};
 const r=compareNhlPrizePicksSources(a,b,{now});
 assert.equal(r.eligibleOfferCount,0);
 assert.equal(r.staleOrUnsafeBackupRows,4);
 assert.equal(safeKey({...offer,market:"Time On Ice"}),null);
 assert.equal(safeKey({...offer,period:"First period"}),null);
 assert.equal(safeKey({...offer,period:"Full game"}),safeKey(offer));
});
