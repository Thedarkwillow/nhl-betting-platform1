"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freeze,grade}=require("../src/nhl-standard-future-agreement-v1.cjs");
const p={gameId:1,playerId:8,market:"shotsOnGoal",line:1.5,tier:"Standard",
 lean:"Higher",probability:.71,capturedAt:"2026-11-20T15:58:00Z",
 gameStartAt:"2026-11-20T21:00:00Z"};
const adaptive={...p,originalSide:"Higher",predictions:{fixed:.67,learned:.70},
 availableSides:["Higher","Lower"],trainingGames:50,trainingDates:15,priorGames:29};
const snap=()=>({generatedAt:"2026-11-20T16:00:00Z",
 individualPropSelections:[p],standardAdaptiveResearchV2:{rows:[adaptive]}});
test("Freezes independent same-side Standard agreement without replacing champion",()=>{
 const q=freeze(snap());
 assert.equal(q.eligible,1);
 assert.equal(q.rows[0].status,"shadow_selected");
 assert.equal(q.rows[0].originalSide,"Higher");
 assert.equal(q.changesChampion,false);
 assert.equal(q.approved,false);
});
test("Predeclared weak or contrary learned directions abstain",()=>{
 const s=snap();s.standardAdaptiveResearchV2.rows[0]={...adaptive,predictions:{fixed:.67,learned:.48}};
 assert.equal(freeze(s).rows[0].status,"shadow_abstain");
});
test("Grades only genuinely future first-committed lines from official final",()=>{
 const s=snap();s.standardFutureAgreementV1=freeze(s);
 const frames=[{snapshot:s,firstCommittedAt:"2026-11-20T16:02:00Z",gitHistoryCount:1}];
 const h={players:{"8":{games:[{gameId:1,gameState:"FINAL",shotsOnGoal:3,timeOnIceSeconds:1000}]}}};
 const a=grade(frames,h,"2026-11-19T23:00:00Z");
 assert.equal(a.all.decided,1);assert.equal(a.all.hitRate,1);
 assert.equal(a.all.minimumSampleMet,false);assert.equal(a.modelApproved,false);
 assert.equal(grade(frames,h,"2026-11-21T00:00:00Z").all.decided,0);
});
