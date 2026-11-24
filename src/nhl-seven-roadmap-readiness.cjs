"use strict";
/**
 * P01-06, EDGE-04/05, P03-04, P06-02, CHAT-09, P07-05, P09-06.
 * Read-only seven-workstream NHL acceptance monitor. NO external calls,
 * player-level private feed exports, payout guesses, or auto-wagers.
 */
const {inspectLineupSource}=require("./nhl-lineup-source-revalidation.cjs");
const {summarizeNhlActionRuns}=require("./nhl-github-run-health.cjs");
const stamp=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const safeCount=x=>Number.isInteger(x)&&x>=0?x:0;
const round=(x,n=3)=>Number.isFinite(x)?Number(x.toFixed(n)):null;
const ageMinutes=(at,now)=>{
 const a=stamp(at),b=stamp(now);return a===null||b===null||a>b?null:round((b-a)/60000,1);
};
function wilson(correct,decided){
 if(!Number.isInteger(correct)||!Number.isInteger(decided)||decided<1||
    correct<0||correct>decided)return null;
 // Unclustered descriptive Wilson interval: correlated same-game decisions
 // can make this interval too narrow; never market as calibrated probability.
 const z=1.959963984540054,p=correct/decided,d=1+z*z/decided,
  center=(p+z*z/(2*decided))/d,
  span=z*Math.sqrt(p*(1-p)/decided+z*z/(4*decided*decided))/d;
 return {lower:round(Math.max(0,center-span),4),
  upper:round(Math.min(1,center+span),4),
  method:"descriptive_unclustered_wilson95_not_joint_or_calibrated"};
}
function sourceAudit(board,now,watchdog){
 const age=ageMinutes(board?.generatedAt,now),
  full=board?.completePagination===true&&board?.sourceStatus==="fresh"&&
   board?.provider==="prizepicksapi.com"&&
   Array.isArray(board?.rows)&&board.rows.length>0,
  recent=full&&age!==null&&age<=30;
 return {status:!board?"missing_archive":!full?"incomplete_or_unverified_source":
   recent?"fresh_independent_archive":"archived_not_current",
  provider:"independent_prizepicksapi_not_first_party",
  sourceCapturedAt:board?.generatedAt||null,
  sourceBoardAsOfAt:board?.boardAsOfAt||null,
  sourceAgeMinutes:age,
  completePagination:full,
  sourceOffers:safeCount(board?.totalOffers),
  offeredSideRows:safeCount(board?.rows?.length),
  quotaUnit:["credits","requests"].includes(board?.quotaUnit)?board.quotaUnit:"unknown",
  archivedLastKnownCreditBalance:Number.isInteger(board?.creditsRemaining)?board.creditsRemaining:null,
  providerAccountBalanceCheckedLive:false,
  morningAuditPresent:watchdog?.kind==="nhl_morning_board_watchdog_v1",
  morningActualSixComplete:watchdog?.six?.complete===true,
  morningActualNineComplete:watchdog?.nine?.complete===true,
  morningComparisonVerified:watchdog?.validSameDayDelta===true,
  originalPrizePicksOfferAuthenticated:false,
  actualLineupPayoutVerified:false};
}
function gradingAudit(ledger,grading){
 const good=ledger?.kind==="private_immutable_source_linked_nhl_selected_predictions",
  c=good?ledger.counts||{}:{},
  registered=safeCount(c.registered),correct=safeCount(c.correct),
  incorrect=safeCount(c.incorrect),push=safeCount(c.push),
  pending=safeCount(c.pending),decided=correct+incorrect,
  consistent=good&&registered===correct+incorrect+push+pending,
  explicit=grading?.individualPropAudit?.explicitProspective,
  comparisons=explicit?.decided===decided?{
   alwaysLowerRate:typeof explicit.alwaysLowerBaseline==="number"?round(explicit.alwaysLowerBaseline,4):null,
   alwaysHigherRate:typeof explicit.alwaysHigherBaseline==="number"?round(explicit.alwaysHigherBaseline,4):null,
   sameCohort:true
  }:{alwaysLowerRate:null,alwaysHigherRate:null,sameCohort:false};
 return {status:!consistent?"unverified_or_inconsistent_ledger":
   decided>=10?"official_stat_results_observed":"awaiting_more_official_results",
  originalPrecommittedRegistryVerified:consistent,
  registered:consistent?registered:0,
  correct:consistent?correct:0,incorrect:consistent?incorrect:0,
  pushes:consistent?push:0,pending:consistent?pending:0,
  decided:consistent?decided:0,
  observedStatDirectionRate:consistent&&decided>=10?round(correct/decided,4):null,
  wilson95:consistent&&decided>=10?wilson(correct,decided):null,
  alwaysLowerBaseline:comparisons.alwaysLowerRate,
  alwaysHigherBaseline:comparisons.alwaysHigherRate,
  baselineSameCohortVerified:comparisons.sameCohort,
  originalFantasyPlatformSettlementVerified:false,
  correlatedGameSamplesMayOverstatePrecision:true,
  predictedProbabilitiesCalibrated:false,
  winningsOrRoiVerified:false};
}
function modelAudit(shadow,graded){
 const overall=shadow?.kind==="nhl_money_puck_dfo_prospective_shadow_scorecard"?
  shadow.grade?.overall:null;
 const n=safeCount(overall?.n),games=safeCount(overall?.distinctGames);
 const champ=overall?.brier?.champion,challenger=overall?.brier?.shadow;
 const complete=Number.isFinite(champ)&&Number.isFinite(challenger)&&
  n>=1&&games>=1&&shadow.modelDeploymentApproved!==true;
 const byMarket={};
 // A better retrospective/short-frozen sample alone cannot automatically
 // promote a model. Surface per-market evidence and independent-game counts.
 for(const [name,entry] of Object.entries(shadow?.grade?.byMarket||{})){
  if(!/^[A-Za-z][A-Za-z0-9]{1,30}$/.test(name))continue;
  const count=safeCount(entry?.n),independentGames=safeCount(entry?.distinctGames),
   baseline=entry?.brier?.champion,candidate=entry?.brier?.shadow;
  if(!Number.isFinite(baseline)||!Number.isFinite(candidate)||
     baseline<0||baseline>1||candidate<0||candidate>1)continue;
  const change=round(baseline-candidate,5);
  byMarket[name]={verifiedOfficialStatRows:count,distinctOfficialGames:independentGames,
   championBrier:round(baseline,5),challengerBrier:round(candidate,5),
   brierDifferencePositiveFavorsChallenger:change,
   direction:change>0?"shadow_lower_error":change<0?"champion_lower_error":"indistinguishable",
   enoughIndependentGamesForPromotionReview:independentGames>=30&&count>=300,
   promoted:false,publicCalibratedModel:false};
 }
 return {status:complete?"offline_candidate_comparison_only":"insufficient_verified_model_comparison",
  independentOfficialGames:games,gradedForecasts:n,
  championBrier:complete?round(champ,5):null,
  challengerBrier:complete?round(challenger,5):null,
  byMarket,
  experimentalComparisonOnly:true,
  multipleIndependentHoldoutDaysRequired:true,
  alternateCandidatePromoted:false,
  estimatedPropProbabilitiesCalibrated:false,
  originalFantasyPlatformSettlementsVerified:false,
  frozenProspectiveSelections:safeCount(graded?.decided),
  modelPerformanceProofPending:true};
}
function lineupAudit(research,board,now){
 const lineups=research?.lineups||{},byPickCount={},riskCount={elevated:0,unknown:0,structurallySeparated:0};
 for(let n=2;n<=6;n++){
  const p=lineups[n]||lineups[String(n)];
  if(!p||!Array.isArray(p.picks)||p.picks.length!==n){
   byPickCount[n]={status:"unavailable",selectionCount:0,correlationUncertainty:true};
   riskCount.unknown++;continue;
  }
  const groups=new Map(),ids=new Set();
  for(const q of p.picks){
   const game=String(q.gameId||q.matchup||"").trim(),
    actor=String(q.playerId||q.player||"").trim();
   groups.set(game,(groups.get(game)||0)+1);ids.add(actor);
  }
  const overlap=[...groups.values()].reduce((sum,c)=>sum+c*(c-1)/2,0);
  const risk=overlap>0?"same_game_overlap_unmeasured":"different_games_structural_only";
  riskCount[overlap>0?"elevated":"structurallySeparated"]++;
  const sourceCheck=inspectLineupSource(p.picks,board,{now});
  byPickCount[n]={status:"research_only",selectionCount:n,
   sourceRevalidationStatus:sourceCheck.status,
   sourceRevalidationValidQuoteSides:sourceCheck.valid,
   sourceRevalidationMovedLines:sourceCheck.moved,
   sourceRevalidationNotSeenUnverified:sourceCheck.unseen,
   distinctPlayerCount:ids.size,distinctGames:groups.size,
   sameGamePairs:overlap,risk,jointProbabilityVerified:false,
   payoutSpecificExpectedValue:null,originalPlatformRestrictionsVerified:false,
   sensitivityToLineChange:"must_revalidate_against_new_timestamped_source"};
 }
 return {status:"structural_risk_only_not_joint_simulation",
  byPickCount,riskCount,
  correlationCoefficientsEstimated:false,
  correlatedSimulationBacktested:false,
  noBettingOrPayoutOptimizationsClaimed:true};
}
function goalieAudit(research,availability){
 const props=Array.isArray(research?.rankedProps)?research.rankedProps:[];
 const goalie=props.filter(p=>p.market==="saves"||p.market==="goalieSaves");
 const watch=goalie.filter(p=>p.researchEligibility==="watchlist"||
  p.roleEvidence?.reasons?.includes("STARTING_GOALIE_NOT_CONFIRMED"));
 const injury=props.filter(p=>p.roleEvidence?.reasons?.includes("PREGAME_INJURY_STATUS_UNVERIFIED"));
 return {status:"starter_and_injury_evidence_not_fully_verified",
  evaluatedGoalieSideRows:goalie.length,goalieNeedsReview:watch.length,
  injuryStatusUnknownSideRows:injury.length,
  sourcePregameSnapshotAt:availability?.generatedAt||null,
  reporterConfirmedIsNotClubAuthenticated:true,
  clubStartingGoalieConfirmed:false,
  unexpectedRoleChangeRiskSuppressed:true,
  periodAndRebootSettlementVerified:false};
}
function platformAudit(platform,board,now){
 const age=ageMinutes(platform?.generatedAt,now),
  eligible=platform?.kind==="nhl_cross_platform_line_shop_research_v1"&&
   platform.underdogConnected===true&&
   platform.underdogPublicDerivedDisplayAuthorized===true&&
   age!==null&&age<=30&&
   safeCount(platform.standardSideMatches)>0;
 return {status:eligible?"fresh_authorized_derived_comparisons":
  "underdog_current_comparison_unavailable",
  sourceAgeMinutes:age,matchedStandardSides:eligible?safeCount(platform.standardSideMatches):0,
  underdogOriginalPlatformAuthenticated:false,
  originalPrizePicksOfferAuthenticated:false,
  authenticTierMultipliersVerified:false,
  synchronizedExactMarketComparisonsRequired:true,
  sourceProvider:board?.provider||null,
  displayUnverifiedUnderdogQuotes:false};
}
function movementAudit(movement){
 const summary=movement?.summary||{};
 return {status:movement?.removalsVerified===false?"independent_changes_only":"unverified_change_source",
  observedIncreases:safeCount(summary.increased),
  observedDecreases:safeCount(summary.decreased),
  newlyObserved:safeCount(summary.newOffers),
  notSeenInNewFeedUnverified:safeCount(summary.notSeenUnverified),
  originalAppRemovalsVerified:false,
  currentOfferAvailabilityVerified:false};
}
function buildNhlSevenReadiness({now=new Date().toISOString(),board=null,research=null,
 grading=null,ledger=null,shadow=null,platform=null,watchdog=null,
 movement=null,availability=null,site=null,actionRuns=null}={}){
 if(stamp(now)===null)throw Error("Invalid NHL readiness timestamp");
 const operations={...sourceAudit(board,now,watchdog),
  githubActions:summarizeNhlActionRuns(actionRuns,{now})};
 const outcome=gradingAudit(ledger,grading);
 const prediction=modelAudit(shadow,outcome);
 const lineup=lineupAudit(research,board,now);
 const goalie=goalieAudit(research,availability);
 const crossPlatform=platformAudit(platform,board,now);
 const lifecycle=movementAudit(movement);
 const siteAge=ageMinutes(site?.builtAt,now);
 const website={status:siteAge!==null&&siteAge<=90?
   "published_data_recent_not_platform_availability":"published_data_old_or_missing",
  lastExportAt:site?.builtAt||null,exportAgeMinutes:siteAge,
  mobileResearchInterfaceExists:true,
  validCurrentOfferCheckRequired:true,
  publicRawProviderRowsAllowed:false};
 const alerts=[];
 if(operations.status!=="fresh_independent_archive")
  alerts.push("independent_nhl_source_not_fresh_for_live_display");
 if(!outcome.originalPrecommittedRegistryVerified)
  alerts.push("prospective_original_selection_registry_inconsistent_or_missing");
 if(!crossPlatform.matchedStandardSides)
  alerts.push("verified_underdog_comparisons_unavailable");
 if(operations.githubActions.observedFailures>0)
  alerts.push("critical_github_workflow_failures_observed");
 return {schemaVersion:1,kind:"private_nhl_seven_workstream_readiness_v1",
  generatedAt:now,operations,model:prediction,grading:outcome,
  website,lineups:lineup,goalie,crossPlatform,lifecycle,
  alerts,providerApiCallsByAudit:0,modelChangesAppliedByAudit:0,
  wagersPlaced:0,paidApiCreditsReservedByAudit:0,
  requiresIndependentNextMorningCaptureVerification:true,
  warning:"Independent-source research quality and official NHL stat results only; original fantasy app offers and settlement, joint lineup probability, model calibration and profit remain unverified."};
}
module.exports={wilson,sourceAudit,gradingAudit,modelAudit,lineupAudit,goalieAudit,
 platformAudit,movementAudit,buildNhlSevenReadiness};
