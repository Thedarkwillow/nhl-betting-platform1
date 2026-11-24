"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {auditMorning,auditModels,officialSamples,auditLineups,auditScorecard,buildSixPriorityBrief}=
require("../src/nhl-six-priority-evidence-brief.cjs");
const at="2026-11-07T18:00:00Z";
const board={provider:"prizepicksapi.com",independentProvider:true,
sourceStatus:"fresh",completePagination:true,generatedAt:"2026-11-07T17:55:00Z"};
const morning={datePacific:"2026-11-07",six:{complete:true},nine:{complete:true},
validSameDayDelta:true};
test("only the same Pacific day has verified morning boards",()=>{
 const r=auditMorning({at,board,morningAudit:morning});
 assert.equal(r.sixAm,"archived_on_time");assert.equal(r.nineAm,"archived_on_time");
 assert.equal(r.sameDayDelta,"compared");
 assert.equal(r.cloudflareSchedulerExecutionVerified,false);
 const stale=auditMorning({at,board:{...board,generatedAt:"2026-11-06T20:00:00Z"},
 morningAudit:{...morning,datePacific:"2026-11-06"}});
 assert.equal(stale.nineAm,"not_verified");
 assert.equal(stale.freshIndependentBoardAtExport,false);
});
test("official final history counts keep fantasy-score flags and small samples distinct",()=>{
 const rows=Array.from({length:9},(_,i)=>({
 gameId:100+i,gameDate:"2026-10-"+String(10+i),hits:2,faceoffsWon:7,
 timeOnIceSeconds:1000,shotsOnGoal:3}));
 const history={players:{skater:{type:"skater",games:rows},
 goalie:{type:"goalie",games:rows.map(x=>({...x,saves:24,goalsAgainst:2,
 prizePicksGoalieFantasyScore:14.2}))}}};
 const s=officialSamples(history);
 assert.equal(s.hits.gameRows,9);
 assert.equal(s.faceoffsWon.playersWithEightPriorGames,1);
 assert.equal(s.prizePicksGoalieFantasyScore.gameRows,9);
 const r=auditModels({history,publicProps:[{market:"hits"}]});
 assert.equal(r.markets.find(x=>x.key==="hits").displayedResearchRows,1);
 assert.equal(r.markets.find(x=>x.key==="hits").automaticLineupEligible,false);
 assert.equal(r.goalieFantasyScoring.win,10);
 assert.equal(r.goalieFantasyScoring.saves,.3);
 assert.equal(r.goalieFantasyScoring.platformSettlementVerified,false);
});
test("precommitted decided/pending/push counts do not imply platform settlements",()=>{
 const cohort={cohortVerified:true,status:"verified_original_pregame_registry_aggregates",
 counts:{registered:24,correct:13,incorrect:8,push:1,pending:2},
 byMarket:[{group:"shotsOnGoal",decided:21,correct:13,push:1,pending:2,observedRate:.619}]};
 const x=auditScorecard({cohort});
 assert.equal(x.decided,21);assert.equal(x.push,1);assert.equal(x.pending,2);
 assert.ok(x.wilson95.lower<x.observedHitRate);
 assert.equal(x.verifiedPayoutEV,false);
 assert.equal(auditScorecard({cohort:{...cohort,counts:{...cohort.counts,registered:23}}}).decided,null);
});
test("2-6 lineup concentration and freshness are structural only",()=>{
 const pick=(player,team,matchup,capturedAt="2026-11-07T17:55:00Z")=>
 ({player,team,matchup,capturedAt,eventStartsAt:"2026-11-07T23:00:00Z"});
 const lineups={2:{picks:[pick("A","BOS","BOS-TOR"),pick("B","NYR","NYR-PHI")]},
 3:{picks:[pick("A","BOS","BOS-TOR"),pick("C","TOR","BOS-TOR"),
 pick("D","DAL","DAL-STL")]}};
 const r=auditLineups({lineups,at});
 assert.equal(r.crossLineupPlayersRepeated,1);
 assert.equal(r.bySize.find(x=>x.size===3).sameGameOverlap,true);
 assert.equal(r.verifiedPayoutEV,false);
 const old=auditLineups({lineups:{2:{picks:[pick("A","BOS","BOS-TOR","2026-11-06T17:00:00Z"),
 pick("B","NYR","NYR-PHI")]}},at});
 assert.equal(old.bySize[0].status,"stale_or_structurally_unverified");
});
test("brief exposes aggregates, never original provider rows or projected performance claims",()=>{
 const b=buildSixPriorityBrief({at,board,morningAudit:morning,
 movement:{previousAt:"2026-11-07T15:00:00Z",currentAt:"2026-11-07T17:00:00Z",
 changes:[{type:"new_offer",player:"RestrictedName"}]},
 publicProps:[],lineups:{}});
 assert.equal(b.movements.counts.new_offer,1);
 assert.equal(b.movements.platformRemovalConfirmed,false);
 assert.equal(b.scorecard.observedHitRate,null);
 assert.equal(b.verifiedReturnOnInvestment,false);
 assert.equal(JSON.stringify(b).includes("RestrictedName"),false);
 assert.equal(buildSixPriorityBrief({at}).operations.sixAm,"not_verified");
});


test("aggregate line movements remain complete even if last-detail list was capped",()=>{
 const r=buildSixPriorityBrief({at,
  movement:{previousAt:"2026-11-07T15:00:00Z",currentAt:"2026-11-07T17:00:00Z",
   changesTruncated:true,changes:[{type:"new_offer"}],
   summary:{newOffers:301,increased:22,decreased:17,
    tierChangesObserved:4,notSeenUnverified:81}}});
 assert.equal(r.movements.counts.new_offer,301);
 assert.equal(r.movements.counts.observed_tier_change,4);
 assert.equal(r.movements.counts.not_seen_unverified,81);
 assert.equal(r.movements.detailsTruncated,true);
 assert.equal(r.movements.platformRemovalConfirmed,false);
});
test("market MAE is only public after 30 official chronological holdout observations",()=>{
 const inputs={officialCoverage:{kind:"official_nhl_market_coverage_counts_v1",
  markets:{hits:{gameRows:200,playersWithEightPriorGames:12}}},
 walkforward:{kind:"nhl_official_priority_markets_walkforward_2026_27_v1",
 season:"2026-27",isActualPrizePicksQuotedLineBacktest:false,noModelPromoted:true,
 markets:{hits:{scoredPlayerGames:29,last5MeanAbsoluteError:1.5,
  last10MeanAbsoluteError:1.7,unit:"official_count"}}}};
 const sample=auditModels(inputs).markets.find(x=>x.key==="hits");
 assert.equal(sample.officialHoldoutEvaluations,29);
 assert.equal(sample.pastOnlyLast5MAE,null);
 inputs.walkforward.markets.hits.scoredPlayerGames=30;
 assert.equal(auditModels(inputs).markets.find(x=>x.key==="hits").pastOnlyLast5MAE,1.5);
 assert.equal(auditModels(inputs).markets.find(x=>x.key==="hits").automaticLineupEligible,false);
});


test("archived provider quota reports the unit, not fabricated live credits",()=>{
 const credits=auditMorning({at,board:{...board,quotaUnit:"credits",creditsRemaining:28}});
 assert.equal(credits.archivedQuotaUnit,"credits");
 assert.equal(credits.lastArchivedCreditsRemaining,28);
 assert.equal(credits.liveAccountCreditsVerified,false);
 const requests=auditMorning({at,board:{...board,quotaUnit:"requests",creditsRemaining:null}});
 assert.equal(requests.archivedQuotaUnit,"requests");
 assert.equal(requests.lastArchivedCreditsRemaining,null);
 const missing=auditMorning({at,board:{...board,quotaUnit:"credits",creditsRemaining:undefined}});
 assert.equal(missing.lastArchivedCreditsRemaining,null);
});


test("published baseline is an anonymized, source-reconciled Standard-only sample",()=>{
 const cohort={cohortVerified:true,status:"verified_original_pregame_registry_aggregates",
  counts:{registered:4,correct:2,incorrect:1,push:1,pending:0},byMarket:[]};
 const standard={observedSelected:3,decided:2,pushes:1,distinctGames:2,
  modelWins:1,alwaysHigherWins:2,alwaysLowerWins:0,lowerModelChoices:1,
  privateModelWeights:{key:"SENSITIVE_INTERNAL_VALUE"}};
 const report={kind:"nhl_frozen_same_threshold_baselines_v1",
  evidenceValid:true,status:"valid_original_git_precommitted_selection_cohort",
  historicalSameSelectedLines:{
   allFrozenSelections:{observedSelected:4,decided:3,modelWins:2,pushes:1,ungraded:0},
   standardDirectional:standard
  },someInternalStatistic:"INTERNAL_VALUE"};
 const got=auditScorecard({cohort,baselineChallenge:report});
 assert.equal(got.standardSameLineBenchmark.decided,2);
 assert.equal(got.standardSameLineBenchmark.modelObservedHitRate,.5);
 assert.equal(got.standardSameLineBenchmark.hypotheticalHigherObservedRate,1);
 assert.equal(got.standardSameLineBenchmark.modelMinusHypotheticalHigher,-.5);
 assert.equal(got.standardSameLineBenchmark.originalPlatformSideAvailabilityVerified,false);
 assert.equal(got.standardSameLineBenchmark.futureBenchmarkPolicyRegistered,false);
 assert.equal(JSON.stringify(got).includes("INTERNAL_VALUE"),false);
 assert.equal(JSON.stringify(got).includes("SENSITIVE_INTERNAL_VALUE"),false);
 assert.equal(auditScorecard({cohort,baselineChallenge:{
  ...report,historicalSameSelectedLines:{
   ...report.historicalSameSelectedLines,
   allFrozenSelections:{observedSelected:4,decided:3,modelWins:3,pushes:1,ungraded:0}
  }}}).standardSameLineBenchmark,null);
});


test("future-only frozen simple strategy benchmark publishes abstentions, not raw players",()=>{
 const cohort={cohortVerified:true,status:"verified_original_pregame_registry_aggregates",
  counts:{registered:14,correct:8,incorrect:5,push:1,pending:0},byMarket:[]};
 const s={pregameCoveredSelections:11,decidedOnCoveredLines:10,
  abstainedOnAllOriginalStandardSelections:3,distinctCompletedGames:5,
  challengerWins:7,modelWinsOnSameCoveredLines:6,
  playerId:8470000,internalNote:"SENSITIVE_FORECAST"};
 const report={kind:"nhl_first_git_frozen_standard_simple_challengers_v1",
  status:"original_committed_selection_benchmark_research_only",
  futureOnlyOriginalSnapshots:true,fullyFrozenFutureCohort:true,
  bettingEdgeEstablished:false,archivedStandardSelections:14,decided:13,
  pending:0,pushes:1,distinctGames:5,originalFrozenFutureStandardSelectionCount:14,
  strategyComparison:{last5:s,last10:s,consensus5And10MarginHalf:s}};
 const x=auditScorecard({cohort,simpleChallenger:report}).futureSimpleStrategyAudit;
 assert.equal(x.originalFrozenStandardSelections,14);
 assert.equal(x.byStrategy.last5.covered,11);
 assert.equal(x.byStrategy.last5.decided,10);
 assert.equal(x.byStrategy.last5.abstained,3);
 assert.equal(x.byStrategy.last5.challengerHitRate,.7);
 assert.equal(x.byStrategy.last5.modelHitRateOnSameLines,.6);
 assert.equal(x.originalBookSettlementVerified,false);
 assert.equal(JSON.stringify(x).includes("SENSITIVE_FORECAST"),false);
 assert.equal(JSON.stringify(x).includes("playerId"),false);
 const thin=auditScorecard({cohort,simpleChallenger:{...report,
  strategyComparison:{last5:{...s,distinctCompletedGames:3},
    last10:s,consensus5And10MarginHalf:s}}}).futureSimpleStrategyAudit;
 assert.equal(thin.byStrategy.last5.challengerHitRate,null);
 assert.equal(thin.byStrategy.last5.smallSampleWithheld,true);
 assert.equal(auditScorecard({cohort,simpleChallenger:{...report,
  fullyFrozenFutureCohort:false}}).futureSimpleStrategyAudit,null);
});
