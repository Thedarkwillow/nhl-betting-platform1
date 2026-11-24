"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalizeNhlLog,walkForwardLine,evaluateArchiveOutcomes}=require("../src/oddspapi-walkforward.cjs");
const mk=(i,shots=3)=>({gameId:2025020000+i,gameDate:"2025-10-"+String(i).padStart(2,"0"),shotsOnGoal:shots,goals:0,assists:0,points:0,blockedShots:0,saves:null});
const line={season:"2025-26",playerId:11,playerName:"Test Player",gameId:2025020007,
 market:"shotsOnGoal",line:2.5,actual:4,outcome:"Higher",sourceLastObservedAt:"2025-10-06T12:00:00Z",gameStartAt:"2025-10-07T00:00:00Z"};
test("official NHL log is parsed without inventing unsupported stats",()=>{
 const rows=normalizeNhlLog({gameLog:[{gameId:2025020001,gameDate:"2025-10-01",shots:2,goals:1,assists:0}]},"2025-26");
 assert.equal(rows[0].shotsOnGoal,2);assert.equal(rows[0].blockedShots,null);
 assert.equal(rows[0].season,"2025-26");
});
test("walk forward excludes game itself and any future games",()=>{
 const games=[...Array.from({length:6},(_,i)=>mk(i+1)),mk(7,4),mk(8,80)];
 const result=walkForwardLine(line,games);
 assert.equal(result.status,"evaluated");
 assert.equal(result.priorGames,6);
 assert.equal(result.modelChosenSide,"Higher");
 assert.equal(result.correct,true);
 assert.ok(result.pregameModelEstimate<5);
});
test("does not use later game result or mismatch as a correct decision",()=>{
 const games=[...Array.from({length:6},(_,i)=>mk(i+1)),mk(7,1)];
 assert.equal(walkForwardLine(line,games).status,"official_game_log_disagrees_with_boxscore");
 assert.equal(walkForwardLine(line,games.filter(x=>x.gameId!==line.gameId)).status,"missing_official_game_in_player_log");
});
test("seasons are separate and probability is not calibrated",()=>{
 const logs={"11":[...Array.from({length:6},(_,i)=>mk(i+1)),mk(7,4)]};
 const report=evaluateArchiveOutcomes({lines:[line]},logs);
 assert.equal(report.bySeason["2025-26"].modelEvaluable,1);
 assert.equal(report.bySeason["2026-27"].modelEvaluable,0);
 assert.equal(report.prospectiveVerified,false);
 assert.equal(report.expectedValue,null);
});
