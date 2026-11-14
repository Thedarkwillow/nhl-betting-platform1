"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),
 {build,group,futureMarkets}=require("./publish-safe-pregame-scorecards.cjs");
const metric=(n=20,w=11,g=4)=>({observedSelected:n+3,
 ungraded:2,decided:n,pushes:1,modelWins:w,alwaysHigherWins:Math.min(n,9),
 alwaysLowerWins:n-Math.min(n,9),distinctGames:g});
const nhl={kind:"nhl_frozen_same_threshold_baselines_v1",evidenceValid:true,
 status:"valid_original_git_precommitted_selection_cohort",
 historicalSameSelectedLines:{allFrozenSelections:metric(20,11),
 standardDirectional:metric(20,11)},
 postPolicySameSelectedLines:{standardDirectional:metric(20,11),
 byStandardMarket:{shotsOnGoal:metric(20,11),points:metric(1,1,1)}},
 generatedAt:"2026-11-09T23:00:00Z"};
const nfl={kind:"nfl_private_pregame_evidence_separated_outcome_audit_v1",
 neverClaimNumericSideAsPreviouslyFrozenHigherLower:true,
 nflverseFinalStatsNotPlatformSettlement:true,
 generatedAt:"2026-11-09T23:05:00Z",
 explicitFrozenDirections:{kind:"nfl_original_git_precommitted_directional_research_grade_v1",
 registered:3,decided:1,correct:1,incorrect:0,pushes:0,pending:2,
 distinctFinalGames:1,alwaysHigherOnExactSameSelectedLines:1,
 alwaysLowerOnExactSameSelectedLines:0,platformPayoutSettlementsVerified:false},
 numeric:{kind:"nfl_original_pregame_numeric_forecasts_research_scoring_v1",
 registered:5,decided:2,pushes:1,pending:2,meanAbsoluteError:12.5,
 retrospectivelyDerivedSideNotOriginalFrozen:true,
 retrospectiveDerivedSideCorrect:2}};
const triple={kind:"nhl_standard_three_challengers_git_proven_separate_validation_v1",
 generatedAt:"2026-11-09T23:00:00Z",
 actualPrecommitted:{registered:3,gradedDecisions:1,pushes:0,pending:2}};
test("public NHL/NFL counts preserve exact retrospective vs precommitted evidence",()=>{
 const x=build(nhl,nfl,triple,{now:"2026-11-09T23:06:00Z"});
 assert.equal(x.nhl.standardOriginalSelections.decided,20);
 assert.equal(x.nhl.standardOriginalSelections.correct,11);
 assert.equal(x.nhl.postPolicyMarkets.find(v=>v.market==="points").modelRate,null);
 assert.equal(x.nfl.explicitlyFrozenDirections.correct,1);
 assert.equal(x.nfl.separateNumericForecasts.modelSelectedHigherLowerHitRate,null);
 assert.equal(x.nfl.separateNumericForecasts.retrospectiveDerivedDirectionCannotBeCountedAsFrozen,true);
 assert.equal(x.evidenceWarnings.payoutAdjustedEV,null);
 assert.equal(x.evidenceWarnings.privatePlayerNamesExposed,0);
 assert.equal(JSON.stringify(x).includes("retrospectiveDerivedSideCorrect"),false);
});
test("false source counts and platform terms fail closed",()=>{
 assert.throws(()=>group({...metric(),alwaysHigherWins:100}),/mismatch/);
 assert.throws(()=>build({...nhl,evidenceValid:false},nfl,triple),/scope/);
 assert.throws(()=>build(nhl,{...nfl,explicitFrozenDirections:{
  ...nfl.explicitFrozenDirections,registered:4}},triple),/inconsistent/);
 assert.throws(()=>build(nhl,{...nfl,numeric:{...nfl.numeric,
  retrospectivelyDerivedSideNotOriginalFrozen:false}},triple),/inconsistent/);
 assert.throws(()=>build(nhl,nfl,{...triple,actualPrecommitted:{
  ...triple.actualPrecommitted,registered:4}}),/inconsistent/);
});
test("the public market list includes all markets without tiny-market hit-rate selection",()=>{
 const markets=futureMarkets({shotsOnGoal:metric(),points:metric(1,1,1)});
 assert.equal(markets.length,2);
 assert.equal(markets[0].modelRate,null);
 assert.ok(markets[1].modelRate!==null);
 assert.equal(markets.every(x=>x.successNotEstablished),true);
});

test("only original first-Git NFL side-bias diagnostics with exact same graded counts may be public",()=>{
 const d={kind:"nfl_original_frozen_direction_diagnostic_v1",
   evidence:"original_first_git_only",sourceGradeAt:nfl.generatedAt,
   firstGitCommits:["2026-11-09T17:26:51Z"],
   originalDirectionsCanNeverBeRevised:true,
   officialPlatformSettlementsVerified:false,productionModelPromotionApproved:false,
   overall:{registered:3,decided:1,correct:1,incorrect:0,pushes:0,pending:2,
    higherChosen:1,higherCorrect:1,higherWrong:0,
    lowerChosen:0,lowerCorrect:0,lowerWrong:0,
    overForecast:1,underForecast:0,exactForecast:0,
    actualHigher:1,actualLower:0,distinctFinalGames:1}};
 const a=build(nhl,nfl,triple,{nflDirectionalDiagnostic:d});
 assert.equal(a.nfl.frozenHigherBiasAudit.higherWrong,0);
 assert.equal(a.nfl.frozenHigherBiasAudit.projectedAboveActual,1);
 assert.equal(a.nfl.frozenHigherBiasAudit.payoutEV,null);
 assert.equal(JSON.stringify(a).includes('"firstGitCommits"'),false);
 assert.throws(()=>build(nhl,nfl,triple,{nflDirectionalDiagnostic:{...d,
  overall:{...d.overall,higherWrong:1}}}),/mismatched/);
 assert.throws(()=>build(nhl,nfl,triple,{nflDirectionalDiagnostic:{...d,
  sourceGradeAt:"2026-11-10T12:00:00Z"}}),/mismatched/);
});


test("tier counts reconcile exactly and withhold unsafe field values",()=>{
 const {tierCounts}=require("./publish-safe-pregame-scorecards.cjs");
 const h={standardDirectional:metric(20,11),goblinHigherOnly:{...metric(10,9,4),higherModelChoices:10,lowerModelChoices:0},
  demonHigherOnly:{...metric(10,9,4),higherModelChoices:10,lowerModelChoices:0},
  allFrozenSelections:{observedSelected:49,ungraded:6,decided:40,pushes:3,modelWins:29,alwaysHigherWins:27,alwaysLowerWins:13,distinctGames:5}};
 const rows=tierCounts(h);assert.equal(rows.length,3);
 assert.equal(rows[1].correct,9);assert.equal(rows[1].modelObservedRate,.9);assert.equal(rows[1].originalCohortHigherOnly,true);
 assert.equal(rows[2].payoutAdjustedROI,null);
 assert.throws(()=>tierCounts({...h,demonHigherOnly:{...h.demonHigherOnly,modelWins:8}}),/reconcile/);
 assert.throws(()=>tierCounts({...h,goblinHigherOnly:{...h.goblinHigherOnly,lowerModelChoices:1}}),/scope/);
 assert.equal(tierCounts(nhl.historicalSameSelectedLines),null);
});
test("public renderer only shows validated all-tier aggregate rows",()=>{
 const {tierView}=require("../assets/model-scorecards.js");
 const row=(tier)=>({tier,frozenSelections:5,decided:3,correct:2,incorrect:1,push:0,pending:2,distinctGames:2,
  originalCohortHigherOnly:tier!=="Standard",platformSettlementVerified:false,payoutAdjustedROI:null});
 const rows=["Standard","Goblin","Demon"].map(row);
 assert.equal(tierView(rows)[1].rate,2/3);
 assert.deepEqual(tierView(rows.slice(1)),[]);
 assert.deepEqual(tierView([rows[0],{...rows[1],correct:3},rows[2]]),[]);
 assert.deepEqual(tierView([rows[0],{...rows[1],payoutAdjustedROI:.2},rows[2]]),[]);
});
