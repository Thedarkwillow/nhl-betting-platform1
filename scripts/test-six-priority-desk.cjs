"use strict";
const assert=require("node:assert/strict");
const {viewModel}=require("../assets/six-priority-desk.js");
const now="2026-11-07T18:00:00Z";
const missing=viewModel(null,now);
assert.equal(missing.status,"unavailable");
assert.match(missing.summary,/missing/);
assert.equal(missing.sections.length,0);
const brief={schemaVersion:1,kind:"public_nhl_six_priority_evidence_brief_v1",
generatedAt:"2026-11-07T17:55:00Z",
operations:{sixAm:"archived_on_time",nineAm:"not_verified",sameDayDelta:"not_verified",
freshIndependentBoardAtExport:true,lastBoardCapturedAt:"2026-11-07T17:54:00Z"},
movements:{status:"two_archived_source_observations",counts:{new_offer:3,
increased:2,decreased:1,observed_tier_change:1,not_seen_unverified:5}},
scorecard:{status:"original_frozen_predictions_official_stat_grading",
precommitted:24,correct:13,incorrect:8,push:1,pending:2,
observedHitRate:13/21,wilson95:{lower:.4,upper:.8},
byMarket:[{market:"shotsOnGoal",decided:21,correct:13,push:1,pending:2,observedRate:13/21}]},
markets:{markets:[{label:"Hits",officialFinalGameRows:100,
athletesWithEightGames:6,modelStatus:"research_candidate_needs_holdout"}]},
lineupRisk:{lineupSizesWithResearchCards:[2,3,4],crossLineupPlayersRepeated:2,
maxLineupAppearancesForOnePlayer:3,bySize:[{size:2,
status:"research_only_source_timestamp_checked",sameGameOverlap:false}]}};
const result=viewModel(brief,now);
assert.equal(result.status,"research_saved");
assert.equal(result.sections.length,5);
assert.deepEqual(result.sections.map(s=>s.key),["collection","movement","accuracy","markets","lineups"]);
assert.equal(result.sections[0].rows[0][1],"Captured on time");
assert.equal(result.sections[0].rows[1][1],"Not verified");
assert.equal(result.sections[1].rows.find(x=>x[0].startsWith("Tier"))[1],"1");
assert.ok(result.sections[2].rows.some(x=>x[1]==="61.9%"));
assert.ok(result.sections[3].rows[0][1].includes("100 official player-games"));
assert.equal(result.sections[4].rows[1][1],"2");
assert.ok(result.sections[4].help.includes("not validated"));
const expired=viewModel(brief,"2026-11-07T18:35:00Z");
assert.equal(expired.status,"archived_or_stale");
assert.ok(expired.summary.includes("No currently verified independent board"));
assert.equal(expired.sections[0].rows[3][1],"Archived / unavailable");
assert.equal(viewModel({schemaVersion:2,kind:"other"},now).status,"unavailable");
const neverPublished=viewModel({...brief,scorecard:{},operations:{}},now);
assert.ok(neverPublished.sections[2].rows[0][1].includes("unavailable"));
assert.equal(neverPublished.sections[0].rows[0][1],"Not verified");
console.log("Mobile research desk: live freshness, on-time evidence, movements, accuracy, markets and lineup caveats verified");


const creditsView=viewModel({...brief,operations:{
 ...brief.operations,archivedQuotaUnit:"credits",lastArchivedCreditsRemaining:31
}},now);
assert.ok(creditsView.sections[0].rows.some(x=>x[0].startsWith("Provider allowance")&&
 x[1].includes("31 credits reported at capture (not live)")));
const requestView=viewModel({...brief,operations:{
 ...brief.operations,archivedQuotaUnit:"requests",lastArchivedCreditsRemaining:null
}},now);
assert.ok(requestView.sections[0].rows.some(x=>x[1].includes("remaining allowance not verified")));


const withStandard=viewModel({...brief,scorecard:{...brief.scorecard,
 standardSameLineBenchmark:{
  kind:"public_nhl_standard_same_line_baseline_v1",
  decided:29,decidedOfficialGames:4,modelCorrect:13,
  alwaysHigherCorrect:15,alwaysLowerCorrect:14,
  modelObservedHitRate:13/29,hypotheticalHigherObservedRate:15/29,
  hypotheticalLowerObservedRate:14/29,
  modelMinusHypotheticalHigher:-2/29,
  originalPlatformSideAvailabilityVerified:false
 }}},now);
const scoreRows=withStandard.sections.find(s=>s.key==="accuracy").rows;
assert.ok(scoreRows.some(r=>r[0]==="Standard-only decided picks"&&r[1].includes("29")));
assert.ok(scoreRows.some(r=>r[0]==="Standard model hit rate"&&r[1].includes("44.8%")));
assert.ok(scoreRows.some(r=>r[0]==="Hypothetical always Higher"&&r[1].includes("51.7%")));
assert.ok(scoreRows.some(r=>r[0].startsWith("Model minus Higher")&&r[1].includes("-6.9 percentage points")));
assert.match(withStandard.sections.find(s=>s.key==="accuracy").help,/hypothetical/);


const futureSimpleView=viewModel({...brief,scorecard:{...brief.scorecard,
 futureSimpleStrategyAudit:{
  kind:"public_nhl_future_frozen_simple_strategies_v1",
  originalFrozenStandardSelections:12,decided:11,pending:0,pushes:1,
  byStrategy:{
   last5:{covered:12,decided:11,abstained:0,challengerHitRate:.6364,
    modelHitRateOnSameLines:.5455},
   last10:{covered:9,decided:9,abstained:3,challengerHitRate:null,
    modelHitRateOnSameLines:null},
   consensus5And10MarginHalf:{covered:6,decided:6,abstained:6,
    challengerHitRate:null,modelHitRateOnSameLines:null}
  }
 }}},now);
const futureLines=futureSimpleView.sections.find(x=>x.key==="accuracy").rows;
assert.ok(futureLines.some(x=>x[0]==="Future frozen Standard picks"&&x[1].includes("12 saved")));
assert.ok(futureLines.some(x=>x[0]==="Last-5 historical mean"&&x[1].includes("Challenger 63.6%")));
assert.ok(futureLines.some(x=>x[0]==="Last-10 historical mean"&&x[1].includes("Too few")));
assert.ok(futureLines.some(x=>x[0]==="Last-5/10 agreement-only"&&x[1].includes("6 abstained")));
assert.equal(viewModel(brief,now).sections.find(x=>x.key==="accuracy").rows
 .some(x=>x[0]==="Future simple-strategy trials"&&x[1].includes("Awaiting")),true);
console.log("Future first-Git-frozen simple challengers and sample-size abstention warnings verified");

const validation={
 kind:"public_nhl_probability_validation_v1",status:"research_validation_only",
 originalFrozenRegistered:42,standardTrainingDecisions:15,
 futureStandardHoldoutDecisions:3,futureStandardHoldoutGames:2,
 futureStandardHoldoutDates:1,futureStandardBrier:null,futureStandardLogLoss:null,
 estimatedProbabilitiesValidated:false,bettingRecommendationsApproved:false,
 actualPlatformSettlementsVerified:false,payoutAdjustedEVVerified:false,researchOnly:true
};
const withValidation=viewModel(brief,now,validation);
const statusRows=withValidation.sections.find(x=>x.key==="accuracy").rows;
assert.ok(statusRows.some(r=>r[0]==="Probability calibration"&&r[1]==="Not yet independently validated"));
assert.ok(statusRows.some(r=>r[0]==="Future Standard holdout"&&r[1].includes("3 decisions")));
assert.ok(statusRows.some(r=>r[0]==="Betting recommendation release"&&r[1].includes("Not approved")));
assert.ok(viewModel(brief,now).sections.find(x=>x.key==="accuracy").rows
 .some(r=>r[0]==="Future Standard holdout"&&r[1]==="Not yet published"));
console.log("Public forward probability validation status fails closed until independent proof");
