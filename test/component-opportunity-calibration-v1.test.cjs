"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const d=require("../src/market-count-distribution-ablation-v1.cjs"),s=require("../src/nfl-target-share-workload-v1.cjs");
test("count models preserve integer pushes and valid probability mass",()=>{
 for(const line of [0,.5,1,1.5,3,3.5])for(const z of Object.values(d.candidates([0,0,1,1,2,2,3,5,7,8],2.5,line))){
  assert.ok(Math.abs(Object.values(z).reduce((a,b)=>a+b,0)-1)<1e-8);
  assert.ok(Object.values(z).every(v=>v>=0&&v<=1));
  if(line%1)assert.equal(z.push,0);
 }
 assert.deepEqual(d.mass(0,0),{higher:0,lower:0,push:1});
 assert.ok(d.mass(2,1).push>0);
});
test("NFL receiving share is derived from reconciled denominators, not routes",()=>{
 const prior=Array.from({length:10},()=>({opportunity:5,value:50,teamTargets:25}));
 const p=s.project(prior,Array(10).fill(30));
 assert.equal(p.projection,60);assert.equal(p.share,.2);assert.equal(p.liveRoutesVerified,false);
 assert.equal(s.project(prior.map(r=>({...r,teamTargets:4})),Array(10).fill(30)),null);
 const weekly=[{season:2026,week:1,recent_team:"A",opponent_team:"B",player_id:"x",targets:5}];
 const schedule=[{season:2026,week:1,game_id:"g",game_type:"REG",home_team:"A",away_team:"B",home_score:20,away_score:10}];
 const teams=[{season:2026,week:1,team:"A",opponent_team:"B",targets:5}];
 assert.equal(s.teamTargets(weekly,teams,schedule).size,1);
 assert.equal(s.teamTargets(weekly,[{...teams[0],targets:6}],schedule).size,0);
});
