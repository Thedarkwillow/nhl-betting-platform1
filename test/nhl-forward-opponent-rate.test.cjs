"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {priorContext,candidate,freeze,score}=require("../src/nhl-forward-opponent-rate.cjs");
const {POLICY}=require("../src/nhl-frozen-individual-props.cjs");
function fixture(){
 const players={};
 for(let n=1;n<=6;n++)for(let i=1;i<=36;i++){
  const game={gameDate:"2026-11-0"+n,gameId:2026020000+n,playerId:i,team:i<=18?"BOS":"FLA",type:"skater",gameState:"OFF",timeOnIceSeconds:900,shotsOnGoal:i<=18?3:2,goals:0};
  (players[i]??={games:[]}).games.push(game);
 }
 // Add an irrelevant future result, which must be excluded.
 players[1].games.push({...players[1].games[0],gameDate:"2026-11-14",gameId:2026020999,shotsOnGoal:100});
 return {players};
}
test("official rate context excludes the target date and checks full prior team boxscores",()=>{
 const h=fixture();const c=priorContext(h,"2026-11-14");
 assert.equal(c.byPlayer.get(1).length,6);
 assert.equal(c.team.BOS.shotsOnGoal.length,6);
 // 12 team-game observations are not enough for the predeclared league minimum.
 assert.equal(candidate({playerId:1,market:"shotsOnGoal",opponent:"FLA",line:2.5},c),null);
 for(let n=0;n<8;n++)c.league.shotsOnGoal.push(45);
 const p=candidate({playerId:1,market:"shotsOnGoal",opponent:"FLA",line:2.5},c);
 assert.ok(p.estimate>0&&p.estimate<5);
 assert.equal(p.modelPromoted,false);
});
test("no postgame reconstruction when original snapshot has no new frozen field",()=>{
 const r=score([{snapshot:{generatedAt:"2026-11-14T17:00:00Z"},firstCommittedAt:"2026-11-14T17:01:00Z",gitHistoryCount:1}],fixture(),"2026-11-14T16:00:00Z");
 assert.deepEqual(r.byTierAndMarket,{});
 const s={individualPropSelectionPolicy:POLICY,generatedAt:"2026-11-14T17:00:00Z",individualPropSelections:[],rankedProps:[]};
 assert.equal(freeze(s,fixture()).rows.length,0);
});
