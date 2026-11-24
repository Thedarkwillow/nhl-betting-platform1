"use strict";
const t=require("node:test"),a=require("node:assert/strict");
const {gradeFrozen}=require("../src/goblin-opportunity-evidence.cjs");
const {pendingTriage,standardMarkets,sportsbookGap,calibrationHoldout}=
 require("../src/nhl-four-priority-research-audit.cjs");
const policy="2026-11-18T14:00:00Z",now="2026-11-19T04:00:00Z";
const row=(gameId,market,start,status="shadow_candidate")=>({
 sport:"NHL",tier:"Goblin",gameId,playerId:8477777,market,line:1.5,
 originalSide:"Higher",internalChallengerSide:status==="abstain"?null:"Higher",
 status,originalHigher:.6,challengerHigher:.65,
 sourceCapturedAt:"2026-11-18T15:00:00Z",
 sourceFirstGitAt:"2026-11-18T15:01:00Z",
 shadowCreatedAt:"2026-11-18T15:02:00Z",
 shadowFirstGitAt:"2026-11-18T15:03:00Z",
 gameStartsAt:start,originalFirstGitVerified:true,
 shadowFirstGitVerified:true,sourceIdentityVerified:true,
 modelPromoted:false,bettingEligible:false
});
t("zero-decided future Goblins remain future or unverified, never counted as losses",()=>{
 const rows=[row(1,"shotsOnGoal","2026-11-20T01:00:00Z"),
   row(2,"points","2026-11-19T03:00:00Z"),
   row(3,"blockedShots","2026-11-18T21:00:00Z"),
   row(4,"assists","2026-11-18T20:00:00Z"),
   row(5,"shotsOnGoal","2026-11-20T01:00:00Z","abstain")];
 const finals=[{sport:"NHL",gameId:4,playerId:8477777,market:"assists",
   actual:2,gameState:"FINAL",officialVerified:true,officialFinalAt:"2026-11-19T03:10:00Z"}];
 const grade=gradeFrozen(rows,finals,{policyFirstGitAt:policy});
 const z=pendingTriage(rows,finals,{policyAt:policy,now,grade});
 a.equal(grade.registered,5);a.equal(grade.decided,1);a.equal(grade.pending,3);
 a.equal(z.eligibleResearch,4);a.equal(z.abstained,1);
 a.equal(z.beforeKickoff,1);a.equal(z.afterStartWithinFourHours,1);
 a.equal(z.afterFourHoursWithoutVerifiedStat,1);
 a.equal(z.verifiedFinalDecisions,1);a.equal(z.coherentWithGrader,true);
 a.equal(z.approvedLineups,0);a.equal(z.calibrationApproved,false);
});
t("invalid finals never manufacture official decisions",()=>{
 const rs=[row(6,"shotsOnGoal","2026-11-18T21:00:00Z")],
  invalid=[{sport:"NHL",gameId:6,playerId:8477777,market:"shotsOnGoal",
    actual:2,gameState:"LIVE",officialVerified:false,officialFinalAt:now}];
 const grade=gradeFrozen(rs,invalid,{policyFirstGitAt:policy});
 const z=pendingTriage(rs,invalid,{policyAt:policy,now,grade});
 a.equal(z.verifiedFinalDecisions,0);a.equal(z.ambiguousOrInvalidFinal,1);
 a.equal(z.coherentWithGrader,true);
});
t("Standard market-specific comparisons carry a same-line always-Lower control, never a promotion",()=>{
 const m={decided:10,modelWins:4,alwaysHigherWins:3,
  alwaysLowerWins:7,distinctGames:6};
 const z=standardMarkets({kind:"nhl_frozen_same_threshold_baselines_v1",
  evidenceValid:true,postPolicySameSelectedLines:{byStandardMarket:{
   shotsOnGoal:m,points:{...m,decided:5,modelWins:3,alwaysHigherWins:2,alwaysLowerWins:3}
  }}});
 a.equal(z.byMarket.shotsOnGoal.modelMinusLower,-.3);
 a.equal(z.decided,15);a.equal(z.modelBeatsAlwaysLowerOnEveryMarket,false);
 a.equal(z.releaseApproved,false);
 a.equal(standardMarkets({evidenceValid:false}).valid,false);
});
t("sportsbook native same-line OFFER matches do not become model-to-book proof",()=>{
 const p={kind:"private_same_line_sportsbook_board_benchmark_v1",
 researchOnly:true,sharedProviderIdsVerified:false,originalPlatformAvailabilityVerified:false,
 generatedAt:"2026-11-17T14:06:12Z",
 bySport:{NHL:{native:1,exactBoardGroups:1,matchedOfferSides:2}},
 matchedSides:2,matches:[
  {sport:"NHL",player:"SECRET",market:"points",line:.5,side:"Higher",
    books:2,consensusHigher:.45,conditionalIdentityOnly:true},
  {sport:"NHL",player:"SECRET",market:"points",line:.5,side:"Lower",
    books:2,consensusHigher:.45,conditionalIdentityOnly:true}]};
 const z=sportsbookGap(p,{kind:"private_nhl_archived_benchmark_comparison_v2",matchedNHLRows:0});
 a.equal(z.archiveKindValid,true);a.equal(z.conditionalSameOfferSides,2);
 a.equal(z.historicalModelComparisonRows,0);
 a.equal(z.independentlyAuthenticatedSamePropModelComparisons,0);
 a.equal(z.currentQuoteFresh,false);a.equal(JSON.stringify(z).includes("SECRET"),false);
 a.equal(sportsbookGap({...p,sharedProviderIdsVerified:true}).archiveKindValid,false);
});
t("Standard future holdout 10 dates cannot authorize calibrated confidence",()=>{
 const report={kind:"private_nhl_prospective_probability_validation_v1",
 status:"research_validation_only",modelChanged:false,calibrated:false,
 originalPlatformSettlementsVerified:false,productionRecommendationsApproved:false,
 futureHoldout:{decided:744,distinctGames:62,distinctGameDates:10,
  meanPredictedProbability:.6164,observedHitRate:.496, brier:.2727}};
 const r=calibrationHoldout(report);
 a.equal(r.sourceValid,true);a.equal(r.minimum20DistinctDatesMet,false);
 a.equal(r.rawProbabilityOverconfidenceObserved,true);
 a.equal(r.absoluteOverconfidenceGap,.1204);
 a.equal(r.approvedProbabilityDisplay,false);
});

t("real mixed NHL/NFL archived quote totals reconcile by sport without betting approval",()=>{
 const nhl={sport:"NHL",player:"SECRET NHL",market:"points",line:.5,
  side:"Higher",books:2,consensusHigher:.55,conditionalIdentityOnly:true};
 const nfl={sport:"NFL",player:"SECRET NFL",market:"receptions",line:2.5,
  side:"Lower",books:2,consensusHigher:.48,conditionalIdentityOnly:true};
 const b={kind:"private_same_line_sportsbook_board_benchmark_v1",
  researchOnly:true,sharedProviderIdsVerified:false,
  originalPlatformAvailabilityVerified:false,
  generatedAt:"2026-11-22T14:06:32Z",
  bySport:{NHL:{native:1,exactBoardGroups:1,matchedOfferSides:2},
   NFL:{native:1,exactBoardGroups:1,matchedOfferSides:1}},
  matchedSides:3,matches:[nhl,{...nhl,side:"Lower"},nfl]};
 const r=sportsbookGap(b,null);
 a.equal(r.archiveKindValid,true);
 a.equal(r.conditionalSameOfferSides,2);
 a.equal(r.independentlyAuthenticatedSamePropModelComparisons,0);
 a.equal(r.originalAppAvailabilityVerified,false);
 a.equal(r.currentQuoteFresh,false);
 a.equal(r.verifiedPayoutEV,false);
 a.ok(!JSON.stringify(r).includes("SECRET"));
 for(const bad of [
   {...b,matchedSides:4},
   {...b,bySport:{...b.bySport,NHL:{...b.bySport.NHL,matchedOfferSides:3}}},
   {...b,bySport:{...b.bySport,NFL:{...b.bySport.NFL,matchedOfferSides:2}}},
   {...b,matches:[...b.matches.slice(0,2),{...nfl,sport:"ESPORTS"}]},
   {...b,matches:[{...nhl,conditionalIdentityOnly:false},b.matches[1],nfl]},
   {...b,sharedProviderIdsVerified:true}
 ])a.equal(sportsbookGap(bad,null).archiveKindValid,false);
});
