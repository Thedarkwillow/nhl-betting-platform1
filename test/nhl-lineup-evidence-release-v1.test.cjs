"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {inspectLineup,audit}=require("../src/nhl-lineup-evidence-release-v1.cjs");
const picks=[
 {playerId:1,gameId:111,team:"NYR",matchup:"NYR vs BOS",market:"shotsOnGoal",tier:"Standard",probability:.64},
 {playerId:2,gameId:222,team:"DAL",matchup:"DAL vs VAN",market:"points",tier:"Standard",probability:.62}
];
test("2-pick Power cannot claim a fitted joint probability or verified EV",()=>{
 const v=inspectLineup({picks},"power",2);
 assert.equal(v.status,"unapproved_research_scenario");
 assert.equal(v.verifiedJointProbability,null);
 assert.equal(v.verifiedPayoutEV,null);
 assert.ok(v.referenceMarginalBounds);
 assert.equal(v.productionEligible,undefined);
});
test("Goblin mixed tier and same-game dependencies block reference payout claims",()=>{
 const mixed=picks.map((x,i)=>i?{...x,gameId:111,tier:"Goblin",matchup:"NYR vs BOS"}:x);
 const v=inspectLineup({picks:mixed},"power",2);
 assert.equal(v.referenceMarginalBounds,null);
 assert.ok(v.reasons.includes("same_game_dependency_present"));
 assert.ok(v.reasons.includes("mixed_or_special_tiers_require_exact_multiplier_quote"));
});
test("2-6 format readiness remains blocked, including nonpermitted flex 2",()=>{
 const s={generatedAt:"2026-11-20T16:00:00Z",
   privateFormatLineupResearch:{power:{"2":{picks}},flex:{}}};
 const a=audit(s);
 assert.equal(a.inspected,1);assert.equal(a.approvedOptimizedLineups,0);
 assert.equal(Object.keys(a.byFormat).length,9);
 assert.equal(inspectLineup({picks},"flex",2),null);
 assert.equal(a.providerCalls,0);
});
