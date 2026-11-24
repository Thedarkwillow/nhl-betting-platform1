"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freezeSelectedDirections,gradeFrozenSelectedLineups}=require("../src/nhl-frozen-selected-lineup-grader.cjs");
const start="2026-11-03T00:00:00Z",at="2026-11-02T20:00:00Z",commit="2026-11-02T20:00:03Z";
const games=[{id:2026020232,home:"BOS",away:"VGK",startTimeUTC:start},
 {id:2026020233,home:"FLA",away:"DET",startTimeUTC:start}];
const a={playerId:111,gameId:games[0].id,team:"BOS",opponent:"VGK",
 market:"shotsOnGoal",line:2.5,tier:"Standard",lean:"Higher",
 probability:.68,capturedAt:"2026-11-02T19:59:59Z",eventStartsAt:start,gameStartAt:start};
const b={playerId:222,gameId:games[1].id,team:"FLA",opponent:"DET",
 market:"points",line:.5,tier:"Standard",lean:"Lower",
 probability:.75,capturedAt:"2026-11-02T19:59:59Z",eventStartsAt:start,gameStartAt:start};
const reverse=p=>({...p,lean:p.lean==="Higher"?"Lower":"Higher",probability:1-p.probability});
const snap={generatedAt:at,rankedProps:[a,reverse(a),b,reverse(b)],
 lineups:{2:{status:"research_only",optimized:true,picks:[a,b]}}};
const frame={snapshot:snap,firstCommittedAt:commit,gitHistoryCount:1,path:"test-snapshot.json"};
const history={players:{
 "111":{games:[{gameId:a.gameId,playerId:111,gameDate:"2026-11-02",shotsOnGoal:4}]},
 "222":{games:[{gameId:b.gameId,playerId:222,gameDate:"2026-11-02",points:1}]}}};
test("only pregame selected lineup picks grade; mirrored Higher/Lower offers excluded",()=>{
 const r=gradeFrozenSelectedLineups([frame],games,history);
 assert.equal(r.selectedDistinctOriginalOffers,2);
 assert.equal(r.graded,2);assert.equal(r.decided,2);assert.equal(r.correct,1);
 assert.equal(r.observedSelectedDirectionHitRate,.5);
 assert.equal(r.rawOfferedSidesNotUsed,true);
 assert.equal(r.byGameDay["2026-11-02"].distinctGames,2);
 assert.equal(r.originalPlatformSettlementsVerified,false);
});
test("no lineup selections means no verified model hit rate even if two-sided quotes are archived",()=>{
 const r=gradeFrozenSelectedLineups([{...frame,snapshot:{...snap,lineups:{}}}],games,history);
 assert.equal(r.graded,0);assert.equal(r.observedSelectedDirectionHitRate,null);
});
test("poststart/uncommitted/revised source and unverified lineup membership fail closed",()=>{
 assert.equal(freezeSelectedDirections([{...frame,firstCommittedAt:"2026-11-03T00:01:00Z"}],games).picks.length,0);
 assert.equal(freezeSelectedDirections([{...frame,gitHistoryCount:2}],games).picks.length,0);
 const bad={...frame,snapshot:{...snap,lineups:{2:{...snap.lineups[2],picks:[a,{...b,line:5.5}]}}}};
 assert.equal(freezeSelectedDirections([bad],games).picks.length,0);
 const notOfficial=games.map(x=>({...x,startTimeUTC:"2026-11-03T01:00:00Z"}));
 assert.equal(freezeSelectedDirections([frame],notOfficial).picks.length,0);
});
test("first archived selected side remains unique if later revision reverses it",()=>{
 const later={...frame,path:"later.json",firstCommittedAt:"2026-11-02T21:00:00Z",
 snapshot:{...snap,generatedAt:"2026-11-02T20:59:00Z",lineups:{
  2:{...snap.lineups[2],picks:[reverse(a),b]}}}};
 const r=gradeFrozenSelectedLineups([later,frame],games,history);
 assert.equal(r.selectedDistinctOriginalOffers,2);
 assert.equal(r.laterReversedSelections,1);
 assert.equal(r.graded,2);
 assert.equal(r.correct,1);
});
test("ambiguous contradictory selected directions within the same freeze are quarantined",()=>{
 const bad={...frame,snapshot:{...snap,lineups:{
  2:snap.lineups[2],3:{status:"research_only",optimized:true,picks:[reverse(a),b,
   {...a,playerId:333,gameId:2026020232,team:"BOS",lean:"Lower"}]}}}};
 // Third player is not in frozen rankedProps; whole invalid 3-pick slate excluded.
 const r=gradeFrozenSelectedLineups([bad],games,history);
 assert.equal(r.selectedDistinctOriginalOffers,2);
 assert.equal(r.missingOrIneligibleLineups,1);
});
