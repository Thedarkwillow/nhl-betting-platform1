"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {build}=require("../scripts/report-open-model-ideas.cjs");
const nhl={zeroStatIntegrity:{kind:"nhl_full_roster_zero_stat_and_feature_integrity_v1",
  completeGames:12,completeZeroShotAppearances:44,
  byMarket:{shotsOnGoal:{missingOrInvalid:0}},noMissingStatConvertedToZero:true,
  fullRosterZeroStatPopulationVerified:true,modelPromoted:false,
  privatePlayerName:"DO NOT LEAK"},
 experimentalOpportunityReplay:{
  kind:"nhl_fixed_threshold_two_stage_chronological_official_replay_v1",
  syntheticThresholds:true,realPlatformLinesUsed:false,modelPromoted:false,
  noSameDayOutcomeFeatures:true,
  byMarket:{shotsOnGoal:{matchedAppearanceRows:200,predicted:140,abstained:60,
   distinctGames:12,distinctDates:6,simplePast10MAE:1.3,
   twoStageMAE:1.25,syntheticFixedThresholdBrier:.23,
   originalPlayer:"DO NOT LEAK"}}}};
test("only count-only model status is published; no player or private line data",()=>{
 const r=build({nhl},"2026-11-18T05:00:00Z");
 a.equal(r.nhl.fullRosterAuditPass,true);
 a.equal(r.nhl.zeroShotAppearancesRetained,44);
 a.equal(r.nhl.markets.shotsOnGoal.predicted,140);
 a.equal(r.calibratedProbabilityApproved,false);
 a.equal(r.authenticatedReturnOnInvestment,null);
 a.equal(r.wagersPlaced,0);
 a.ok(!JSON.stringify(r).includes("DO NOT LEAK"));
});
test("synthetic replay cannot masquerade as authenticated real-line accuracy",()=>{
 const r=build({nhl:{...nhl,experimentalOpportunityReplay:{
  ...nhl.experimentalOpportunityReplay,realPlatformLinesUsed:true}}});
 a.deepEqual(r.nhl.markets,{});
 a.equal(r.modelPromoted,false);
 a.equal(r.validation.independentProspectiveOutperformanceProven,false);
});
test("missing cached evidence remains explicitly unverified and not promoted",()=>{
 const r=build();
 a.equal(r.nhl.fullRosterAuditAvailable,false);
 a.equal(r.nhl.officialCompleteGames,null);
 a.equal(r.nfl.priorWeekUsageReplayAvailable,false);
 a.equal(r.nfl.verifiedLiveRoutesOrWOPR,false);
 a.equal(r.nba.verifiedPregameFeeds,false);
 a.equal(r.esports.verifiedPregameFeeds,false);
 a.equal(r.optimizedLineupsApproved,false);
});


test("existing prior-week NFL kicker research is detected without false live accuracy",()=>{
 const kicking={kind:"nfl_position_and_kicker_context_weight_trial_v1",
  priorWeeksOnly:true,actualGameWeatherUsed:false,modelPromoted:false,
  reconciledKickerAppearances:1037,
  kicking:{fg_made:{holdoutGames:121},kicking_points:{holdoutGames:121}},
  confidentialPlayer:"DO NOT LEAK"};
 const good=build({kicking});
 a.equal(good.nfl.kickerRoleEvidenceAvailable,true);
 a.equal(good.nfl.kickerAppearanceCount,1037);
 a.equal(good.nfl.kickerHistoricalHoldoutGames,121);
 a.equal(good.nfl.kickingResultsRetrospectiveOnly,true);
 a.equal(good.nfl.prospectiveKickingEdgeProven,false);
 a.ok(!JSON.stringify(good).includes("DO NOT LEAK"));
 a.equal(build({kicking:{...kicking,actualGameWeatherUsed:true}}).nfl.kickerRoleEvidenceAvailable,false);
 a.equal(build({kicking:{...kicking,priorWeeksOnly:false}}).nfl.kickerRoleEvidenceAvailable,false);
 a.equal(build({kicking:{...kicking,reconciledKickerAppearances:null}}).nfl.kickerRoleEvidenceAvailable,false);
});
