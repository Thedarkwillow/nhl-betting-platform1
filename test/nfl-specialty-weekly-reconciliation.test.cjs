"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {verifyYear}=require("../scripts/reconcile-nfl-specialty-weekly.cjs");
const game="2025_03_X_Y";
const plays=[
 {season:2025,week:3,season_type:"REG",game_id:game,play_id:1,
  play_type:"run",rush_attempt:1,rusher_player_id:"rb",rushing_yards:12},
 {season:2025,week:3,season_type:"REG",game_id:game,play_id:2,
  play_type:"run",rush_attempt:1,rusher_player_id:"rb",rushing_yards:-2},
 {season:2025,week:3,season_type:"REG",game_id:game,play_id:3,
  play_type:"pass",complete_pass:1,receiver_player_id:"wr",receiving_yards:27}
];
const box=[
 {season:2025,season_type:"REG",game_id:game,player_id:"rb",carries:2,rushing_yards:10,receptions:0,receiving_yards:0},
 {season:2025,season_type:"REG",game_id:game,player_id:"wr",carries:0,rushing_yards:0,receptions:1,receiving_yards:27}
];
test("only observed rushing/receiving player events grade against full-game final weekly box scores",()=>{
 const r=verifyYear(2025,plays,box);
 assert.equal(r.playerMarketComparisons,4);
 assert.equal(r.byMarket.rushing_yards.matched,1);
 assert.equal(r.byMarket.rushing_attempts.matched,1);
 assert.equal(r.byMarket.receiving_yards.matched,1);
 assert.equal(r.byMarket.receptions.matched,1);
 assert.equal(r.nflOfficialGamebookIndependentlyReconciled,false);
});
test("discrepancy becomes an explicit audit, not a verified official grade",()=>{
 const copy=box.map(x=>({...x}));
 copy[1].receiving_yards=26;
 const r=verifyYear(2025,plays,copy);
 assert.equal(r.byMarket.receiving_yards.disagreed,1);
 assert.equal(r.examplesOfDiscrepancy.length,1);
 assert.equal(r.examplesOfDiscrepancy[0].weeklyFinalValue,26);
});
test("postseason and duplicate events cannot silently contaminate official stats",()=>{
 assert.throws(()=>verifyYear(2025,[...plays,{...plays[0],season_type:"POST"}],box),/Nonregular/);
 assert.throws(()=>verifyYear(2025,[...plays,plays[0]],box),/Duplicate NFL play/);
});
