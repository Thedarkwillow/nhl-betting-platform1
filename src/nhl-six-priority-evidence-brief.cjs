"use strict";
/**
 * Six-roadmap evidence brief. Public version contains only counts/statuses from
 * explicitly allowlisted sources. No provider raw rows, player IDs, model
 * weights or first-party/payout authenticity claims.
 */
const {pacificDate}=require("./nhl-daily-prospective-gate.cjs");
const {wilson95}=require("./nhl-public-prospective-cohort.cjs");
const {PRIZEPICKS_NHL_GOALIE_SCORING_V1}=require("./nhl-four-priority-markets.cjs");

const asTime=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const cleanCount=x=>Number.isInteger(x)&&x>=0?x:0;
const MARKET_FIELDS=Object.freeze([
 {key:"hits",label:"Hits",field:"hits",kind:"integer",minGames:8},
 {key:"faceoffsWon",label:"Faceoffs won",field:"faceoffsWon",kind:"integer",minGames:8},
 {key:"timeOnIceSeconds",label:"Time on ice",field:"timeOnIceSeconds",kind:"seconds",minGames:8},
 {key:"saves",label:"Goalie saves",field:"saves",kind:"integer",minGames:8,goalie:true},
 {key:"prizePicksGoalieFantasyScore",label:"Goalie fantasy (PrizePicks rule candidate)",
  field:"prizePicksGoalieFantasyScore",kind:"fantasy",minGames:8,goalie:true},
 {key:"goalsAgainst",label:"Goals allowed",field:"goalsAgainst",kind:"integer",minGames:8,goalie:true},
 {key:"shotsOnGoal",label:"Shots on goal",field:"shotsOnGoal",kind:"integer",minGames:8}
]);

function auditMorning({at,board,morningAudit}={}){
 const now=asTime(at);if(now===null)throw Error("Invalid audit timestamp");
 const day=pacificDate(at),sameDay=morningAudit?.datePacific===day;
 const status=slot=>sameDay&&morningAudit?.[slot]?.complete===true?"archived_on_time":"not_verified";
 const boardAt=asTime(board?.generatedAt),age=boardAt===null?null:Math.round((now-boardAt)/60000);
 const validFresh=board?.provider==="prizepicksapi.com"&&board?.independentProvider===true&&
  board?.sourceStatus==="fresh"&&board?.completePagination===true&&
  age!==null&&age>=0&&age<=30;
 return {datePacific:day,sixAm:status("six"),nineAm:status("nine"),
  sameDayDelta:sameDay&&morningAudit?.validSameDayDelta===true?"compared":"not_verified",
  freshIndependentBoardAtExport:validFresh,
  boardAgeMinutes:age!==null&&age>=0?age:null,
  lastBoardCapturedAt:boardAt!==null?board.generatedAt:null,
  archivedQuotaUnit:["credits","requests"].includes(board?.quotaUnit)?board.quotaUnit:"unknown",
  lastArchivedCreditsRemaining:board?.quotaUnit==="credits"&&
   Number.isInteger(board.creditsRemaining)&&board.creditsRemaining>=0?
   board.creditsRemaining:null,
  liveAccountCreditsVerified:false,
  provider:"independent_third_party",
  firstPartyOfferVerified:false,sourceFreshnessRequired:true,
  githubRunConclusionChecked:false,cloudflareSchedulerExecutionVerified:false,
  noNewApiCalls: true,
  note:"Scheduled success and an on-time provider board are different. Missing evidence is not a successful pull."};
}
function auditMovement({movement}={}){
 const isValid=asTime(movement?.previousAt)!==null&&asTime(movement?.currentAt)!==null&&
  Date.parse(movement.currentAt)>Date.parse(movement.previousAt);
 const changes=isValid&&Array.isArray(movement?.changes)?movement.changes:[];
 const typeCounts=Object.fromEntries(["new_offer","increased","decreased",
  "observed_tier_change","not_seen_unverified"].map(key=>[key,changes.filter(c=>c?.type===key).length]));
 // The public detail list is capped. Prefer complete source aggregate counters
 // from this same archived movement object, not the truncated last 200 rows.
 if(isValid&&movement?.summary&&movement.changesTruncated===true){
  const names={new_offer:"newOffers",increased:"increased",decreased:"decreased",
   observed_tier_change:"tierChangesObserved",not_seen_unverified:"notSeenUnverified"};
  for(const [name,sourceName] of Object.entries(names)){
   const n=movement.summary[sourceName];
   if(Number.isInteger(n)&&n>=typeCounts[name])typeCounts[name]=n;
  }
 }
 return {status:isValid?"two_archived_source_observations":"missing_comparable_snapshots",
  previousAt:isValid?movement.previousAt:null,currentAt:isValid?movement.currentAt:null,
  counts:isValid?typeCounts:null,
  detailsTruncated:isValid&&movement?.changesTruncated===true,
  platformRemovalConfirmed:false,repostingConfirmed:false,
  unknownIntervalsRemainUnknown:true,
  note:"A source row not observed later is not a verified original-app withdrawal; tier changes require one-to-one stable original source identity."};
}
function officialSamples(history){
 const stats={};for(const m of MARKET_FIELDS)stats[m.key]={gameRows:0,playersWithEightPriorGames:0};
 if(!history?.players||typeof history.players!=="object")return stats;
 for(const p of Object.values(history.players)){
  if(!p||!Array.isArray(p.games))continue;
  for(const m of MARKET_FIELDS){
   if(!!m.goalie!==(p.type==="goalie"))continue;
   const eligible=p.games.filter(g=>g&&/^\d{4}-\d{2}-\d{2}$/.test(g.gameDate||"")&&
    Number.isInteger(g.gameId)&&Number.isFinite(g[m.field])&&
    (m.kind==="integer"?Number.isInteger(g[m.field])&&g[m.field]>=0:
     m.kind==="seconds"?g[m.field]>=0&&g[m.field]<=3900:true));
   stats[m.key].gameRows+=eligible.length;
   if(eligible.length>=m.minGames)stats[m.key].playersWithEightPriorGames++;
  }
 }
 return stats;
}
function auditModels({history,officialCoverage,publicProps,walkforward}={}){
 const samples=officialCoverage?.kind==="official_nhl_market_coverage_counts_v1"?
  Object.fromEntries(MARKET_FIELDS.map(m=>{
   const v=officialCoverage.markets?.[m.key];
   return [m.key,{gameRows:cleanCount(v?.gameRows),
    playersWithEightPriorGames:cleanCount(v?.playersWithEightPriorGames)}];
  })):officialSamples(history);
 const source=Array.isArray(publicProps)?publicProps:[];
 return {kind:"nhl_market_data_readiness_v1",
  markets:MARKET_FIELDS.map(m=>{
   const matching=source.filter(p=>p&&(
    String(p.market||"").toLowerCase().replace(/[^a-z0-9]/g,"")===m.key.toLowerCase()||
    (m.key==="saves"&&/^(goaltendersaves|goaliesaves|saves)$/.test(
      String(p.market||"").toLowerCase().replace(/[^a-z0-9]/g,"")))));
   const n=samples[m.key];
   const validStudy=walkforward?.kind==="nhl_official_priority_markets_walkforward_2026_27_v1"&&
    walkforward.season==="2026-27"&&
    walkforward.isActualPrizePicksQuotedLineBacktest===false&&walkforward.noModelPromoted===true;
   const lab=validStudy?walkforward.markets?.[m.key]:null,
    holdoutGames=cleanCount(lab?.scoredPlayerGames),
    hasEvaluation=holdoutGames>=30;
   return {key:m.key,label:m.label,officialFinalGameRows:n.gameRows,
    athletesWithEightGames:n.playersWithEightPriorGames,
    displayedResearchRows:matching.length,
    officialHoldoutEvaluations:holdoutGames,
    pastOnlyLast5MAE:hasEvaluation&&Number.isFinite(lab.last5MeanAbsoluteError)?
     lab.last5MeanAbsoluteError:null,
    pastOnlyLast10MAE:hasEvaluation&&Number.isFinite(lab.last10MeanAbsoluteError)?
     lab.last10MeanAbsoluteError:null,
    errorUnit:hasEvaluation?lab.unit:null,
    originalPlatformThresholdsInHoldout:0,
    modelStatus:n.playersWithEightPriorGames>0?"research_candidate_needs_holdout":
      "insufficient_verified_historical_support",
    originalOfferMarketConfirmed:false,probabilityCalibrated:false,
    automaticLineupEligible:false};
  }),
  goalieFantasyScoring:{
   source:"user_provided_not_independently_verified_in_app",
   win:PRIZEPICKS_NHL_GOALIE_SCORING_V1.win,
   shutout:PRIZEPICKS_NHL_GOALIE_SCORING_V1.shutout,
   saves:PRIZEPICKS_NHL_GOALIE_SCORING_V1.save,
   goalsAgainst:PRIZEPICKS_NHL_GOALIE_SCORING_V1.goalAgainst,
   officialWinAndShutoutFlagsRequired:true,
   platformSettlementVerified:false,
   automaticallyEligible:false},
  warning:"Past-only last5/last10 MAE is disclosed only after 30+ official holdout player-games. It is not an actual PrizePicks-line backtest, prospective calibration, release approval or verified sportsbook offer. TOI regulation-only quotes cannot be graded against full-game overtime TOI."};
}
function publicStandardBaseline(ledger,counts){
 const all=ledger?.historicalSameSelectedLines?.allFrozenSelections,
  p=ledger?.historicalSameSelectedLines?.standardDirectional;
 if(!counts||ledger?.kind!=="nhl_frozen_same_threshold_baselines_v1"||
  ledger.evidenceValid!==true||ledger.status!=="valid_original_git_precommitted_selection_cohort"||
  !all||!p||all.observedSelected!==counts.registered||
  all.decided!==counts.correct+counts.incorrect||
  all.modelWins!==counts.correct||all.pushes!==counts.push||
  all.ungraded!==counts.pending||
  !Number.isInteger(p.decided)||p.decided<0||
  !Number.isInteger(p.observedSelected)||p.observedSelected<0||
  p.decided>p.observedSelected||p.observedSelected>counts.registered||
  !Number.isInteger(p.modelWins)||p.modelWins<0||p.modelWins>p.decided||
  !Number.isInteger(p.alwaysHigherWins)||p.alwaysHigherWins<0||p.alwaysHigherWins>p.decided||
  !Number.isInteger(p.alwaysLowerWins)||p.alwaysLowerWins<0||p.alwaysLowerWins>p.decided||
  p.alwaysHigherWins+p.alwaysLowerWins!==p.decided)return null;
 const rate=n=>p.decided?Number((n/p.decided).toFixed(4)):null;
 return {kind:"public_nhl_standard_same_line_baseline_v1",
  cohort:"original_precommitted_picks_descriptive_baselines",
  selected:p.observedSelected,decided:p.decided,pushes:p.pushes,
  decidedOfficialGames:cleanCount(p.distinctGames),
  modelCorrect:p.modelWins,alwaysHigherCorrect:p.alwaysHigherWins,
  alwaysLowerCorrect:p.alwaysLowerWins,
  modelObservedHitRate:rate(p.modelWins),
  hypotheticalHigherObservedRate:rate(p.alwaysHigherWins),
  hypotheticalLowerObservedRate:rate(p.alwaysLowerWins),
  modelMinusHypotheticalHigher:rate(p.modelWins-p.alwaysHigherWins),
  modelLowerDecisions:cleanCount(p.lowerModelChoices),
  originalPlatformSideAvailabilityVerified:false,
  originalPlatformSettlementVerified:false,bettingEdgeVerified:false,
  futureBenchmarkPolicyRegistered:false,
  note:"Same exact archived Standard model-selected thresholds; hypothetical Higher/Lower sides not authenticated as executable original-app offers. Old cohort is descriptive and not a predeclared strategic experiment."};
}
function publicFutureSimpleStrategyAudit(report){
 if(report?.kind!=="nhl_first_git_frozen_standard_simple_challengers_v1"||
  report.status!=="original_committed_selection_benchmark_research_only"||
  report.futureOnlyOriginalSnapshots!==true||
  report.fullyFrozenFutureCohort!==true||
  report.bettingEdgeEstablished!==false||
  !Number.isInteger(report.archivedStandardSelections)||report.archivedStandardSelections<0||
  !Number.isInteger(report.decided)||report.decided<0||
  !Number.isInteger(report.pending)||report.pending<0||
  !Number.isInteger(report.pushes)||report.pushes<0||
  report.decided+report.pending+report.pushes!==report.archivedStandardSelections||
  report.originalFrozenFutureStandardSelectionCount!==report.archivedStandardSelections)
  return null;
 const names=["last5","last10","consensus5And10MarginHalf"];
 const byStrategy={};
 for(const name of names){
  const s=report.strategyComparison?.[name];
  if(!s||!Number.isInteger(s.pregameCoveredSelections)||s.pregameCoveredSelections<0||
   !Number.isInteger(s.decidedOnCoveredLines)||s.decidedOnCoveredLines<0||
   !Number.isInteger(s.abstainedOnAllOriginalStandardSelections)||s.abstainedOnAllOriginalStandardSelections<0||
   s.pregameCoveredSelections+s.abstainedOnAllOriginalStandardSelections!==
    report.archivedStandardSelections||s.decidedOnCoveredLines>s.pregameCoveredSelections||
   !Number.isInteger(s.challengerWins)||s.challengerWins<0||s.challengerWins>s.decidedOnCoveredLines||
   !Number.isInteger(s.modelWinsOnSameCoveredLines)||s.modelWinsOnSameCoveredLines<0||
   s.modelWinsOnSameCoveredLines>s.decidedOnCoveredLines)return null;
  const publish=s.decidedOnCoveredLines>=10&&s.distinctCompletedGames>=5;
  byStrategy[name]={
   covered:s.pregameCoveredSelections,decided:s.decidedOnCoveredLines,
   abstained:s.abstainedOnAllOriginalStandardSelections,
   distinctGames:cleanCount(s.distinctCompletedGames),
   challengerCorrect:publish?s.challengerWins:null,
   modelCorrectOnSameLines:publish?s.modelWinsOnSameCoveredLines:null,
   challengerHitRate:publish?Number((s.challengerWins/s.decidedOnCoveredLines).toFixed(4)):null,
   modelHitRateOnSameLines:publish?Number((s.modelWinsOnSameCoveredLines/s.decidedOnCoveredLines).toFixed(4)):null,
   smallSampleWithheld:!publish};
 }
 return {kind:"public_nhl_future_frozen_simple_strategies_v1",
  originalFrozenStandardSelections:report.archivedStandardSelections,
  decided:report.decided,pending:report.pending,pushes:report.pushes,
  distinctGames:cleanCount(report.distinctGames),
  byStrategy,
  originalBookSidesAuthenticated:false,originalBookSettlementVerified:false,
  modelPromotionAuthorized:false,bettingEdgeVerified:false,
  note:"Only future original Git-precommitted Standard model-selected opportunities. Challenger sides were frozen with the original model before games. Includes abstentions, withholds rates for small samples, and does not compare full-board strategy budgets or verified platform returns."};
}
function auditScorecard({cohort,baselineChallenge,simpleChallenger}={}){
 const verified=cohort?.cohortVerified===true&&
  cohort.status==="verified_original_pregame_registry_aggregates"&&
  cleanCount(cohort.counts?.registered)>0&&
  cohort.counts.registered===cohort.counts.correct+cohort.counts.incorrect+
   cohort.counts.push+cohort.counts.pending;
 const c=verified?cohort.counts:null;
 const decided=c?c.correct+c.incorrect:0;
 return {status:verified?"original_frozen_predictions_official_stat_grading":
   "no_verified_reconciled_original_frozen_cohort",
  precommitted:verified?c.registered:null,
  correct:verified?c.correct:null,incorrect:verified?c.incorrect:null,
  push:verified?c.push:null,pending:verified?c.pending:null,
  decided:verified?decided:null,
  observedHitRate:verified&&decided>=10?Number((c.correct/decided).toFixed(4)):null,
  wilson95:verified&&decided>=10?wilson95(c.correct,decided):null,
  standardSameLineBenchmark:verified?publicStandardBaseline(baselineChallenge,c):null,
  futureSimpleStrategyAudit:verified?publicFutureSimpleStrategyAudit(simpleChallenger):null,
  byMarket:verified?cohort.byMarket.filter(g=>g?.decided>=10).slice(0,15)
   .map(g=>({market:g.group,decided:g.decided,correct:g.correct,push:g.push,
    pending:g.pending,observedRate:g.observedRate})):[],
  prospectiveCalibrationValidated:false,originalPrizePicksSettlementVerified:false,
  verifiedPayoutEV:false,rawOfferedSidesNotModelPicks:true,
  note:"Descriptive official NHL stat outcomes of original pregame model decisions, never fantasy-app settlement or profitability."};
}
function auditLineups({lineups,at}={}){
 const now=asTime(at);if(now===null)throw Error("Invalid report clock");
 const tally=new Map(),sizes=[],status=[];
 for(const size of [2,3,4,5,6]){
  const l=lineups?.[size],p=l?.picks;
  if(!Array.isArray(p)||p.length!==size){status.push({size,status:"unavailable"});continue;}
  const players=new Set(),matchups=new Map();let valid=true;
  for(const row of p){
   const id=[String(row?.player||"").trim().toLowerCase(),String(row?.team||"").trim().toLowerCase()].join("|");
   if(!row?.player||!row?.team||players.has(id)||asTime(row?.eventStartsAt)===null||
     Date.parse(row.eventStartsAt)<=now||asTime(row?.capturedAt)===null||
     Date.parse(row.capturedAt)>now||now-Date.parse(row.capturedAt)>30*60000)valid=false;
   players.add(id);tally.set(id,(tally.get(id)||0)+1);
   if(row?.matchup)matchups.set(row.matchup,(matchups.get(row.matchup)||0)+1);
  }
  const sameGame=[...matchups.values()].some(x=>x>1);
  status.push({size,status:valid?"research_only_source_timestamp_checked":"stale_or_structurally_unverified",
   distinctPlayers:players.size,sameGameOverlap: sameGame,
   originalPayoutVerified:false,jointProbabilityVerified:false});
  sizes.push(size);
 }
 const overlap=[...tally.values()];
 return {lineupSizesWithResearchCards:sizes,bySize:status,
  crossLineupUniquePlayers:tally.size,
  crossLineupPlayersRepeated:overlap.filter(x=>x>1).length,
  maxLineupAppearancesForOnePlayer:Math.max(0,...overlap),
  correlationCoefficientsValidated:false,portfolioJointRiskVerified:false,
  verifiedPayoutEV:false,automaticallyPlaceWagers:false,
  note:"Cross-lineup player overlap is concentration, not a measured joint outcome probability. Stale lineups are research history, never currently available entries."};
}
function buildSixPriorityBrief({at,board,morningAudit,movement,history,officialCoverage,walkforward,publicProps,cohort,baselineChallenge,simpleChallenger,lineups}={}){
 if(asTime(at)===null)throw Error("Missing valid timestamp for six-priority release");
 return {schemaVersion:1,kind:"public_nhl_six_priority_evidence_brief_v1",
  generatedAt:at,operations:auditMorning({at,board,morningAudit}),
  movements:auditMovement({movement}),
  scorecard:auditScorecard({cohort,baselineChallenge,simpleChallenger}),
  markets:auditModels({history,officialCoverage,walkforward,publicProps}),
  lineupRisk:auditLineups({lineups,at}),
  website:{status:"research_only",missingSourceShownAsUnavailable:true,
   originalPlatformOffersVerified:false,modelSourceCodePublic:false},
  originalPlatformPayoutVerified:false,verifiedReturnOnInvestment:false,
  noWagersPlaced:true};
}
module.exports={MARKET_FIELDS,auditMorning,auditMovement,officialSamples,
 auditModels,auditScorecard,auditLineups,buildSixPriorityBrief};
