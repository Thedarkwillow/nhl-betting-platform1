"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {auditNov2,auditDay}=require("../src/nhl-nov2-retrospective.cjs");
const id=2026020232;
const games=Array.from({length:8},(_,i)=>({
 gameId:i===7?id:2026020100+i,
 gameDate:i===7?"2026-11-02":"2026-10-"+String(i+20).padStart(2,"0"),
 playerId:111,shotsOnGoal:i===7?2:3
}));
const history={players:{"111":{games}}};
const selected={playerId:111,gameId:id,market:"shotsOnGoal",
 line:2.5,lean:"Higher",probability:.67,tier:"Standard",
 capturedAt:"2026-11-02T19:00:00Z",
 eventStartsAt:"2026-11-03T00:00:00Z",gameStartAt:"2026-11-03T00:00:00Z",
 predictionRecordedAt:"2026-11-02T19:01:00Z",
 snapshotArchivedAt:"2026-11-02T19:02:00Z"};
test("Nov 2 retrospective replays only source-prestart lines, never claims prospective picks",()=>{
 const d=auditNov2([selected],history,{legacyRetrospective:{decided:1},explicitProspective:{decided:0}});
 assert.equal(d.gameDate,"2026-11-02");
 assert.equal(d.oldModel.evaluatedDecisions,1);
 assert.equal(d.oldModel.correct,0);
 assert.equal(d.oldModel.alwaysLowerRate,1);
 assert.equal(d.oldModel.meanUncalibratedProbability,.67);
 assert.equal(d.alternativeModels.eligibleSameLineDecisions,1);
 assert.equal(d.alternativeModels.byModel["weighted-form-v1"].decisions,1);
 assert.equal(d.specificDirectionRulePrecommittedBeforeGames,false);
 assert.equal(d.prospectiveSelectionsCounted,0);
 assert.equal(d.alternativeModels.selectedWinner,null);
 assert.equal(d.alternativeModels.approvedForDeployment,false);
});
test("future official results never enter features of Nov 2 challenger",()=>{
 const d=auditNov2([selected],history);
 const contaminated=JSON.parse(JSON.stringify(history));
 contaminated.players["111"].games.push({gameId:id+999,gameDate:"2026-11-06",playerId:111,shotsOnGoal:80});
 const e=auditNov2([selected],contaminated);
 assert.deepEqual(d.alternativeModels.byModel,e.alternativeModels.byModel);
});
test("Nov 2 data without legitimate pregame Git evidence cannot be graded",()=>{
 const late={...selected,snapshotArchivedAt:"2026-11-03T01:00:00Z"};
 const r=auditNov2([late],history);
 assert.equal(r.oldModel.evaluatedDecisions,0);
 assert.equal(r.alternativeModels.eligibleSameLineDecisions,0);
});
test("differing official game dates cannot be substituted for original Nov 2 cohort",()=>{
 const r=auditNov2([{...selected,gameId:2026020002}],history);
 assert.equal(r.oldModel.evaluatedDecisions,0);
});

test("Nov 3 model audit uses same original pregame selection chronology, not Nov 3 stats in features",()=>{
 const nov3={...selected,gameId:id+1,capturedAt:"2026-11-03T18:00:00Z",
   eventStartsAt:"2026-11-04T00:00:00Z",gameStartAt:"2026-11-04T00:00:00Z",
   predictionRecordedAt:"2026-11-03T18:01:00Z",
   snapshotArchivedAt:"2026-11-03T18:02:00Z"};
 const h=JSON.parse(JSON.stringify(history));
 h.players["111"].games.push({gameId:id+1,gameDate:"2026-11-03",playerId:111,shotsOnGoal:4});
 const day2=auditDay([selected,nov3],h,null,"2026-11-02");
 const day3=auditDay([selected,nov3],h,null,"2026-11-03");
 assert.equal(day2.oldModel.evaluatedDecisions,1);
 assert.equal(day3.oldModel.evaluatedDecisions,1);
 assert.equal(day3.oldModel.correct,1);
 assert.equal(day3.alternativeModels.eligibleSameLineDecisions,1);
 assert.equal(day3.prospectiveSelectionsCounted,0);
 assert.equal(day3.alternativeModels.approvedForDeployment,false);
 const future=JSON.parse(JSON.stringify(h));
 future.players["111"].games.push({gameId:id+2,gameDate:"2026-11-08",playerId:111,shotsOnGoal:100});
 assert.deepEqual(day3.alternativeModels.byModel,
  auditDay([selected,nov3],future,null,"2026-11-03").alternativeModels.byModel);
});
