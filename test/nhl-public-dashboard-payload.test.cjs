"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sanitizePublicDashboard}=require("../src/nhl-public-dashboard-payload.cjs");
const original={
 builtAt:"2026-11-03T20:00:00Z",researchAt:"2026-11-03T19:59:00Z",
 boardAt:"2026-11-03T19:59:00Z",comparisonAt:null,
 boardCoverageComplete:true,boardCoverage:{apiPaginationComplete:true,secret:"private"},
 researchFreshAtBuild:true,
 props:[{player:"A",team:"BOS",market:"shotsOnGoal",line:2.5,lean:"Higher",
  tier:"Standard",probability:.61,observations:20,matchup:"BOS vs TOR",
  capturedAt:"2026-11-03T19:58:00Z",eventStartsAt:"2026-11-03T22:00:00Z",
  proprietaryWeights:[.8,.2],projection:3.2,model:"weighted-form-v1",
  matchedMoneyPuckData:{secret:123},debug:{secret:"never publish"},
  matchupScout:{internalOpponentRate:6}}],
 featuredIndividualProps:[],comparisons:[],
 lineups:{2:{picks:[
  {player:"A",team:"BOS",market:"shotsOnGoal",line:2.5,lean:"Higher",tier:"Standard",
   probability:.61,matchup:"BOS vs TOR",capturedAt:"2026-11-03T19:58:00Z",
   eventStartsAt:"2026-11-03T22:00:00Z",privateRawOdds:[1,3]},
  {player:"C",team:"NYR",market:"points",line:0.5,lean:"Lower",tier:"Standard",
   probability:.67,matchup:"NYR vs PHI",capturedAt:"2026-11-03T19:58:00Z",
   eventStartsAt:"2026-11-03T22:00:00Z",proprietaryNotes:"secret"}
 ],distinctGames:2,correlationRisk:"same_game_excluded",
 rankScore:-1.2,publishedStandardPowerMultiplier:3.0}},
 prospectiveResearchAudit:{gradedDecisions:0,verifiedProspectiveHitRate:null,selectedIndividualPending:0,
   legacyReconstructed:{decided:147,correct:71},rawOfferedSideDecisions:706},
 historicalModelResearch:{models:["weighted-form-v1"],training:33},
 distributionResearch:{secretWeights:{x:1}},
 approvedSourceResearch:{privateMoneyPuckFeatures:[1,2,3]},
 matchupResearch:{privateSites:["x"]},
 grading:{rawOfferedSideCorrectRate:.33}
};
test("public export strictly excludes model formulas, source diagnostics and historical lab",()=>{
 const publicData=sanitizePublicDashboard(original);
 assert.equal(publicData.kind,"public_nhl_research_cards_not_internal_model");
 assert.deepEqual(publicData.props[0].player,"A");
 assert.equal(publicData.props[0].probability,.61);
 assert.equal(publicData.props[0].proprietaryWeights,undefined);
 assert.equal(publicData.lineups[2].picks[0].privateRawOdds,undefined);
 assert.equal(publicData.lineups[2].rankScore,undefined);
 assert.deepEqual(Object.keys(publicData.performance).sort(),
  ["gradedProspectivePicks","modelCalibrated","originalPlatformSettlementVerified",
   "payoutAdjustedReturnVerified","pendingProspectivePicks","verifiedProspectiveHitRate",
   "correctProspectivePicks","pushedProspectivePicks","decidedProspectivePicks"].sort());
 for(const marker of ["proprietaryWeights","weighted-form-v1","distributionResearch",
  "approvedSourceResearch","matchupScout","rawOfferedSideCorrectRate",
  "legacyReconstructed","publishedStandardPowerMultiplier","rankScore"])
  assert.equal(JSON.stringify(publicData).includes(marker),false,marker);
});
test("no recorded prospective outcomes always gives null hit-rate and unverified ROI",()=>{
 const x=sanitizePublicDashboard(original);
 assert.equal(x.performance.gradedProspectivePicks,0);
 assert.equal(x.performance.verifiedProspectiveHitRate,null);
 assert.equal(x.performance.payoutAdjustedReturnVerified,false);
 assert.equal(x.lineups[3],null);
});
test("reject malformed exports and never copy unknown report fields",()=>{
 assert.throws(()=>sanitizePublicDashboard({props:null}),/Valid private/);
 const output=sanitizePublicDashboard({...original,
  outsideSecret:"leaked",newSensitiveModelFeature:{coefficient:0.8}});
 assert.equal(output.outsideSecret,undefined);
 assert.equal(output.newSensitiveModelFeature,undefined);
});

test("official pushes are graded but not decided and never inflate win/loss denominator",()=>{
 const d=sanitizePublicDashboard({...original,prospectiveResearchAudit:{
  gradedDecisions:3,selectedOfficialStatsGraded:4,
  prospectiveCorrect:2,prospectivePushes:1,selectedIndividualPending:10,
  verifiedProspectiveHitRate:2/3,individualByMarket:{
   shotsOnGoal:{graded:4,decided:3,correct:2,pushes:1}}
 }});
 assert.equal(d.performance.gradedProspectivePicks,4);
 assert.equal(d.performance.decidedProspectivePicks,3);
 assert.equal(d.performance.correctProspectivePicks,2);
 assert.equal(d.performance.pushedProspectivePicks,1);
 assert.equal(d.performance.verifiedProspectiveHitRate,null,"Small prospective sample must not advertise a verified rate");
 assert.equal(d.resultBreakdown.byMarket[0].losses,1);
});

test("public audit strips original pick identities and only emits reconciled aggregate cells",()=>{
 const input={...original,
  prospectiveResearchAudit:{eligiblePregamePredictions:12,gradedDecisions:10,
   selectedOfficialStatsGraded:11,prospectiveCorrect:8,prospectivePushes:1,
   selectedIndividualPending:1,verifiedProspectiveHitRate:.8},
  originalPrecommitLedger:{kind:"private_immutable_source_linked_nhl_selected_predictions",
   cohort:"explicit_original_Git_precommitted_standalone_model_directions",
   counts:{registered:12,correct:8,incorrect:2,push:1,pending:1},
   records:Array.from({length:12},(_,i)=>({
    id:"nhl-secret-"+i,gameId:2026020111,playerId:500000+i,
    privateModel:"SECRET_FORMULA",providerOfferId:"SOURCE_VENDOR_SECRET",
    line:2.5,market:"shotsOnGoal",tier:"Standard",selectedSide:"Higher",
    gameStartAt:"2026-11-06T01:00:00Z",
    firstGitCommittedAt:"2026-11-06T00:15:04Z",
    selectionStatus:i<8?"correct":i<10?"incorrect":i===10?"push":"pending_official_player_stats"
   }))},
  sourceCoverageAudit:{kind:"private_nhl_independent_source_coverage_v1",
   sourceCompletePagination:true,boardCapturedAt:"2026-11-03T19:59:00Z",
   sourceFreshForLiveUse:true,expectedWindowHours:48,
   officialGamesInWindow:8,officialGamesWithObservedOffers:5,
   matchedEligibleSideRows:30,rawSourceRows:["SECRET_SOURCE"]}};
 const d=sanitizePublicDashboard(input);
 assert.equal(d.prospectiveCohort.cohortVerified,true);
 assert.equal(d.prospectiveCohort.counts.registered,12);
 assert.equal(d.prospectiveCohort.byMarket[0].observedRate,.8);
 assert.equal(d.prospectiveCohort.byPacificGameDay[0].group,"2026-11-05");
 assert.equal(d.collectionCoverage.officialGamesWithObservedOffers,5);
 assert.equal(d.collectionCoverage.sourceFreshForLiveDisplay,true);
 assert.equal(d.collectionCoverage.originalPlatformBoardCoverageVerified,false);
 for(const prohibited of ["SECRET_FORMULA","SOURCE_VENDOR_SECRET","SECRET_SOURCE","nhl-secret-",'"playerId"'])
  assert.equal(JSON.stringify(d).includes(prohibited),false,prohibited);
});
test("mismatched prospective graded counts fail closed rather than advertising success",()=>{
 const d=sanitizePublicDashboard({...original,originalPrecommitLedger:{
  kind:"private_immutable_source_linked_nhl_selected_predictions",
  cohort:"explicit_original_Git_precommitted_standalone_model_directions",
  counts:{registered:0,correct:0,incorrect:0,push:0,pending:0},
  records:[]},prospectiveResearchAudit:{eligiblePregamePredictions:187,
   selectedIndividualPending:187,gradedDecisions:0,prospectiveCorrect:0,prospectivePushes:0}});
 assert.equal(d.prospectiveCohort.cohortVerified,false);
 assert.equal(d.prospectiveCohort.status,"original_commit_ledger_missing");
 assert.equal(d.performance.pendingProspectivePicks,187);
});

test("new seven-workstream public brief contains only approved aggregates",()=>{
 const audit={
  kind:"private_nhl_seven_workstream_readiness_v1",
  operations:{status:"fresh_independent_archive",sourceCapturedAt:"2026-11-06T23:55:30Z",
   completePagination:true,offeredSideRows:2399,apiSecret:"PRIVATE_PROVIDER_TOKEN"},
  grading:{originalPrecommittedRegistryVerified:true,registered:187,
   decided:110,pending:76,pushes:1,wilson95:{lower:.52,upper:.70},
   originalPlayerRecords:[{playerId:9999,privateSelection:"do-not-publish"}]},
  model:{championBrier:.21,challengerBrier:.19,formula:"SECRET_MODEL_EQUATION"},
  lineups:{riskCount:{elevated:2},privateLineupPicks:[{playerId:9999}]},
  goalie:{goalieNeedsReview:19,privateStarterNotes:"PRIVATE_GOALIE_REPORT"},
  crossPlatform:{status:"underdog_current_comparison_unavailable",
   matchedStandardSides:17,providerToken:"SECRET_UNDERDOG"},
  lifecycle:{newlyObserved:55,notSeenInNewFeedUnverified:4,privateRows:["SECRET_OFFER"]}};
 const result=sanitizePublicDashboard({...original,researchIntelligence:audit});
 assert.equal(result.researchQuality.kind,"public_nhl_seven_workstream_brief_v1");
 assert.equal(result.researchQuality.sourcePaginationComplete,true);
 assert.equal(result.researchQuality.sourceOfferedSideRows,2399);
 assert.equal(result.researchQuality.prospectiveDecided,110);
 assert.equal(result.researchQuality.descriptiveWilson95.lower,.52);
 assert.equal(result.researchQuality.underdogStatus,"underdog_current_comparison_unavailable");
 assert.equal(result.researchQuality.sourceFreshUnderdogMatches,0);
 assert.equal(result.researchQuality.lineupJointProbabilityVerified,false);
 for(const secret of ["PRIVATE_PROVIDER_TOKEN","do-not-publish","SECRET_MODEL_EQUATION",
  "PRIVATE_GOALIE_REPORT","SECRET_UNDERDOG","SECRET_OFFER","privateLineupPicks",
  "championBrier","playerId"]){
  assert.ok(!JSON.stringify(result).includes(secret),"Public disclosure: "+secret);
 }
});
test("without validated internal evidence public readiness stays unverified",()=>{
 const r=sanitizePublicDashboard({...original,researchIntelligence:{
  kind:"forged",operations:{status:"fresh_independent_archive"},
  grading:{decided:9999}}});
 assert.equal(r.researchQuality.status,"source_evidence_not_available");
 assert.equal(r.researchQuality.prospectiveDecided,0);
 assert.equal(r.researchQuality.expectedValueVerified,false);
});

test("current independent preview is public-only and never enters original prospective grading",()=>{
 const row={player:"Sample Skater",team:"NYR",market:"shotsOnGoal",line:2.5,
  tier:"Standard",lean:"Higher",probability:.67,observations:20,
  matchup:"NYR vs BOS",capturedAt:"2026-11-06T20:55:00Z",
  eventStartsAt:"2026-11-06T23:00:00Z",privateModelCoefficients:[12,34],
  verifiedThirdPartyBoardMembershipAt:"2026-11-06T20:54:58Z",
  originalPlatformAvailabilityVerified:true};
 const document=sanitizePublicDashboard({...original,
  researchFreshAtBuild:true,boardCoverage:{apiPaginationComplete:true},
  liveResearchOrigin:"independent_nonprecommitted_model_preview",
  previewResearchProps:[row],
  prospectiveResearchAudit:{gradedDecisions:0,selectedIndividualPending:0,
   prospectiveCorrect:0,prospectivePushes:0}});
 assert.equal(document.previewResearchOnly,true);
 assert.equal(document.previewSelectionsOfficiallyPrecommitted,false);
 assert.equal(document.previewResearchProps.length,1);
 assert.equal(document.previewResearchProps[0].player,row.player);
 assert.equal(document.previewResearchProps[0].privateModelCoefficients,undefined);
 assert.equal(document.previewResearchProps[0].originalPlatformAvailabilityVerified,undefined);
 assert.equal(document.previewResearchProps[0].verifiedThirdPartyBoardMembershipAt,undefined);
 assert.equal(document.performance.verifiedProspectiveHitRate,null);
 const stale=sanitizePublicDashboard({...original,liveResearchOrigin:
  "independent_nonprecommitted_model_preview",previewResearchProps:[row],
  researchFreshAtBuild:false});
 assert.equal(stale.previewResearchProps.length,0);
 assert.equal(stale.previewResearchOnly,false);
});


test("P02-12 P09-06 P11-06 public provenance, payout and responsible research contract",()=>{
 const d=sanitizePublicDashboard(original);
 assert.equal(d.evidenceLegend.kind,"public_nhl_evidence_categories_v1");
 assert.match(d.evidenceLegend.modelEstimate,/not verified/i);
 assert.match(d.evidenceLegend.retrospective,/not a prospective/i);
 assert.match(d.evidenceLegend.tier,/UNVERIFIED/);
 assert.match(d.evidenceLegend.platformSettlement,/UNVERIFIED/);
 assert.equal(d.responsibleResearch.noAutoplacement,true);
 assert.equal(d.responsibleResearch.noBettingActionOnSite,true);
 assert.equal(d.responsibleResearch.originalPlatformSettlementVerified,false);
 assert.equal(d.props[0].tier,"Standard");
 assert.equal(d.props[0].tierEvidence,"independent_provider_only");
 assert.equal(d.props[0].originalTierVerified,undefined);
 assert.equal(d.props[0].expectedValue,undefined);
 assert.ok(!JSON.stringify(d).includes("publishedStandardPowerMultiplier"));
});
test("P02-12 unknown labels cannot pass as actual original platform tier",()=>{
 const d=sanitizePublicDashboard({...original,props:[{...original.props[0],
  tier:"TurboDemon",guessedMultiplier:999,bookmakerAmericanOdds:+125}]});
 assert.equal(d.props[0].tier,null);
 assert.equal(d.props[0].tierEvidence,"independent_provider_only");
 assert.equal(d.props[0].guessedMultiplier,undefined);
 assert.equal(d.props[0].bookmakerAmericanOdds,undefined);
});

test("Future probability audit publishes only safe no-recommendation aggregate",()=>{
 const p=sanitizePublicDashboard({...original,privateProbabilityValidation:{
  kind:"private_nhl_prospective_probability_validation_v1",status:"research_validation_only",
  counts:{registered:40},training:{decided:30},futureHoldout:{decided:3,distinctGames:2,distinctGameDates:2,brier:.10,logLoss:.3},
  proprietaryParameters:{slope:11.1},privatePlayerIds:[1234],
  approvedBettingRecommendations:true
 }});
 assert.equal(p.probabilityValidation.kind,"public_nhl_probability_validation_v1");
 assert.equal(p.probabilityValidation.originalFrozenRegistered,40);
 assert.equal(p.probabilityValidation.futureStandardBrier,null);
 assert.equal(p.probabilityValidation.bettingRecommendationsApproved,false);
 assert.ok(!JSON.stringify(p).includes("proprietaryParameters"));
 assert.ok(!JSON.stringify(p).includes("privatePlayerIds"));
});
