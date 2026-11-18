"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {model,historyChart}=require("../assets/roadmap-evidence-desk.js");
test("freshness and status evidence must not confuse an expired capture or malformed tier",()=>{
 const now=Date.parse("2026-11-14T23:00:00Z");
 const d={kind:"public_nfl_derived_research_cards_v1",tier:"Standard",status:"fresh_derived_research_only",asOf:"2026-11-14T22:40:00Z",cards:[{}]};
 const r=model({standard:d,goblin:{...d,tier:"Standard"},demon:{...d,tier:"Demon",asOf:"2026-11-14T22:20:00Z"}},now);
 assert.equal(r.rows.find(x=>x.label==="NFL Standard").value,"1 fresh-source research cards");
 assert.equal(r.rows.find(x=>x.label==="NFL Goblin").value,"No fresh approved cards");
 assert.equal(r.rows.find(x=>x.label==="NFL Demon").value,"No fresh approved cards");
 assert.equal(r.quotaRemaining,null);
});
test("historical chart excludes future and duplicate days",()=>{
 const a=[{date:"2026-11-13",value:3},{date:"2026-11-14",value:4},{date:"2026-11-12",value:0}];
 assert.deepEqual(historyChart(a,"2026-11-14T20:00:00Z"),[a[2],a[0]]);
 assert.deepEqual(historyChart([...a,a[0]],"2026-11-14T20:00:00Z"),[]);
});

test("Underdog status is historical aggregate only and fails closed on raw rows",()=>{const now=Date.parse("2026-11-17T01:05:00Z"),platformStatus={kind:"public_platform_integration_status_v1",checkedAt:"2026-11-17T01:02:03Z",rawRowsPublished:0,underdog:{NHL:{connected:true,sampleRows:5,eligibleRows:0,completeBoardVerified:false,originalPlatformVerified:false}}};assert.match(model({platformStatus},now).rows.find(x=>x.label==="Underdog NHL integration").value,/no eligible sample/);assert.equal(model({platformStatus:{...platformStatus,rawRowsPublished:1}},now).rows.some(x=>x.label==="Underdog NHL integration"),false);assert.equal(model({platformStatus},now).quotaRemaining,null);});

test("baseline comparison uses same validated historical denominator, not probability or settlement",()=>{const now=Date.parse("2026-11-17T03:00:00Z"),scorecards={kind:"public_nhl_nfl_original_git_frozen_model_scorecards_v1",sources:{nhlOriginalFrozenBaselineAt:"2026-11-17T02:00:00Z"},nhl:{standardOriginalSelections:{decided:582,correct:305,incorrect:277,hypotheticalHigherWins:264,hypotheticalLowerWins:318,distinctGames:53,calibrated:false,originalPlatformSettlementVerified:false}}};assert.match(model({scorecards},now).rows.find(x=>x.label==="NHL Standard historical baseline").value,/52.41% model \/ 45.36% always Higher \/ 54.64% always Lower/);scorecards.nhl.standardOriginalSelections.hypotheticalLowerWins=319;assert.equal(model({scorecards},now).rows.some(x=>x.label==="NHL Standard historical baseline"),false);});

test("remaining historical dates are counts not inferred model readiness",()=>{const now=Date.parse("2026-11-17T04:00:00Z"),progress={kind:"public_research_progress_counts_v1",proprietaryRowsPublished:0,calibrationApproved:false,modelPromoted:false,sourceReportAt:"2026-11-17T03:00:00Z",periodHistory:{accountedDays:158,calendarDays:261}};assert.match(model({progress},now).rows.find(x=>x.label==="NHL historical periods").value,/103 pending/);});

test("NFL same-threshold first-Git baselines are not repeated provider source records",()=>{const now=Date.parse("2026-11-17T15:00:00Z"),s={kind:"public_nhl_nfl_original_git_frozen_model_scorecards_v1",sources:{nflFirstGitForecastAuditAt:"2026-11-17T14:40:00Z"},nfl:{firstDistinctThreshold:{decided:94,correct:47,incorrect:47,modelObservedRate:.5,alwaysHigherObservedRate:38/94,alwaysLowerObservedRate:56/94,distinctFinalGames:1,calibrated:false,settlementVerified:false,firstGitSameThresholdOnly:true}}};const r=model({scorecards:s},now);assert.match(r.rows.find(x=>x.label==="NFL first-threshold baseline").value,/94 distinct thresholds in 1 games; not independent wagers/);s.nfl.firstDistinctThreshold.settlementVerified=true;assert.equal(model({scorecards:s},now).rows.some(x=>x.label==="NFL first-threshold baseline"),false);});


test("new selective rows are future-only and never conflated with historical baselines",()=>{
 const now=Date.parse("2026-11-18T04:00:00Z");
 const selective={kind:"public_selective_accuracy_first_git_counts_v1",
  nhlReportAt:"2026-11-18T03:34:48Z",nflReportAt:"2026-11-18T02:48:16Z",
  nhl:{registered:5,eligible:3,abstained:2,decided:1,pending:2},
  nfl:{included:2,decided:1,pending:1,distinctGames:1,distinctGameDates:1},
  bothPoliciesFutureOnly:true,independentOutperformanceEstablished:false,
  calibrationApproved:false,automatedLineupsApproved:false,
  originalPlatformSettlementVerified:false};
 const progress={kind:"public_research_progress_counts_v1",proprietaryRowsPublished:0,
  calibrationApproved:false,modelPromoted:false,
  sourceReportAt:"2026-11-18T03:35:23Z",
  validationSample:{sourceReportAt:"2026-11-18T03:35:00Z",modelPromoted:false,
   probabilitiesCalibrated:false,platformPayoutROI:null,
   nhlStandardFrozenDecisions:575,nhlStandardFrozenGames:51,nhlStandardFrozenPacificSlates:9},
  selectiveAccuracy:selective};
 const rows=model({progress},now).rows;
 assert.match(rows.find(x=>x.label==="NHL NEW selective policy (future-only)").value,/1 graded \/ 2 pending \/ 2 abstained/);
 assert.match(rows.find(x=>x.label==="NFL NEW selective policy (future-only)").value,/1 graded \/ 1 pending/);
 assert.match(rows.find(x=>x.label==="NHL Standard prospective sample").value,/575 original decisions/);
 assert.equal(model({progress:{...progress,selectiveAccuracy:{
  ...selective,automatedLineupsApproved:true}}},now).rows.some(x=>x.label.includes("NEW selective")),false);
 assert.equal(model({progress:{...progress,selectiveAccuracy:{
  ...selective,nhlReportAt:"2026-11-18T06:00:00Z"}}},now).rows.some(x=>x.label.includes("NEW selective")),false);
});


test("public scoreboard identifies exact sportsbook matching blockers without treating conditional as live",()=>{
 const at=Date.parse("2026-11-18T04:00:00Z");
 const f={kind:"public_sportsbook_exact_match_failure_counts_v1",
  archivedSnapshots:4,exactPlatformIdentityVerified:false,
  authenticatedClosingLine:false,paidProviderRequests:0,modelPromoted:false,
  bySport:{NHL:{native:3,no_event:2,no_exact_name:1,no_market:0,
   no_same_threshold:0,no_preexisting_frame:0,ambiguous_identity:0,
   conditional_match:0},NFL:{native:1,no_event:0,no_exact_name:0,no_market:0,
   no_same_threshold:1,no_preexisting_frame:0,ambiguous_identity:0,
   conditional_match:0}}};
 const p={kind:"public_research_progress_counts_v1",
  sourceReportAt:"2026-11-18T03:35:23Z",proprietaryRowsPublished:0,
  calibrationApproved:false,modelPromoted:false,sportsbook:{matchFunnel:f}};
 const rows=model({progress:p},at).rows;
 assert.match(rows.find(x=>x.label==="NHL sportsbook match blockers").value,/2 unmatched event/);
 assert.match(rows.find(x=>x.label==="NFL sportsbook match blockers").value,/1 different threshold/);
 assert.equal(model({progress:{...p,sportsbook:{matchFunnel:{
  ...f,exactPlatformIdentityVerified:true}}}},at).rows.some(x=>x.label.includes("sportsbook match blockers")),false);
 assert.equal(model({progress:{...p,sportsbook:{matchFunnel:{
  ...f,bySport:{NHL:{...f.bySport.NHL,native:4},NFL:f.bySport.NFL}}}}},at).rows.some(x=>x.label==="NHL sportsbook match blockers"),false);
});

test("web evidence desk shows missing 05:45 odds without mislabeling today's verified board",()=>{
 const now=Date.parse("2026-11-18T14:13:16Z");
 const health={kind:"public_nhl_nfl_pacific_morning_collection_health_v1",
   generatedAt:"2026-11-18T14:08:05Z",
   slots:{"06:00":{status:"privately_archived_complete",
     observedAt:"2026-11-18T14:05:32Z",nhlOffers:909,nflOffers:5131},
     "09:00":{status:"no_verified_full_capture",observedAt:null}},
   sportsbookPreboard:{kind:"public_preboard_sportsbook_evidence_status_v1",
     actualProviderRequestsMadeByAudit:0,liveAppOfferVerified:false,
     independentProbabilityBenchmarkVerified:false,
     slots:{"05:45":{status:"no_fresh_preboard_odds_archive",capturedAt:null},
     "08:45":{status:"not_due",capturedAt:null}}}};
 const rows=model({health},now).rows;
 assert.match(rows.find(x=>x.label==="6 AM archive").value,/NHL 909 \/ NFL 5131/);
 assert.equal(rows.find(x=>x.label==="05:45 Pacific sportsbook evidence").value,
  "No verified fresh quote archive");
 assert.equal(rows.find(x=>x.label==="08:45 Pacific sportsbook evidence").value,"Not due");
 assert.equal(rows.find(x=>x.label==="9 AM archive").value,"Unverified");
});


test("Goblin roadmap shows precommitted candidates but no confident betting slips",()=>{
 const now=Date.parse("2026-11-18T17:30:00Z");
 const progress={kind:"public_research_progress_counts_v1",
  sourceReportAt:"2026-11-18T14:00:00Z",proprietaryRowsPublished:0,
  calibrationApproved:false,modelPromoted:false,
  goblinFuture:{kind:"public_goblin_independent_future_research_counts_v1",
   sourceReportAt:"2026-11-18T17:15:00Z",
   nhl:{examined:30,newCandidates:3,newAbstentions:27,
    archivedFirstGit:3,futureRegistered:3,futureDecided:0},
   nfl:{supportedOpportunityResearchImplemented:true,
    freshFullPlayerIdentityAndAvailabilityVerified:false,firstGitEligible:0},
   calibration:{approved:false},lineup:{approvedSlips:0},
   modelPromoted:false,prospectiveEdgeVerified:false,
   payoutsAndSettlementsVerified:false,privatePlayerRowsPublished:0}};
 const rows=model({progress},now).rows;
 assert.match(rows.find(r=>r.label==="NHL Goblin frozen research").value,
   /3 new candidate \/ 27 abstained/);
 assert.match(rows.find(r=>r.label==="NFL Goblin opportunity model").value,
   /GSIS bridge and positive active-roster confirmation pending/);
 assert.match(rows.find(r=>r.label==="Goblin Power\/Flex 2–6").value,
   /no verified EV or approved slips/);
 const bad=model({progress:{...progress,goblinFuture:{
  ...progress.goblinFuture,prospectiveEdgeVerified:true}}},now).rows;
 assert.equal(bad.some(r=>r.label==="Goblin Power/Flex 2–6"),false);
});
