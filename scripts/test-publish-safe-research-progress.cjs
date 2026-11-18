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
