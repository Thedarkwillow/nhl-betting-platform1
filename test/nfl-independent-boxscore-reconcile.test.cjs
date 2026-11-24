"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {derive,espnMetrics,reconcileGame,offerGames,asID}=require("../scripts/reconcile-nfl-espn-boxscore.cjs");
const game={season:2025,week:5,game_type:"REG",game_id:"2025_05_X_Y",espn:"401234567",home_team:"Y",away_team:"X",home_score:20,away_score:10};
const plays=[
 {game_id:game.game_id,play_id:1,play_type:"run",rush_attempt:1,rusher_player_id:"gsis-rb",rushing_yards:23},
 {game_id:game.game_id,play_id:2,play_type:"run",rush_attempt:1,rusher_player_id:"gsis-rb",rushing_yards:-3},
 {game_id:game.game_id,play_id:3,play_type:"pass",complete_pass:1,receiver_player_id:"gsis-wr",receiving_yards:17},
 {game_id:game.game_id,play_id:4,play_type:"punt",punt_attempt:1,punter_player_id:"gsis-p",punt_yards:49,punt_inside_twenty:1},
 {game_id:game.game_id,play_id:5,play_type:"punt",punt_attempt:1,punter_player_id:"gsis-p",punt_yards:52,punt_inside_twenty:0}
];
const rosters=["rb","wr","p"].map((k,i)=>({season:2025,week:5,team:"X",
 gsis_id:"gsis-"+k,espn_id:String(i+101)}));
const summary={header:{competitions:[{status:{type:{completed:true}}}]},boxscore:{players:[{
 team:{abbreviation:"X"},statistics:[
 {name:"rushing",labels:["CAR","YDS","AVG","TD","LONG"],athletes:[
   {athlete:{id:"101"},stats:["2","20","10","0","23"]}]},
 {name:"receiving",labels:["REC","YDS","AVG","TD","LONG"],athletes:[
   {athlete:{id:"102"},stats:["1","17","17","0","17"]}]},
 {name:"punting",labels:["NO","YDS","AVG","IN 20","LONG"],athletes:[
   {athlete:{id:"103"},stats:["2","101","50.5","1","52"]}]}
 ]}]}};
test("cross-check reconstructed play totals against independently mapped final ESPN box stats",()=>{
 const d=derive(plays);
 assert.equal(d.get("gsis-rb").longest_rush,23);
 assert.equal(d.get("gsis-rb").rushing_yards,20);
 assert.equal(d.get("gsis-p").punt_gross_yards,101);
 const rows=espnMetrics(summary);
 assert.equal(rows.length,3);
 const r=reconcileGame({game,specialty:plays,roster:rosters,summary});
 assert.equal(r.compared,10);
 assert.equal(r.matched,10);
 assert.equal(r.disagreed,0);
 assert.equal(r.missingRosterCrossId,0);
});
test("unexpected ESPN result is discrepancy, never silently relabeled official",()=>{
 const changed=JSON.parse(JSON.stringify(summary));
 changed.boxscore.players[0].statistics[2].athletes[0].stats[1]="102";
 const r=reconcileGame({game,specialty:plays,roster:rosters,summary:changed});
 assert.equal(r.matched,9);
 assert.equal(r.disagreed,1);
 assert.equal(r.mismatchTypes.punt_gross_yards,1);
});
test("unmatched ESPN athlete IDs and incomplete games do not receive validated score",()=>{
 const r=reconcileGame({game,specialty:plays,roster:[],summary});
 assert.equal(r.compared,0);
 assert.equal(r.missingRosterCrossId,3);
 assert.throws(()=>reconcileGame({game,specialty:plays,roster:rosters,
  summary:{...summary,header:{competitions:[{status:{type:{completed:false}}}]}}}),/did not confirm final/);
 assert.equal(asID("000100"),"100");
});
test("sampling excludes playoff, missing score, invalid ESPN and later weeks",()=>{
 const allowed=offerGames([game,{...game,game_type:"WC",game_id:"a"},
  {...game,week:12,game_id:"b"}, {...game,away_score:null,game_id:"c"},
  {...game,espn:null,game_id:"d"}],2025,3);
 assert.deepEqual(allowed.map(x=>x.game_id),[game.game_id]);
});
