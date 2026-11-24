"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {prepareDistributionSnapshot}=require("../src/nhl-distribution-snapshot.cjs");
const at="2026-11-02T17:00:00Z",event="2026-11-03T02:00:00Z";
const base={playerId:777,gameId:2026020300,eventStartsAt:event,gameStartAt:event,
 source:"PrizePicks",observedAt:"2026-11-02T16:58:00Z",
 capturedAt:"2026-11-02T16:59:00Z",projectionId:"offer001",
 line:2.5,projection:3.2,lean:"Higher",market:"shotsOnGoal",tier:"Standard",team:"BOS"};
const games=Array.from({length:9},(_,i)=>({gameId:2026020100+i,
 gameDate:"2026-10-"+String(i+1).padStart(2,"0"),shotsOnGoal:i%2?7:0}));
const h={players:{"777":{games}}};
test("candidate snapshot freezes same live quoted line and mean, without inventing approval/settlement",()=>{
 const report=prepareDistributionSnapshot({generatedAt:at,model:"weighted-form-v1",rankedProps:[base]},h);
 assert.equal(report.rows.length,1);
 assert.equal(report.rows[0].line,2.5);
 assert.equal(report.rows[0].selectedSide,"Higher");
 assert.equal(report.rows[0].championDistribution,"poisson-v0");
 assert.equal(report.rows[0].originalProjectionMean,3.2);
 assert.equal(report.rows[0].prospectiveEligibleUntilGitCommitProof,false);
 assert.equal(report.verifiedCommitBeforeGameStart,false);
 assert.equal(report.rows[0].originalTierPayoutVerified,false);
});
test("report rejects after-start quotes, late source observations and unresolved game IDs",()=>{
 const row=(p)=>prepareDistributionSnapshot({generatedAt:at,rankedProps:[{...base,...p}]},h);
 assert.equal(row({gameId:null}).rows.length,0);
 assert.equal(row({eventStartsAt:"2026-11-02T16:30:00Z"}).rows.length,0);
 assert.equal(row({observedAt:"2026-11-02T17:30:00Z"}).rows.length,0);
 assert.equal(row({capturedAt:"2026-11-02T16:00:00Z"}).rows.length,0);
});
test("history strictly before event date prevents postgame or same-date lookahead",()=>{
 const contaminated=JSON.parse(JSON.stringify(h));
 contaminated.players["777"].games.push({gameDate:"2026-11-03",gameId:2026020300,shotsOnGoal:10000});
 const a=prepareDistributionSnapshot({generatedAt:at,rankedProps:[base]},h);
 const b=prepareDistributionSnapshot({generatedAt:at,rankedProps:[base]},contaminated);
 assert.deepEqual(a.rows,b.rows);
});
test("needs eight earlier valid official games and dedupes exact repeated quote",()=>{
 const few={players:{"777":{games:games.slice(0,7)}}};
 const a=prepareDistributionSnapshot({generatedAt:at,rankedProps:[base]},few);
 assert.equal(a.rows.length,0);
 assert.equal(a.exclusions.insufficient_earlier_count_history,1);
 const b=prepareDistributionSnapshot({generatedAt:at,rankedProps:[base,base]},h);
 assert.equal(b.rows.length,1);
 assert.equal(b.exclusions.duplicate_exact_offer,1);
});

test("market-trained v3 is frozen on exactly the same line, player and pregame time",()=>{
 const model={model:"nhl-market-trained-v3-shadow",
  status:"research_shadow_not_deployed",trainingSeason:"2024-25",
  holdoutNotUsedForMethodSelection:true,
  trainingPolicyId:"nhl-2024-train-market-v3-"+("a".repeat(24)),
  builtAt:"2026-11-02T16:50:00Z",
  players:{"777":{projections:{shotsOnGoal:{
   ready:true,estimate:2.8,method:"prior-mean",
   lastHistoricalGameDate:"2026-10-09"}}}}};
 const report=prepareDistributionSnapshot(
  {generatedAt:at,model:"weighted-form-v1",rankedProps:[base]},h,model);
 assert.equal(report.rows.length,1);
 assert.equal(report.marketTrainedV3MatchedRows,1);
 assert.equal(report.marketTrainedV3ProductionDeployed,false);
 const candidate=report.rows[0].marketTrainedV3;
 assert.equal(candidate.model,"nhl-market-trained-v3-shadow");
 assert.equal(candidate.projectionMean,2.8);
 assert.equal(candidate.method,"prior-mean");
 assert.equal(candidate.higher,candidate.offeredSideProbability);
 assert.equal(candidate.lower,Number((1-candidate.higher).toFixed(5)));
 assert.equal(report.rows[0].line,2.5);
 assert.equal(report.rows[0].originalProjectionMean,3.2);
 assert.equal(report.rows[0].prospectiveEligibleUntilGitCommitProof,false);
});
test("v3 refuses post-capture model builds, game-day stats and untrained markets",()=>{
 const valid={model:"nhl-market-trained-v3-shadow",
  status:"research_shadow_not_deployed",trainingSeason:"2024-25",
  holdoutNotUsedForMethodSelection:true,
  trainingPolicyId:"nhl-2024-train-market-v3-"+("b".repeat(24)),
  builtAt:"2026-11-02T16:50:00Z",
  players:{"777":{projections:{shotsOnGoal:{
   ready:true,estimate:3,method:"prior-mean",
   lastHistoricalGameDate:"2026-10-09"}}}}};
 const render=model=>prepareDistributionSnapshot(
  {generatedAt:at,model:"weighted-form-v1",rankedProps:[base]},h,model);
 assert.equal(render({...valid,builtAt:"2026-11-02T17:30:00Z"}).marketTrainedV3MatchedRows,0);
 assert.equal(render({...valid,players:{"777":{projections:{shotsOnGoal:{
  ...valid.players["777"].projections.shotsOnGoal,
  lastHistoricalGameDate:"2026-11-03"}}}}}).rows[0].marketTrainedV3,null);
 assert.equal(render({...valid,players:{"777":{projections:{}}}}).rows[0].marketTrainedV3,null);
 assert.equal(render({...valid,trainingPolicyId:"fabricated"}).marketTrainedV3MatchedRows,0);
 assert.equal(render(null).rows[0].marketTrainedV3,null);
});
