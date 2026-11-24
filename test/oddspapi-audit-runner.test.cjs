"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {augmentHistory}=require("../scripts/audit-oddspapi-nhl-history.cjs");
test("append separately confirmed official boxscore result only if absent",()=>{
 const h={players:{"1":{playerId:1,name:"A. Player",type:"skater",
  games:[{gameId:5,gameDate:"2025-10-10",shotsOnGoal:2}]} }};
 const game={gameId:6,players:[{playerId:1,name:"A. Player",gameId:6,gameDate:"2025-10-11",team:"BOS",type:"skater",shotsOnGoal:3}]};
 const augmented=augmentHistory(h,[game]);
 assert.equal(augmented.history.players["1"].games.length,2);
 assert.equal(h.players["1"].games.length,1);
 assert.equal(augmented.conflicts.length,0);
});
test("detect conflicting official game stats rather than silently overwriting",()=>{
 const h={players:{"1":{playerId:1,name:"A. Player",type:"skater",
  games:[{gameId:6,gameDate:"2025-10-11",shotsOnGoal:1}]} }};
 const r=augmentHistory(h,[{players:[{playerId:1,gameId:6,gameDate:"2025-10-11",name:"A. Player",shotsOnGoal:3}]}]);
 assert.equal(r.conflicts.length,1);
});
