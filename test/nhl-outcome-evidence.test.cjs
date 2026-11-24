"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {evidenceForOfficialGrade,summarizeOutcomeEvidence}=
 require("../src/nhl-outcome-evidence.cjs");
const {gradePredictions}=require("../src/grade-nhl-predictions.cjs");
const played={gameId:2026020001,playerId:11,gameDate:"2026-11-02",
  shotsOnGoal:3,points:1};
const history={players:{"11":{games:[played]}}};
const snap={gameId:2026020001,playerId:11,market:"shotsOnGoal",line:2.5,
 lean:"Higher",tier:"Standard",probability:.61,
 capturedAt:"2026-11-02T16:00:00Z",gameStartAt:"2026-11-02T23:00:00Z",
 predictionRecordedAt:"2026-11-02T16:02:00Z",
 snapshotArchivedAt:"2026-11-02T16:04:00Z"};
test("official NHL final direction can be graded while both fantasy platform settlements remain unverified",()=>{
 const r=gradePredictions([snap],history);
 assert.equal(r.graded[0].officialNhlStatDirection.status,"official_stat_decided");
 assert.equal(r.graded[0].officialNhlStatDirection.direction,"Higher");
 assert.equal(r.graded[0].originalPrizePicksSettlement.status,"not_verified");
 assert.equal(r.graded[0].originalPrizePicksSettlement.payoutMultiplier,null);
 assert.equal(r.graded[0].originalUnderdogSettlement.status,"not_verified");
 assert.equal(r.outcomeEvidence.officialNhl.decided,1);
 assert.equal(r.outcomeEvidence.prizepicks.realizedReturn,null);
 assert.equal(r.outcomeEvidence.bettingReturnAndProfitVerified,false);
});
test("NHL stat push never implies a platform push/reboot rule",()=>{
 const r=gradePredictions([{...snap,line:3}],history);
 assert.equal(r.summary.decisions,0);
 assert.equal(r.outcomeEvidence.officialNhl.pushes,1);
 assert.equal(r.graded[0].officialNhlStatDirection.status,"official_stat_push");
 assert.equal(r.graded[0].originalPrizePicksSettlement.settledResult,null);
 assert.equal(r.graded[0].originalUnderdogSettlement.dnpRebootOrVoidVerified,false);
 assert.equal(r.outcomeEvidence.noDnpOrRebootRuleInferred,true);
});
test("missing official player or DNP remains unresolved rather than fabricated loss",()=>{
 const r=gradePredictions([{...snap,playerId:99}],history);
 assert.equal(r.graded.length,0);
 assert.equal(r.pending.length,1);
 assert.equal(r.outcomeEvidence.officialNhl.missingOrUnfinished,1);
 assert.equal(r.outcomeEvidence.prizepicks.authenticatedSettlements,0);
});
test("cannot forge official direction by changing result independent of true NHL stat",()=>{
 assert.throws(()=>evidenceForOfficialGrade({...snap,
  actual:3,result:"Lower"}),/inconsistent/);
 assert.throws(()=>evidenceForOfficialGrade({...snap,
  actual:NaN,result:"Higher"}),/Validated/);
});
test("cannot mislabel raw side evidence as prospective platform settlements",()=>{
 const s=summarizeOutcomeEvidence({graded:[{result:"Higher"},{result:"Push"}],pending:[]},
  {sourceCohort:"raw_offered_directions_not_predictions"});
 assert.equal(s.sourceCohort,"raw_offered_directions_not_predictions");
 assert.equal(s.officialNhl.decided,1);
 assert.equal(s.officialNhl.pushes,1);
 assert.equal(s.prizepicks.authenticatedSettlements,0);
});

test("standalone official stat evidence never infers pregame proof from a timestamp string alone",()=>{
 const valid=evidenceForOfficialGrade({...snap,actual:3,result:"Higher"});
 assert.equal(valid.officialNhlStatDirection.originalSourceLineFrozenBeforeGame,true);
 const late=evidenceForOfficialGrade({...snap,actual:3,result:"Higher",
  snapshotArchivedAt:"2026-11-03T01:00:00Z"});
 assert.equal(late.officialNhlStatDirection.originalSourceLineFrozenBeforeGame,false);
 const missing=evidenceForOfficialGrade({...snap,actual:3,result:"Higher",gameStartAt:null});
 assert.equal(missing.officialNhlStatDirection.originalSourceLineFrozenBeforeGame,false);
 assert.equal(late.originalPrizePicksSettlement.status,"not_verified");
 assert.equal(late.originalUnderdogSettlement.status,"not_verified");
});
test("grader rejects post-start frozen selection instead of scoring it as an official pick",()=>{
 const result=gradePredictions([{...snap,snapshotArchivedAt:"2026-11-03T01:00:00Z"}],history);
 assert.equal(result.graded.length,0);
 assert.equal(result.rejected[0].reason,"not_proven_pregame");
});
