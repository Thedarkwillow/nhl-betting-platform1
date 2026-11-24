"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateNhlModelShadow}=require("../src/nhl-paired-market-model-audit.cjs");
function score(i){
 const winner=i%3?1:0,champion=.6,shadow=.61;
 return {gameId:2026020000+Math.floor(i/4),playerId:8000000+i,
  market:i%2?"shotsOnGoal":"goals",line:2.5,tier:i%2?"Standard":"Goblin",
  selectedSide:"Higher",actualHigher:winner,championHigher:champion,
  shadowHigher:shadow,statsOfficialNhlFinal:true,
  sourceObservedAt:"2026-11-02T23:00:00Z",
  githubSnapshotFirstCommitAt:"2026-11-02T23:05:00Z"};
}
test("paired Brier audit preserves game clustering, never promotes a better retrospective challenger",()=>{
 const scores=Array.from({length:64},(_,i)=>score(i));
 const first=validateNhlModelShadow({kind:"nhl_money_puck_dfo_prospective_shadow_scorecard",
  scoredAt:"2026-11-03T23:00:00Z",scoreRows:scores});
 assert.equal(first.acceptedRows,64);
 assert.equal(first.overall.distinctOfficialGames,16);
 assert.equal(first.overall.propSides,64);
 assert.equal(first.byMarket.goals.propSides,32);
 assert.ok(first.overall.gameCluster95);
 assert.equal(first.overall.gameCluster95.method,"deterministic_game_cluster_bootstrap_descriptive");
 assert.equal(first.overall.modelPromotionEligible,false);
 assert.equal(first.modelPromoted,false);
 const second=validateNhlModelShadow({kind:"nhl_money_puck_dfo_prospective_shadow_scorecard",scoreRows:scores});
 assert.deepEqual(first.overall,second.overall);
});
test("not enough independent games means no stable cluster interval",()=>{
 const r=validateNhlModelShadow({kind:"nhl_money_puck_dfo_prospective_shadow_scorecard",
  scoreRows:[score(0),score(1),score(2)]});
 assert.equal(r.overall.gameCluster95,null);
 assert.equal(r.overall.distinctOfficialGames,1);
});
test("strictly reject duplicated, future-published, ungraded or contradictory rows",()=>{
 const a=score(0),bad={...a,sourceObservedAt:"2026-11-03T23:59:00Z"};
 const x=validateNhlModelShadow({kind:"nhl_money_puck_dfo_prospective_shadow_scorecard",
  scoreRows:[a,a,bad,{...score(1),statsOfficialNhlFinal:false},
   {...score(2),actualHigher:.5}]});
 assert.equal(x.acceptedRows,1);
 assert.equal(x.excluded.duplicate_selected_offer_side,1);
 assert.equal(x.excluded.invalid_or_not_proven_prior_to_commit,3);
 assert.equal(x.profitabilityVerified,false);
 assert.equal(x.noFantasyPlatformPayoutsVerified,true);
});
