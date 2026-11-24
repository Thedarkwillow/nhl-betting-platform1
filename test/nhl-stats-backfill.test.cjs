"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalizeStatsReport,mergeOfficialGameStats}=require("../src/nhl-stats-backfill.cjs");
const opt={playerId:8476467,season:"20252026",market:"blockedShots"};
test("official per-game skater blocks augment web game log without losing other stats",()=>{
 const response={total:2,data:[
  {playerId:8476467,gameId:2025020735,gameDate:"2026-01-14",blockedShots:0},
  {playerId:8476467,gameId:2025020738,gameDate:"2026-01-15",blockedShots:3}]};
 const extra=normalizeStatsReport(response,opt);
 const base=[{gameId:2025020735,gameDate:"2026-01-14",shotsOnGoal:2,blockedShots:null}];
 const merged=mergeOfficialGameStats(base,extra);
 assert.equal(merged.length,2);assert.equal(merged[0].shotsOnGoal,2);
 assert.equal(merged[0].blockedShots,0);assert.equal(merged[1].blockedShots,3);
 assert.equal(base[0].blockedShots,null);
});
test("goalie saves from official per-game summary have proper season and date",()=>{
 const x=normalizeStatsReport({total:1,data:[{playerId:8474593,gameId:2025020735,
  gameDate:"2026-01-14",saves:31}]},{playerId:8474593,season:"20252026",market:"saves"});
 assert.equal(x[0].market,"saves");
 assert.equal(x[0].value,31);
 assert.equal(x[0].season,"2025-26");
});
test("rejects incomplete, mismatched, duplicate or contradictory official game reports",()=>{
 assert.throws(()=>normalizeStatsReport({total:2,data:[]},opt),/truncated/);
 assert.throws(()=>normalizeStatsReport({total:1,data:[{playerId:22,gameId:2025020735,
  gameDate:"2026-01-14",blockedShots:1}]},opt),/identity/);
 assert.throws(()=>mergeOfficialGameStats([{gameId:1,gameDate:"2026-01-14",saves:30}],
  [{gameId:1,gameDate:"2026-01-14",market:"saves",value:24}]),/Conflicting/);
});
