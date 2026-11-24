"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{scoreHistory,features}=require("../src/nfl-qb-attempt-directional-v1.cjs");
test("QB attempt challenger cannot see current-week final scores or volume",()=>{
 const off=Array.from({length:12},(_,i)=>({gameId:"o"+i,y:2025,w:i+1,team:"A",opponent:"C",attempts:30,plays:60,passShare:.5}));
 const def=Array.from({length:12},(_,i)=>({gameId:"d"+i,y:2025,w:i+1,team:"D",opponent:"B",attempts:30,plays:60,passShare:.5}));
 const own=off.map(x=>({...x,value:30}));
 const scores=[...off.map(x=>({...x,margin:10})),...def.map(x=>({...x,team:"B",margin:-10}))];
 const a=features(own,[...off,...def],scores,"A","B",2025,13);
 assert.ok(a);assert.equal(a.variants.directTeam,30);assert.equal(a.variants.qbMedian,30);assert.ok(a.variants.scoreStrengthProxy<30);
 const future={...off[0],gameId:"future",w:13,attempts:99,plays:100,passShare:.99,value:99,margin:80};
 assert.deepEqual(features([...own,future],[...off,...def,future],[...scores,future],"A","B",2025,13),a);
 assert.equal(a.actualTargetGameScoreUsed,false);
});
test("score proxy rejects duplicate schedule IDs and unfinished games",()=>{
 const g={game_id:"g",game_type:"REG",season:2025,week:1,home_team:"A",away_team:"B",home_score:20,away_score:10};
 assert.equal(scoreHistory([g]).length,2);assert.equal(scoreHistory([g,g]).length,0);assert.equal(scoreHistory([{...g,away_score:null}]).length,0);
});
