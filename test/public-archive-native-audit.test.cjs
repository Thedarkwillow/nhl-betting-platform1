"use strict";
const test=require("node:test"),a=require("node:assert/strict"),{nflSummary,nhlSummary}=require("../scripts/public-archive-native-audit.cjs");
test("NFL archive summary exposes only aggregate counts, not identities",()=>{
 const x=nflSummary({sourceCounts:[{year:2026,weeklyRows:12,kickerGameRows:3,playerId:"private-fixture"}]},
  {counts:{sameWeekWithheld:true,inputRows:15,yearsScored:{2025:0,2026:7}}});
 a.equal(x.evaluated2026,7);a.equal(x.paidRequests,0);a.ok(!JSON.stringify(x).includes("private-fixture"));
 a.throws(()=>nflSummary({sourceCounts:[]},{counts:{sameWeekWithheld:false}}));
});
test("NHL public archive report preserves separate cohorts and rejects contradictory counts",()=>{
 const r={kind:"nhl_original_lines_separate_historical_and_forward_summary_v1",historicalReconstructionNotPregameFrozen:true,
 prospectiveModelPredictionsMustHaveBeenFrozenBeforeEvent:true,calibrated:false,modelPromoted:false,placedWagers:0,
 historical:{eligible:10,winNew:6,lossNew:4,privateRows:[{playerId:123}]},prospective:{eligible:2,winNew:1,lossNew:1}};
 const x=nhlSummary(r);a.equal(x.historical.hitRate,.6);a.equal(x.prospective.hitRate,.5);
 a.ok(!JSON.stringify(x).includes("playerId"));a.throws(()=>nhlSummary({...r,historical:{eligible:10,winNew:6,lossNew:0}}));
 a.throws(()=>nhlSummary({...r,modelPromoted:true}));
});
