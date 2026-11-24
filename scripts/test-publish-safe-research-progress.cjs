"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {build}=require("./publish-safe-research-progress.cjs");
const {model}=require("../assets/roadmap-evidence-desk.js");
const now="2026-11-15T13:30:00Z";
const source={kind:"private_source_completion_readiness_v1",generatedAt:"2026-11-15T13:00:00Z",modelPromoted:false,wagersPlaced:0,periodCoverage:{accountedDays:60,pendingDays:201,calendarDays:261},prospective:{nhl:{firstObserved:1873,matchedCalibrationRows:0}},odds:{strictPlatformMatches:0,archivedConditionalMatches:12,rows:[{player:"Private test player",price:-120}]},paper:{authenticatedSettledEntries:0},lineupSlateEvidence:{NHL:{distinctSlatesAcrossFormats:1}},confidential:"INTERNAL_TEST"};
test("strict public aggregate allowlist and unknown inputs",()=>{
 const d=build(source,{now});assert.equal(d.periodHistory.accountedDays,60);assert.equal(d.evidence.nfl.firstObserved,null);assert.equal(d.sportsbook.strictMatched,0);assert.equal(d.proprietaryRowsPublished,0);assert.equal(d.paper.verifiedROI,null);
 assert.ok(!JSON.stringify(d).includes("Private test player"));assert.ok(!JSON.stringify(d).includes("INTERNAL_TEST"));
 assert.equal(build({...source,modelPromoted:true},{now}),null);
 assert.equal(build({...source,generatedAt:"2026-11-16T00:00:00Z"},{now}),null);
});
test("display explicit aged evidence without live claims",()=>{
 const d=build(source,{now}),v=model({progress:d},Date.parse(now));
 assert.equal(v.rows.find(r=>r.label==="NHL historical periods").value,"60 / 261 dates accounted; 201 pending");
 assert.match(v.rows.find(r=>r.label==="Sportsbook benchmark evidence").value,/live availability unverified/);
 assert.equal(model({progress:{...d,calibrationApproved:true}},Date.parse(now)).rows.some(x=>x.label==="NHL historical periods"),false);
});

test("only pre-existing verified frozen trial sample counts reach public research progress",()=>{
 const v={sourceReportAt:"2026-11-15T12:40:00Z",
  nhlStandardFrozenDecisions:575,nhlStandardFrozenGames:51,
  nhlStandardFrozenPacificSlates:9,matchedFrozenCalibrationDecisions:40,
  independentlySupportedCalibrationGroups:0,nflFirstDistinctThresholdDecisions:1289,
  nflFirstDistinctThresholdGames:14,powerFlexRegisteredReferenceEntries:13,
  powerFlexResolvedReferenceEntries:4,powerFlexUniqueUnderlyingResolvedSlates:3,
  modelPromoted:false,originalPlatformSettlementVerified:false,
  actualPayoutEVVerified:false,playerName:"PRIVATE DO NOT PUBLISH"};
 const d=build({...source,validationSample:v},{now});
 assert.equal(d.validationSample.nhlStandardFrozenPacificSlates,9);
 assert.equal(d.validationSample.powerFlexResolvedReferenceEntries,4);
 assert.equal(d.validationSample.probabilitiesCalibrated,false);
 assert.ok(!JSON.stringify(d).includes("PRIVATE DO NOT PUBLISH"));
 const view=model({progress:d},Date.parse(now));
 assert.match(view.rows.find(r=>r.label==="NHL Standard prospective sample").value,/9 Pacific slates/);
 assert.match(view.rows.find(r=>r.label==="Frozen calibration trials").value,/40 genuine frozen trials/);
 assert.match(view.rows.find(r=>r.label==="Power\/Flex 2–6 paper scenarios").value,/4 resolved \/ 13 registered/);
 assert.equal(build({...source,validationSample:{...v,modelPromoted:true}},{now}).validationSample,null);
 assert.equal(build({...source,validationSample:{...v,sourceReportAt:"2026-11-16T00:00:00Z"}},{now}).validationSample,null);
});


test("selective future-only trials remain separate from older frozen validation",()=>{
 const at="2026-11-18T04:00:00Z";
 const nhl={kind:"private_shot_point_opportunity_research_v1",generatedAt:"2026-11-18T03:34:48Z",
  selectiveFuture:{kind:"nhl_standard_opportunity_concordance_future_shadow_20261117_v1",
   policyFirstCommittedAt:"2026-11-18T02:46:47Z",registered:5,eligible:3,abstained:2,
   pending:2,decided:1,precommittedPolicy:true,
   comparedOnlyOnOriginalSelectedThresholds:true,noPosthocMarketFiltering:true,
   modelPromoted:false,calibrationApproved:false,lineupsApproved:false,
   originalPlatformSettlementVerified:false,playerName:"SECRET NHL PLAYER"}};
 const nfl={kind:"nfl_directional_v2_original_first_git_future_holdout_v1",
  generatedAt:"2026-11-18T03:31:00Z",selectiveFuture:{
   kind:"nfl_market_usage_margin_future_shadow_20261117_v1",
   firstFrozenOnly:true,sampleIsSubsetOfV2OriginalDirections:true,
   productionApproved:false,calibratedProbabilitiesApproved:false,
   authenticOppositeOffersVerified:false,
   onePerPlayerMarket:{included:2,decided:1,pending:1,distinctGames:1,
    distinctGameDates:1,modelPromoted:false,minimumEvidenceMet:false,
    calibratedProbability:null,playerId:"SECRET NFL ID"}}};
 const d=build(source,{now:at,nhlSelective:nhl,nflSelective:nfl});
 assert.equal(d.selectiveAccuracy.nhl.decided,1);
 assert.equal(d.selectiveAccuracy.nfl.pending,1);
 assert.equal(d.selectiveAccuracy.calibrationApproved,false);
 assert.equal(d.validationSample,null);
 assert.ok(!JSON.stringify(d).includes("SECRET NHL PLAYER"));
 assert.ok(!JSON.stringify(d).includes("SECRET NFL ID"));
 assert.equal(build(source,{now:at,nhlSelective:{...nhl,selectiveFuture:{
  ...nhl.selectiveFuture,precommittedPolicy:false}},nflSelective:nfl}).selectiveAccuracy,null);
 assert.equal(build(source,{now:at,nhlSelective:nhl,nflSelective:{...nfl,
  selectiveFuture:{...nfl.selectiveFuture,onePerPlayerMarket:{
   ...nfl.selectiveFuture.onePerPlayerMarket,included:0}}}}).selectiveAccuracy,null);
 assert.equal(build(source,{now:at,nhlSelective:nhl,nflSelective:{
  ...nfl,generatedAt:"2026-11-18T06:00:00Z"}}).selectiveAccuracy,null);
});


test("strict archived sportsbook match-funnel publishes counts, never provider identities",()=>{
 const f={kind:"private_sportsbook_match_stage_counts_v1",
  archives:4,newPaidRequests:0,modelPromoted:false,
  sharedPlayerIdVerified:false,authenticatedClosingLine:false,
  bySport:{NHL:{native:3,no_event:2,no_exact_name:0,no_market:0,
   no_same_threshold:1,no_preexisting_frame:0,ambiguous_identity:0,
   conditional_match:0},NFL:{native:2,no_event:0,no_exact_name:1,
   no_market:0,no_same_threshold:0,no_preexisting_frame:0,
   ambiguous_identity:0,conditional_match:1}},
  captureSkewBuckets:{within10m:0,within30m:1,within2h:0,within8h:0,
   noExactThreshold:4},
  bookmaker:"PRIVATE BOOK",playerId:"PRIVATE ID",prices:[-110]};
 const d=build({...source,odds:{...source.odds,matchFunnel:f}},{now});
 assert.equal(d.sportsbook.matchFunnel.bySport.NHL.no_event,2);
 assert.equal(d.sportsbook.matchFunnel.bySport.NFL.conditional_match,1);
 assert.equal(d.sportsbook.matchFunnel.exactPlatformIdentityVerified,false);
 assert.equal(d.sportsbook.verifiedLiveConsensus,false);
 assert.ok(!JSON.stringify(d).includes("PRIVATE BOOK"));
 assert.ok(!JSON.stringify(d).includes("PRIVATE ID"));
 assert.equal(build({...source,odds:{...source.odds,matchFunnel:{
  ...f,bySport:{...f.bySport,NHL:{...f.bySport.NHL,native:4}}
 }}},{now}).sportsbook.matchFunnel,null);
 assert.equal(build({...source,odds:{...source.odds,matchFunnel:{
  ...f,sharedPlayerIdVerified:true
 }}},{now}).sportsbook.matchFunnel,null);
});


test("new model research ships only safe zero-event counts, never raw private data",()=>{
 const r={kind:"cross_sport_opportunity_and_data_integrity_research_checkpoint_v1",
  generatedAt:"2026-11-15T12:50:00Z",
  nhl:{syntheticHoldoutOnly:true,fullRosterAuditAvailable:true,
   officialCompleteGames:123,zeroShotAppearancesRetained:24,
   missingShotRows:0,fullRosterAuditPass:true,
   markets:{shotsOnGoal:{predicted:80},blockedShots:{predicted:75}},
   playerName:"SECRET PLAYER"},
  nfl:{verifiedLiveRoutesOrWOPR:false,priorWeekUsageReplayAvailable:true,
   kickerRoleEvidenceAvailable:false},
  nba:{verifiedPregameFeeds:false,minutesProductionContractImplemented:true},
  esports:{verifiedPregameFeeds:false,cs2RoundsKillsContractImplemented:true,
   valorantRoundsKillsContractImplemented:true,
   lolTeamKillShareContractImplemented:true},
  validation:{independentProspectiveOutperformanceProven:false,
   platformQuoteAndSettlementVerified:false},
  internalPricesPublished:0,modelPromoted:false,
  calibratedProbabilityApproved:false,optimizedLineupsApproved:false,
  authenticatedReturnOnInvestment:null,providerRequests:0,wagersPlaced:0,
  bookmaker:"SECRET BOOK",line:1.5};
 const a=build(source,{now,modelIdeas:r});
 assert.equal(a.modelIdeas.nhl.completeOfficialGames,123);
 assert.equal(a.modelIdeas.nhl.zeroShotAppearancesRetained,24);
 assert.equal(a.modelIdeas.nhl.realPlatformLinesEvaluated,false);
 assert.equal(a.modelIdeas.modelPromoted,false);
 assert.ok(!JSON.stringify(a).includes("SECRET PLAYER"));
 assert.ok(!JSON.stringify(a).includes("SECRET BOOK"));
 assert.equal(build(source,{now,modelIdeas:{...r,modelPromoted:true}}).modelIdeas,null);
 assert.equal(build(source,{now,modelIdeas:{...r,generatedAt:"2026-11-16T00:00:00Z"}}).modelIdeas,null);
 const display=model({progress:{...a,sourceReportAt:"2026-11-15T13:00:00Z"}},
  Date.parse(now)).rows;
 assert.match(display.find(x=>x.label==="NHL official zero-shot data audit").value,/24 verified zero-shot appearances/);
 assert.match(display.find(x=>x.label==="NHL two-stage model research").value,/NOT app-line hit rate/);
});


test("Goblin private status is reduced to approved public counts and never leaks player ids or payouts",()=>{
 const date="2026-11-15T12:50:00Z",r={
  kind:"private_goblin_forward_evidence_v1",generatedAt:date,
  researchOnly:true,modelPromoted:false,calibratedProbabilityApproved:false,
  actualWagersPlaced:0,providerRequests:0,
  NHL:{currentSourceEligibleForNewPolicy:true,originalGoblinOffersExamined:62,
   newResearchCandidates:3,newAbstentions:59,archivedFirstGitRecords:3,
   quarantinedDuplicateFirstGitRows:108,selectivePolicySourceEligible:false,
   secretPlayer:"PROPRIETARY GOBLIN NAME"},
  NFL:{historicalOpportunityContractImplemented:true,
   prospectiveOfficialInjuryAndIdentityVerified:false,newEligibleFirstGitRecords:0,
   auditedOriginalGoblinOffers:22,identityReadyForNextModelStage:0,
   eligibilityReasonCounts:{official_game_crosswalk_unverified:22}},
  comparison:{kind:"future_only_goblin_original_line_comparison_v1",
   registered:3,decided:0,verifiedOutperformance:false},
  calibration:{independentFutureApproval:false},lineups:{
   approvedLineups:0,exactGoblinEntryMultipliersCaptured:false,
   secretPayout:99}};
 const output=build(source,{now,goblin:r});
 assert.equal(output.goblinFuture.nhl.examined,62);
 assert.equal(output.goblinFuture.nhl.newAbstentions,59);
 assert.equal(output.goblinFuture.nhl.futureDecided,0);
 assert.equal(output.goblinFuture.nhl.duplicatesQuarantined,108);
 assert.equal(output.goblinFuture.nhl.selectivePolicyRequiresNewSource,true);
 assert.equal(output.goblinFuture.nfl.originalGoblinOffersAudited,22);
 assert.equal(output.goblinFuture.nfl.officialGameBridgeMissing,22);
 assert.equal(output.goblinFuture.nfl.exactIdentityReadyForModel,0);
 assert.equal(output.goblinFuture.lineup.verifiedQuoteEV,null);
 assert.equal(output.goblinFuture.lineup.approvedSlips,0);
 assert.equal(output.goblinFuture.modelPromoted,false);
 assert.ok(!JSON.stringify(output).includes("PROPRIETARY GOBLIN NAME"));
 assert.ok(!JSON.stringify(output).includes("secretPayout"));
 assert.equal(build(source,{now,goblin:{...r,modelPromoted:true}}).goblinFuture,null);
 assert.equal(build(source,{now,goblin:{...r,lineups:{
  approvedLineups:1,exactGoblinEntryMultipliersCaptured:false}}}).goblinFuture,null);
});

test("private opponent team-level details never leak; only eight-game verified market coverage appears",()=>{
 const e={kind:"nhl_historical_opponent_concession_coverage_v1",
  generatedAt:"2026-11-15T13:10:00Z",source:"NHL official complete final-game archives",
  verifiedConcessionArchiveGames:34,verifiedAttemptArchiveGames:65,
  asOfHistoricalOnly:true,researchOnly:true,
  sourceFirstGitBeforeAnyFutureFreezeStillRequired:true,
  historicalSourceDataCannotRequalifyOlderSelections:true,
  opponentOpportunityAloneNeverProvesPlayerProjection:true,
  allMarketProbabilitiesUncalibrated:true,
  originalPlatformOfferAuthenticated:false,approvedHighConfidencePicks:0,
  approvedLineups:0,bettingEligible:false,paidProviderRequests:0,
  byMarket:Object.fromEntries(["shotsOnGoal","blockedShots","points","assists"]
   .map((k,i)=>[k,{teamsEvaluated:32,minimumRequiredGames:8,
    teamsAtEightSourceVerified:i<2?2:1,teamsWithFourOrMorePriorGames:4,
    maxVerifiedPriorGames:8}])),
  byOpponent:{CAR:{name:"SECRET PLAYER",line:3.5,opponent:"SECRET GAME"}}};
 const d=build(source,{now,nhlOpponentCoverage:e});
 assert.equal(d.nhlOpponentEvidence.kind,"public_nhl_official_opponent_coverage_counts_v1");
 assert.equal(d.nhlOpponentEvidence.byMarket.shotsOnGoal.teamsVerified,2);
 assert.equal(d.nhlOpponentEvidence.originalPlatformOffersVerified,false);
 assert.equal(d.nhlOpponentEvidence.approvedPicks,0);
 assert.ok(!JSON.stringify(d).includes("SECRET PLAYER"));
 assert.ok(!JSON.stringify(d).includes("SECRET GAME"));
 assert.ok(!JSON.stringify(d).includes("CAR"));
 assert.ok(!JSON.stringify(d).includes("3.5"));
 const rows=model({progress:d},Date.parse(now)).rows;
 assert.match(rows.find(r=>r.label==="NHL verified opponent source coverage").value,
   /shots 2\/32 .* blocks 2\/32 .* points 1\/32 .* assists 1\/32/);
 for(const corrupt of [
  {...e,bettingEligible:true},
  {...e,originalPlatformOfferAuthenticated:true},
  {...e,approvedHighConfidencePicks:1},
  {...e,byMarket:{...e.byMarket,shotsOnGoal:{...e.byMarket.shotsOnGoal,teamsAtEightSourceVerified:33}}},
  {...e,generatedAt:"2026-11-16T00:00:00Z"}
 ]){
  const bad=build(source,{now,nhlOpponentCoverage:corrupt});
  assert.equal(bad.nhlOpponentEvidence,null);
  assert.equal(model({progress:bad},Date.parse(now)).rows.some(r=>
   r.label==="NHL verified opponent source coverage"),false);
 }
});

test("matchup evidence publisher exposes counts only and rejects rank leakage",()=>{
 const {safeMatchupCoverage}=require("./publish-safe-research-progress.cjs");
 const raw={kind:"cross_sport_position_h2h_paired_replay_v1",generatedAt:now,modelPromoted:false,prospectiveAccuracyVerified:false,nhl:{syntheticThresholdsOnly:true},nfl:{exactOriginalLines:false},nflPositionalRankings:{tables:{a:{complete:false,rows:[{team:"A",rankMostAllowed:null,playerId:"hidden"}]}}},nflSpecialistCoverage:{teamGames:10,reconciledPuntTeamGames:9,reconciledKickTeamGames:10,punterAppearances:5,kickerAppearances:7,playerName:"hidden"}};
 const safe=safeMatchupCoverage(raw,now);assert.equal(safe.completeRankingTables,0);assert.equal(safe.punterAppearances,5);assert.equal(JSON.stringify(safe).includes("hidden"),false);
 raw.nflPositionalRankings.tables.a.rows[0].rankMostAllowed=1;assert.equal(safeMatchupCoverage(raw,now),null);
});

require("node:test")("expanded ML public export is count-only and rejects promoted model",()=>{const assert=require("node:assert/strict"),{safeExpandedML}=require("./publish-safe-research-progress.cjs"),now="2026-11-25T00:00:00Z",d={kind:"priority_common_features_logistic_v1",researchOnly:true,modelPromoted:false,generatedAt:now,models:{nhl_points:{".5":{secret:"private"}}},historicalSyntheticHoldout:{nhl_points:{".5":{n:100,hitRate:.7,brier:.2,baselineHitRate:.6,alwaysHigher:.5,alwaysLower:.5}}}};const x=safeExpandedML(d,null,null,now);assert.equal(x.trainedMarkets,1);assert.equal(x.thresholdsBeatingAllBaselines,1);assert.equal(JSON.stringify(x).includes("private\""),false);assert.equal(safeExpandedML({...d,modelPromoted:true},null,null,now),null);});

require("node:test")("sportsbook public diagnostics disclose counts, never quote records",()=>{const assert=require("node:assert/strict"),{safeExpandedML}=require("./publish-safe-research-progress.cjs"),now="2026-11-25T00:00:00Z",d={kind:"priority_common_features_logistic_v1",researchOnly:true,modelPromoted:false,generatedAt:now,models:{nhl_points:{".5":{}}},historicalSyntheticHoldout:{nhl_points:{".5":{n:100,hitRate:.7,brier:.2,baselineHitRate:.6,alwaysHigher:.5,alwaysLower:.5}}}},f={kind:"expanded_common_ml_first_git_grade_v1",researchOnly:true,modelPromoted:false,calibrated:false,generatedAt:now,markets:{},sportsbookObservedLineHistory:{authenticatedClosing:false,acceptedArchives:9,trackedSeries:100,repeatedSeries:3,changedLines:2,rows:[{secret:"DO_NOT_EXPORT"}]},sportsbookMatched:{kind:"conditional_sportsbook_matched_chronological_research_v1",researchOnly:true,modelPromoted:false,calibrated:false,matchedRows:0,markets:{}}};const x=safeExpandedML(d,f,null,now);assert.equal(x.marketEvidence.repeatedSeries,3);assert.equal(x.marketEvidence.matchedOutcomes,0);assert.equal(JSON.stringify(x).includes("DO_NOT_EXPORT"),false);});
