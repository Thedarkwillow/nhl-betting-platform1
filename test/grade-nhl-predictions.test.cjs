"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {gradePredictions}=require("../src/grade-nhl-predictions.cjs");
const history={players:{"42":{games:[{gameId:9,playerId:42,gameDate:"2026-11-01",shotsOnGoal:4}]}}};
const p={gameId:9,playerId:42,market:"shotsOnGoal",line:2.5,lean:"Higher",probability:.7,capturedAt:"2026-11-01T17:00:00Z",predictionRecordedAt:"2026-11-01T17:30:00Z",snapshotArchivedAt:"2026-11-01T18:00:00Z",gameStartAt:"2026-11-01T23:00:00Z"};
test("grades only predictions saved and committed before puck drop",()=>{
 const r=gradePredictions([p],history);
 assert.equal(r.summary.verifiedHitRate,1);
 assert.equal(r.graded[0].actual,4);
 assert.equal(r.graded[0].snapshotArchivedAt,p.snapshotArchivedAt);
});
test("rejects post-start and unidentifiable predictions",()=>{
 const r=gradePredictions([{...p,gameStartAt:"2026-11-01T16:00:00Z"},{...p,gameId:undefined}],history);
 assert.equal(r.graded.length,0);assert.equal(r.rejected.length,2);
});
test("raw prop capture before start is not sufficient archival proof",()=>{
 const r=gradePredictions([
  {...p,predictionRecordedAt:"2026-11-02T00:00:00Z",snapshotArchivedAt:"2026-11-02T00:01:00Z"},
  {...p,snapshotArchivedAt:"2026-11-02T00:00:00Z"},
  {...p,snapshotArchivedAt:undefined},
  {...p,predictionRecordedAt:"2026-11-01T16:00:00Z"}
 ],history);
 assert.equal(r.graded.length,0);
 assert.equal(r.rejected.length,4);
 assert.equal(r.summary.verifiedHitRate,null);
});

test("accepts Git's whole-second timestamp precision without allowing poststart saves",()=>{
 const {validArchiveChronology}=require("../src/grade-nhl-predictions.cjs");
 const observed=Date.parse("2026-11-01T22:28:23.992Z");
 const recorded=Date.parse("2026-11-01T22:28:24.123Z");
 const gitSecond=Date.parse("2026-11-01T22:28:24Z");
 const puck=Date.parse("2026-11-01T23:00:00Z");
 assert.equal(validArchiveChronology(observed,recorded,gitSecond,puck),true);
 assert.equal(validArchiveChronology(observed,recorded,gitSecond,gitSecond),false);
 assert.equal(validArchiveChronology(observed,recorded,gitSecond-2000,puck),false);
 const r=gradePredictions([{...p,playerId:42,gameId:9,
  capturedAt:"2026-11-01T22:28:23.992Z",
  predictionRecordedAt:"2026-11-01T22:28:24.123Z",
  snapshotArchivedAt:"2026-11-01T22:28:24Z",
  gameStartAt:"2026-11-01T23:00:00Z"}],history);
 assert.equal(r.graded.length,1);
});

test("finished-game absent player and absent stat never count as losses",()=>{
 const r=gradePredictions([
  {...p,playerId:99999},
  {...p,market:"saves"}
 ],history);
 assert.equal(r.graded.length,0);
 assert.deepEqual(r.pending,[{playerId:99999,gameId:9}]);
 assert.equal(r.rejected[0].reason,"missing_stat");
 assert.equal(r.summary.verifiedHitRate,null);
});
test("official stat push is not included in denominator or incorrectly marked wrong",()=>{
 const r=gradePredictions([{...p,line:4}],history);
 assert.equal(r.summary.graded,1);
 assert.equal(r.summary.pushes,1);
 assert.equal(r.summary.decisions,0);
 assert.equal(r.summary.verifiedHitRate,null);
 assert.equal(r.graded[0].correct,null);
});
