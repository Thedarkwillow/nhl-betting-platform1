"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{teamGoalParticipation}=require("../src/nhl-shot-point-opportunity-v1.cjs"),{teamVolume,passingAttempts,receiving}=require("../src/nfl-priority-volume-v1.cjs");
test("NHL point probability accounts for zero team goals and cannot exceed goal count",()=>{
 const a=Array(5).fill({goalsFor:0}),b=Array(5).fill({goalsAllowed:0});
 assert.equal(teamGoalParticipation(a,b,.7,.5),.005);
 assert.equal(teamGoalParticipation(a.slice(1),b,.7,.5),null);
 const own=Array(5).fill({goalsFor:1}),opp=Array(5).fill({goalsAllowed:1});
 assert.ok(Math.abs(teamGoalParticipation(own,opp,.4,.5)-.4)<1e-8);
 assert.equal(teamGoalParticipation(own,opp,.4,1.5),.005);
});
test("NFL team opportunity requires both attempt and carry reconciliation",()=>{
 const s=[{game_id:"g",game_type:"REG",season:2026,week:1,home_team:"A",away_team:"B",home_score:20,away_score:10}];
 const t=[{season:2026,week:1,team:"A",opponent_team:"B",attempts:30,carries:25,targets:27}];
 const p=[{season:2026,week:1,recent_team:"A",opponent_team:"B",player_id:"qb",attempts:30,carries:5},{season:2026,week:1,recent_team:"A",opponent_team:"B",player_id:"rb",attempts:0,carries:20}];
 assert.equal(teamVolume(p,t,s)[0].plays,55);
 assert.equal(teamVolume(p,[{...t[0],carries:24}],s).length,0);
 assert.equal(teamVolume(p,t,[...s,...s]).length,0);
});
test("QB volume uses only prior weeks, not actual current game script",()=>{
 const off=Array.from({length:6},(_,i)=>({gameId:"o"+i,y:2026,w:i+1,team:"A",opponent:"C",attempts:30,plays:60,passShare:.5}));
 const def=Array.from({length:6},(_,i)=>({gameId:"d"+i,y:2026,w:i+1,team:"D",opponent:"B",attempts:30,plays:60,passShare:.5}));
 const own=off.map(x=>({...x,value:30}));
 const v=passingAttempts(own,[...off,...def],"A","B",2026,7);
 assert.equal(v.projection,30);
 const f={...off[0],w:7,gameId:"future",attempts:90,plays:100,passShare:.9};
 assert.deepEqual(passingAttempts([...own,{...f,value:90}],[...off,...def,f],"A","B",2026,7),v);
 assert.equal(v.liveStartingQBVerified,false);
});
test("receiver efficiency requires a valid matched opponent sample",()=>{
 const own=Array.from({length:10},(_,i)=>({playerId:"x",gameId:"a"+i,y:2026,w:i+1,team:"A",opportunity:5,value:50}));
 const idx=new Map(own.map(x=>[JSON.stringify([x.y,x.w,x.team]),{targets:25}]));
 const history=Array.from({length:40},(_,i)=>({gameId:"h"+i,y:2026,w:Math.floor(i/4)+1,opponent:i<10?"B":"C",opportunity:5,value:50}));
 const r=receiving(own,idx,history,"A","B",2026,11);assert.equal(r.projection,50);assert.equal(r.liveRoutesVerified,false);
 assert.equal(receiving(own,idx,history,"A","D",2026,11),null);
});
