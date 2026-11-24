"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {ppRows,mergeHistory}=require("../src/nhl-specialist-history-recovery.cjs");
const day="2026-11-17",g={playerId:8480061,gameId:2026020417,
 gameDate:day,type:"skater",gameState:"FINAL",team:"TOR",
 timeOnIceSeconds:1200,shotsOnGoal:2,goals:0,assists:1,points:1};
test("reads exact official SH/PP seconds and merges into historical identity",()=>{
 const p=ppRows({total:1,data:[{playerId:g.playerId,gameId:g.gameId,
  timeOnIce:1200,ppTimeOnIce:145,shTimeOnIce:81}]},[g],day);
 a.equal(p.mismatch,0);a.equal(p.rows.length,1);
 a.equal(p.rows[0].shortHandedTimeOnIceSeconds,81);
 const result=mergeHistory({players:{[g.playerId]:{games:[g]}}},[],p.rows);
 const row=result.history.players[String(g.playerId)].games[0];
 a.equal(row.shortHandedTimeOnIceSeconds,81);
 a.equal(row.powerPlayTimeOnIceSeconds,145);
 a.equal(result.counts.shMatched,1);
 a.equal(result.counts.ppRejected,0);
});
test("does not fabricate shorthanded time when absent from original source",()=>{
 const p=ppRows({total:1,data:[{playerId:g.playerId,gameId:g.gameId,
  timeOnIce:1200,ppTimeOnIce:145}]},[g],day);
 a.equal(Object.hasOwn(p.rows[0],"shortHandedTimeOnIceSeconds"),false);
 const r=mergeHistory({players:{[g.playerId]:{games:[g]}}},[],p.rows);
 a.equal(r.counts.shUnavailable,1);
 a.equal(r.history.players[String(g.playerId)].games[0].shortHandedTimeOnIceSeconds,undefined);
});
test("rejects impossible strength totals and never merges inconsistent identity",()=>{
 const invalid=ppRows({total:1,data:[{playerId:g.playerId,gameId:g.gameId,
  timeOnIce:1200,ppTimeOnIce:1000,shTimeOnIce:400}]},[g],day);
 a.equal(invalid.mismatch,1);a.equal(invalid.rows.length,0);
 const pp=[{gameId:g.gameId,playerId:g.playerId,gameDate:day,
  timeOnIceSeconds:1200,powerPlayTimeOnIceSeconds:1100,
  shortHandedTimeOnIceSeconds:200}];
 const r=mergeHistory({players:{[g.playerId]:{games:[g]}}},[],pp);
 a.equal(r.counts.shRejected,1);
 a.equal(r.counts.ppRejected,1);
 a.equal(r.counts.shMatched,0);
 a.equal(r.history.players[String(g.playerId)].games[0].shortHandedTimeOnIceSeconds,undefined);
});

test("separate immutable SH archive joins only to the identical historical PP and skater game",()=>{
 const history={players:{[g.playerId]:{games:[g]}}};
 const pp=[{gameId:g.gameId,playerId:g.playerId,gameDate:day,
  timeOnIceSeconds:1200,powerPlayTimeOnIceSeconds:200}];
 const sh=[{gameId:g.gameId,playerId:g.playerId,gameDate:day,
  timeOnIceSeconds:1200,powerPlayTimeOnIceSeconds:200,
  shortHandedTimeOnIceSeconds:90}];
 const first=mergeHistory(history,[],pp);
 a.equal(first.history.players[String(g.playerId)].games[0].shortHandedTimeOnIceSeconds,undefined);
 const merged=mergeHistory(history,[],pp,sh);
 a.equal(merged.history.players[String(g.playerId)].games[0].shortHandedTimeOnIceSeconds,90);
 a.equal(merged.counts.shBackfillMatched,1);
 a.equal(merged.counts.shBackfillRejected,0);
 a.equal(pp[0].shortHandedTimeOnIceSeconds,undefined);
});
test("mismatched SH game and impossible strength duration cannot contaminate PP rows",()=>{
 const history={players:{[g.playerId]:{games:[g]}}},
 pp=[{gameId:g.gameId,playerId:g.playerId,gameDate:day,
  timeOnIceSeconds:1200,powerPlayTimeOnIceSeconds:500}],
 sh=[{gameId:g.gameId,playerId:g.playerId,gameDate:day,
  timeOnIceSeconds:1200,powerPlayTimeOnIceSeconds:500,
  shortHandedTimeOnIceSeconds:900},
  {gameId:2026020888,playerId:g.playerId,gameDate:day,
   timeOnIceSeconds:1200,powerPlayTimeOnIceSeconds:100,
   shortHandedTimeOnIceSeconds:80}];
 const r=mergeHistory(history,[],pp,sh);
 a.equal(r.counts.shBackfillMatched,0);
 a.equal(r.counts.shBackfillRejected,2);
 a.equal(r.history.players[String(g.playerId)].games[0].shortHandedTimeOnIceSeconds,undefined);
});
