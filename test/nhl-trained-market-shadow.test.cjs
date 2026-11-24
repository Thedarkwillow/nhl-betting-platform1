"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path");
const {selectTrainingPolicies,buildMarketTrainedShadow,compareHistoricalHoldout}=
 require("../src/nhl-trained-market-shadow.cjs");
const {projectPlayer}=require("../src/projections.cjs");
const report=JSON.parse(fs.readFileSync(path.join(__dirname,
 "../outputs/backtests/nhl-official-season-projection-lab-latest.json"),"utf8"));
function history(){
 const games=[];
 for(let i=0;i<8;i++)games.push({gameId:100+i,
  gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  shotsOnGoal:i+1,goals:i%3===0?1:0,assists:i%2,points:i%2,
  blockedShots:1,saves:null});
 // A final result from the target UTC day MUST NOT influence this snapshot.
 games.push({gameId:999,gameDate:"2026-11-07",
  shotsOnGoal:99,goals:9,assists:9,points:18,blockedShots:99});
 return {players:{"1":{playerId:1,name:"Example Player",team:"BOS",type:"skater",games},
  "2":{playerId:2,name:"Example Goalie",team:"NYR",type:"goalie",
   games:Array.from({length:10},(_,i)=>({gameId:300+i,
    gameDate:"2026-10-"+String(i+1).padStart(2,"0"),saves:20+i}))}}};
}
test("choose 2024-25 winner separately for each market; missing training abstains",()=>{
 const result=selectTrainingPolicies(report);
 assert.equal(result.policies.shotsOnGoal.method,"prior-mean");
 assert.equal(result.policies.assists.method,"prior-mean");
 assert.equal(result.policies.points.method,"prior-mean");
 assert.equal(result.policies.goals.method,"stable-blend");
 assert.equal(result.policies.blockedShots.method,null);
 assert.equal(result.policies.saves.method,null);
 assert.equal(result.policies.saves.status,"not_trainable_from_2024_sample");
 assert.equal(result.hyperparametersChosenUsingHoldout,false);
});
test("holdout outcomes cannot affect policy selection or its deterministic identity",()=>{
 const baseline=selectTrainingPolicies(report);
 const poisoned=structuredClone(report);
 for(const m of Object.values(poisoned.byMarket)){
  m.holdout={playerGames:99999,distinctGames:999,
   models:{"weighted-form-v1":{mae:0},"prior-mean":{mae:999},
    "stable-blend":{mae:999},"stable-shrink-v2":{mae:999}}};
  m.selectedHoldoutMae=0;m.measuredShadowImprovement=-999;
 }
 const policy=selectTrainingPolicies(poisoned);
 assert.deepEqual(policy,baseline);
});
test("future and same-day outcomes excluded; current weighted champion unchanged",()=>{
 const source=history(),shadow=buildMarketTrainedShadow(source,report,
  {asOf:"2026-11-07T08:00:00Z"});
 assert.equal(shadow.model,"nhl-market-trained-v3-shadow");
 assert.equal(shadow.status,"research_shadow_not_deployed");
 assert.equal(shadow.probabilityCalibrated,false);
 assert.equal(shadow.latestIncludedGameDateMustPrecede,"2026-11-07");
 const p=shadow.players["1"];
 assert.equal(p.projections.shotsOnGoal.estimate,4.5);
 assert.equal(p.projections.shotsOnGoal.observations,8);
 assert.equal(p.projections.blockedShots.estimate,null);
 assert.equal(p.projections.blockedShots.ready,false);
 assert.equal(p.gamesBeforeCutoff,8);
 assert.equal(shadow.players["2"].projections.saves.ready,false);
 assert.equal(shadow.readyPlayers,1);
 const champion=projectPlayer(source.players["1"]);
 assert.equal(champion.model,"weighted-form-v1");
 assert.ok(champion.projections.shotsOnGoal.estimate>4.5,
  "Original champion differs because it can see later rows in this test fixture; shadow cannot.");
 assert.equal(shadow.productionModelUnchanged,true);
});
test("insufficient player history abstains and offers no fabricated market forecasts",()=>{
 const a=history();
 a.players["1"].games=a.players["1"].games.slice(0,4);
 const s=buildMarketTrainedShadow(a,report,{asOf:"2026-11-07T08:00:00Z"});
 assert.equal(s.players["1"].projections.shotsOnGoal.ready,false);
 assert.equal(s.players["1"].projections.shotsOnGoal.estimate,null);
 assert.equal(s.players["1"].projections.shotsOnGoal.observations,4);
 assert.equal(s.players["1"].projections.goals.estimate,null);
});
test("only historical MAE comparisons; does not invent platform prop accuracy",()=>{
 const score=compareHistoricalHoldout(report);
 assert.equal(score.modelPromoted,false);
 assert.equal(score.publishedLineHitRate,null);
 assert.equal(score.verifiedPayoutAdjustedEV,null);
 assert.equal(score.trulyUntouchedProspectiveHoldout,false);
 assert.ok(score.marketsEvaluated>=4);
 assert.ok(score.byMarket.shotsOnGoal.championMinusChallengerMAE>0);
 assert.ok(score.byMarket.assists.championMinusChallengerMAE>0);
 assert.ok(score.byMarket.points.championMinusChallengerMAE>0);
 assert.equal(score.byMarket.saves.challengerMAE,null);
});
test("unverified or tampered training report cannot authorize a candidate",()=>{
 assert.throws(()=>selectTrainingPolicies({}),/Expected 2024-25/);
 const mutated=structuredClone(report);
 mutated.byMarket.shotsOnGoal.selectedOn2024Only="weighted-form-v1";
 assert.throws(()=>selectTrainingPolicies(mutated),/disagrees/);
});
