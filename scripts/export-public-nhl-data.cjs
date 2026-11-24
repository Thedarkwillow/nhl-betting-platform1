"use strict";
const fs=require("node:fs"),path=require("node:path");
const {optimize}=require("../src/nhl-lineup-optimizer.cjs");
const {officialSamples}=require("../src/nhl-six-priority-evidence-brief.cjs");
const {watchdog}=require("../src/nhl-morning-board-monitor.cjs");
const {buildNhlSevenReadiness}=require("../src/nhl-seven-roadmap-readiness.cjs");
const {buildPlayerInsights}=require("../src/nhl-public-research-extensions.cjs");
const {addEvidence,summarizeModelResearch}=require("../src/nhl-research-evidence.cjs");
const {assessPropRisk}=require("../src/nhl-usage-goalie.cjs");
const {applyPregameSignal}=require("../src/nhl-pregame-intel.cjs");
const {SOURCE_CATALOG,attachMatchups}=require("../src/nhl-matchup-scout.cjs");
const root=path.resolve(__dirname,"..");
function read(p){try{return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}catch{return null;}}
function buildPublicData(now=new Date().toISOString()){
 const free=read("outputs/free-source/nhl/research-latest.json");
 const preview=read("outputs/free-source/nhl/research-preview-latest.json");
 const independent=read("outputs/free-source/nhl/latest.json");
 const old=read("outputs/research/nhl-latest.json");
 if(!free&&!old)throw Error("No research output available");
 // A new independent board does NOT refresh earlier model predictions.
 // Demand exact immutable source lineage and a fresh independently derived
 // preview, or a matching Git-frozen original research snapshot.
 const nowAt=Date.parse(now),sourceAt=Date.parse(independent?.generatedAt);
 const verifiedSource=Number.isFinite(sourceAt)&&sourceAt<=nowAt&&
  nowAt-sourceAt<=30*60000&&independent?.provider==="prizepicksapi.com"&&
  independent.completePagination===true&&independent.sourceStatus==="fresh";
 const matchesSource=r=>verifiedSource&&Number.isFinite(Date.parse(r?.generatedAt))&&
  Date.parse(r.generatedAt)<=nowAt&&nowAt-Date.parse(r.generatedAt)<=30*60000&&
  r.boardGeneratedAt===independent.generatedAt&&r.boardFresh===true&&
  r.projectionsFresh===true&&r.boardCoverageComplete===true;
 const previewCurrent=matchesSource(preview)&&
  preview.snapshotKind==="nhl_independent_source_model_preview_v1"&&
  preview.prospectiveCohort===false&&preview.eligibleForOfficialProspectiveGrading===false;
 const frozenCurrent=matchesSource(free)&&
  free.individualPropSelectionPolicy==="nhl-individual-prop-max-available-direction-v1";
 const research=previewCurrent?preview:frozenCurrent?free:old||free;
 const usingFree=previewCurrent||frozenCurrent;
 const board=usingFree?independent:read("outputs/board-merged/prizepicks-nhl-latest.json");
 const legacyMovement=read("outputs/line-movement/nhl-latest.json");
 const freeMovement=read("outputs/free-source/nhl/movement-latest.json");
 const grading=read("outputs/grading/nhl-latest.json");
 const originalPrecommitLedger=read("outputs/research/registry/nhl-precommitted-ledger-latest.json");
 const privateProbabilityValidation=read("outputs/health/nhl-prospective-validation-latest.json");
 const sourceCoverageAudit=read("outputs/health/nhl-source-coverage-latest.json");
 const usage=read("outputs/nhl-usage/latest.json");
 const distributionAudit=read("outputs/backtests/nhl-count-distribution-shadow-latest.json");
 const distributionFrozen=read("outputs/projections/distribution-shadow-latest.json");
 const approvedSources=read("outputs/approved-nhl-sources/latest.json");
 const approvedSourceShadow=read("outputs/projections/approved-source-shadow-latest.json");
 const dfoRoleShadow=read("outputs/projections/dfo-role-goalie-shadow-latest.json");
 const goalieStarterAudit=read("outputs/backtests/nhl-dfo-goalie-starter-audit-latest.json");
 const platformLineShop=read("outputs/comparisons/nhl-platform-line-shop-latest.json");
 const moneyPuckHistoryLab=read("outputs/backtests/nhl-moneypuck-historical-game-lab-latest.json");
 const goalieHistoryLab=read("outputs/backtests/nhl-moneypuck-goalie-history-latest.json");
 const approvedShadowScorecard=read("outputs/backtests/nhl-approved-source-prospective-latest.json");
 const distributionGitProof=read("outputs/backtests/nhl-distribution-pregame-proof-latest.json");
 const pregame=read("outputs/pregame-availability/latest.json");
 const leagueStatus=read("outputs/pregame-availability/official-preview-latest.json");
 const standardAlternate=read("outputs/the-odds-api/nhl/2025-26-all-props/standard-alternate-matches-latest.json");
 const allMarketProgress=read("outputs/the-odds-api/nhl/2025-26-all-props/progress.json");
 const fallMarketProgress=read("outputs/the-odds-api/nhl/2025-26-fall-backfill/progress.json");
 const tierIndicators=read("outputs/the-odds-api/nhl/2025-26-tier-indications-latest.json");
 const historicalPuck=read("outputs/puckapi/nhl/backtest-latest.json");
 const historicalPP=read("outputs/oddspapi/nhl/archive-expanded-latest.json")||
   read("outputs/oddspapi/nhl/archive-probe-latest.json");
 const ppAudit=read("outputs/oddspapi/nhl/outcome-audit-latest.json");
 const ppModel=read("outputs/oddspapi/nhl/retrospective-model-latest.json");
 const seasonLab=read("outputs/backtests/nhl-official-season-projection-lab-latest.json");
 const quoteLab=read("outputs/backtests/nhl-archived-line-challenger-latest.json");
 const auditMatchesArchive=ppAudit?.archiveGeneratedAt===historicalPP?.generatedAt;
 const modelMatchesAudit=auditMatchesArchive&&ppModel?.lineOutcomeAuditGeneratedAt===ppAudit?.generatedAt;
 const cmp=read("outputs/comparisons/nhl-latest.json");
 const sportsbook=read("outputs/sportsbooks/latest.json");
 const sgoHistory=read("outputs/sportsgameodds/nhl/closing-coverage-latest.json");
 const fullNhlCoverage=read("outputs/sportsgameodds/nhl/full-game-coverage/coverage-latest.json");
 const independentNhlGrading=read("outputs/sportsgameodds/nhl/official-outcome-grading/summary-latest.json");
 const independentTierEvidence=read("outputs/research/prizepicks-tier-evidence-latest.json");
 const officialGameSchedules=["2023-24","2024-25","2025-26","2026-27"].map(season=>{
  const document=read("outputs/official-nhl/season-schedules/"+season+".json");
  return {season,officialCompletedGames:document?.finalGames??null,
   officialGamesOnSchedule:document?.games?.length??null,
   teamSchedulesComplete:document?.complete===true};
 });
 // Auditable daily on-time 06:00 and 09:00 board evidence comes from
 // immutable source archive files, not a green GitHub job or stale watchdog.
 // Only small official NHL market coverage aggregates enter private site data.
 const playerHistory=read("outputs/history/players.json");
 const marketHistoricalCoverage=officialSamples(playerHistory);
 let morningArchiveAudit=null;
 try{
  const snapshotDir=path.join(root,"outputs/free-source/nhl/snapshots");
  const archivePaths=fs.readdirSync(snapshotDir)
   .filter(f=>/^\d{8}T\d{6}Z\.json$/.test(f))
   .map(f=>path.join(snapshotDir,f));
  morningArchiveAudit=watchdog({now,files:archivePaths,
   readFile:file=>fs.readFileSync(file,"utf8"),movement:freeMovement});
 }catch{morningArchiveAudit=null;}
 const nowMs=Date.parse(now);
 // The free-feed and bookmaker jobs complete independently. Safely recompute
 // matches from their *currently archived* fresh records at export time.
 const bookAt=Date.parse(sportsbook?.generatedAt);
 const marketFresh=Number.isFinite(bookAt)&&bookAt<=nowMs&&nowMs-bookAt<=4*3600000;
 const researchAt=Date.parse(research.generatedAt);
 const activeResearch=Number.isFinite(researchAt)&&researchAt<=nowMs&&nowMs-researchAt<=8*3600000;
 let comparison=null;
 if(marketFresh&&activeResearch&&Array.isArray(sportsbook?.rows)){
  const {compare}=require("../src/nhl-market-comparison.cjs");
  const live=compare(research.rankedProps||[],sportsbook.rows,now);
  comparison={generatedAt:now,researchGeneratedAt:research.generatedAt,
   sportsbookGeneratedAt:sportsbook.generatedAt,researchFresh:true,sportsbookFresh:true,
   ...live,comparisons:live.comparisons.map(x=>({...x,
    absoluteModelMarketGap:Number.isFinite(x.modelHigher)?Math.abs(x.modelHigher-x.sportsbookHigher):null}))};
 }else if(cmp&&Date.parse(cmp.researchGeneratedAt)>=Date.parse(research.generatedAt)-60000&&
           Date.parse(cmp.generatedAt)<=nowMs&&nowMs-Date.parse(cmp.generatedAt)<=4*3600000){
  comparison=cmp;
 }
 const epoch=Date.parse(now),fresh=t=>Number.isFinite(Date.parse(t))&&Date.parse(t)<=epoch&&epoch-Date.parse(t)<=8*3600000;
 const valid=p=>fresh(p.capturedAt)&&(!p.eventStartsAt||Date.parse(p.eventStartsAt)>epoch);
 const rawProps=(research.rankedProps||[]).filter(valid).map(p=>({
  player:p.player,playerId:p.playerId,gameId:p.gameId??null,team:p.team,market:p.market,line:p.line,tier:p.tier,
  lean:p.lean,probability:p.probability,projection:p.projection,observations:p.observations,
  matchup:p.matchup,opponent:p.opponent??null,capturedAt:p.capturedAt,
  observedAt:p.observedAt,
  verifiedThirdPartyBoardMembershipAt:p.verifiedThirdPartyBoardMembershipAt??null,
  eventStartsAt:p.eventStartsAt??null,
  probabilityCalibrated:false,verified:false,expectedValue:null,
  researchEligibility:p.researchEligibility||"research_only",
  roleEvidence:p.roleEvidence?{
   classification:p.roleEvidence.classification,
   reasons:p.roleEvidence.reasons||[],
   historicalToiGames:p.roleEvidence.usage?.observations??0,
   expectedMinutesShadow:p.roleEvidence.usage?.expectedMinutesShadow??null,
   goalieSavesPer60Shadow:p.roleEvidence.usage?.goalieSavesPer60Shadow??null,
   injuryStatus:p.roleEvidence.injuryStatus||"unknown",starterStatus:p.roleEvidence.starterStatus||"unconfirmed",
   verifiedBettingReadiness:false
  }:null,
  source:usingFree?"Independent PrizePicks API":p.source||"Archived board"
 }));
 const rawComparisons=(comparison?.comparisons||[]).filter(()=>fresh(comparison?.generatedAt)).map(p=>({
  player:p.player,playerId:p.playerId,team:p.team,market:p.market,line:p.line,tier:p.tier,
  modelHigher:p.modelHigher,sportsbookHigher:p.sportsbookHigher,
  absoluteModelMarketGap:p.absoluteModelMarketGap??Math.abs((p.modelHigher??0)-p.sportsbookHigher),
  books:(p.books||[]).map(b=>b.book),comparisonOnly:true
 }));
 // The public exporter may run after new official TOI history is archived,
 // before the next independent provider scrape. Enforce newer role-risk guards
 // without rewriting an archived original pregame prop or its model probability.
 const roleReviewed=rawProps.map(p=>{
  const risk=assessPropRisk({playerId:p.playerId,type:p.market==="saves"?"goalie":"skater"},
   usage,p.eventStartsAt,p.market);
  const priorWatch=p.researchEligibility==="watchlist";
  return {...p,researchEligibility:priorWatch?"watchlist":risk.classification,
   roleEvidence:{classification:priorWatch?"watchlist":risk.classification,
    reasons:[...new Set([...(p.roleEvidence?.reasons||[]),...risk.reasons])],
    historicalToiGames:risk.usage?.observations??0,
    expectedMinutesShadow:risk.usage?.expectedMinutesShadow??null,
    goalieSavesPer60Shadow:risk.usage?.goalieSavesPer60Shadow??null,
    injuryStatus:"unknown",starterStatus:"unconfirmed",verifiedBettingReadiness:false}};
 });
 // Apply current external source reports only to a separate view/pick list;
 // immutable archived original pregame predictions remain untouched.
 const pregameReviewed=roleReviewed.map(p=>applyPregameSignal(p,pregame,now)).map(p=>require("../src/nhl-league-published-status.cjs").applyNhlLeagueStatus(p,leagueStatus,now).blocked?{...p,researchEligibility:"watchlist"}:p);
 const {props:evidencedProps,summary:evidenceSummary}=addEvidence(pregameReviewed,rawComparisons);
 const {props,summary:matchupScoutSummary}=attachMatchups(evidencedProps,{
  usage,history:read("outputs/history/players.json")});
 const comparisons=rawComparisons;
 const lineups=optimize(props,{at:now,limit:35});
 // Primary NHL board: Only explicitly captured standalone research preferences.
 // Never turn BOTH offered source directions into two recommendations, and
 // never invent a current offer from an expired provider source.
 const selectedKey=p=>[p.gameId,p.playerId,p.market,p.line,p.tier,p.lean].join("|");
 const displayProps=new Map(props.filter(p=>p.researchEligibility!=="watchlist"&&
  Number.isInteger(p.gameId)).map(p=>[selectedKey(p),p]));
 const sourceFreshForFeatured=usingFree&&research.individualPropSelectionPolicy===
  "nhl-individual-prop-max-available-direction-v1"&&
  Array.isArray(research.individualPropSelections)&&
  research.boardFresh===true&&research.projectionsFresh===true&&
  Number.isFinite(researchAt)&&researchAt<=epoch&&epoch-researchAt<=90*60000;
 const featuredIndividualProps=(sourceFreshForFeatured?research.individualPropSelections:[])
  .filter(p=>Number.isFinite(p.probability)&&p.probability>0.5&&
   p.marketStatus==="research_only"&&p.originalPlatformSettlementVerified===false&&
   Number.isFinite(Date.parse(p.capturedAt))&&Date.parse(p.capturedAt)<=epoch&&
   epoch-Date.parse(p.capturedAt)<=90*60000&&Date.parse(p.eventStartsAt)>epoch)
  .map(p=>{
   const v=displayProps.get(selectedKey(p));
   return !v?null:{player:v.player,playerId:v.playerId,team:v.team,gameId:v.gameId,
    market:v.market,line:v.line,tier:v.tier,lean:v.lean,
    probability:v.probability,projection:v.projection,
    observations:v.observations,opponent:v.opponent,matchup:v.matchup,
    eventStartsAt:v.eventStartsAt,sourceCapturedAt:v.capturedAt,
    researchEligibility:v.researchEligibility,
    bookEvidence:v.evidence?.status||"unverified",
    modelProbabilityCalibrated:false,originalPlatformSettlementVerified:false,
    expectedValue:null,selectionPolicy:"highest_available_offered_side_above_50pct"};
  }).filter(Boolean).sort((a,b)=>b.probability-a.probability||
   b.observations-a.observations).slice(0,8);
 const historicalModelResearch=quoteLab?.inputAuditGeneratedAt===ppAudit?.generatedAt?
  summarizeModelResearch(seasonLab,quoteLab):null;
 const movement=usingFree?freeMovement:legacyMovement;
 const boardAt=board?.generatedAt||null;
 const data={
  builtAt:now,researchAt:research.generatedAt,boardAt,comparisonAt:comparison?.generatedAt||null,
  dataProvider:usingFree?"prizepicksapi.com independent feed":"Legacy collected PrizePicks board",
  liveResearchOrigin:previewCurrent?"independent_nonprecommitted_model_preview":
   frozenCurrent?"original_git_frozen_source_research":"archived_only",
  previewResearchProps:previewCurrent?props.filter(p=>
   p.researchEligibility!=="watchlist"&&p.tier==="Standard"&&
   p.probability>0.5).slice(0,8):[],
  providerIndependentlyVerified:false,
  boardCoverageComplete:usingFree?false:board?.coverageComplete===true,
  boardCoverage:usingFree?{apiPaginationComplete:board?.completePagination===true,independentBoardCoverageUnverified:true}:{
   complete:board?.completeCategories??0,total:board?.discoveredCategories??0,
   partial:board?.partialCategories??0,fresh:board?.freshCategories??0,
   rejectedRows:board?.rejectedRows??null},
  researchFreshAtBuild:fresh(research.generatedAt)&&research.boardFresh===true&&research.projectionsFresh===true,
  comparisonFreshAtBuild:comparison?.researchFresh===true&&comparison?.sportsbookFresh===true&&fresh(comparison.generatedAt),
  // Derive PUBLIC aggregates from these PRIVATE inputs under strict allowlist.
  originalPrecommitLedger,sourceCoverageAudit,privateProbabilityValidation,
  playerInsights:buildPlayerInsights(props,playerHistory),
   sixPriorityPrivateInputs:{
    board:independent?{
      generatedAt:independent.generatedAt,
      provider:independent.provider,independentProvider:independent.independentProvider,
      sourceStatus:independent.sourceStatus,completePagination:independent.completePagination,
      quotaUnit:independent.quotaUnit,creditsRemaining:independent.creditsRemaining
    }:null,
    morningAudit:morningArchiveAudit,
    officialCoverage:{kind:"official_nhl_market_coverage_counts_v1",
      markets:marketHistoricalCoverage},
    walkforward:read("outputs/backtests/nhl-priority-market-walkforward-latest.json"),
    baselineChallenge:read("outputs/health/nhl-frozen-baseline-challenge-latest.json"),
    simpleChallenger:read("outputs/health/nhl-frozen-simple-challengers-latest.json")
   },
  matchedProps:props.length,comparisonCount:comparisons.length,props,comparisons,lineups,
  featuredIndividualProps,featuredPropsSourceFresh:sourceFreshForFeatured,
  featuredPropsPolicy:"nhl-individual-prop-max-available-direction-v1",
  featuredPropsInfo:"Explicitly archived individual model preferences, not validated betting recommendations. Original platform availability, tier payouts and expected value unverified.",
  evidenceSummary,historicalModelResearch,
  platformLineShopping:platformLineShop?.kind==="nhl_cross_platform_line_shop_research_v1"?{
   generatedAt:platformLineShop.generatedAt,status:platformLineShop.status,
   prizePicksObservedProps:platformLineShop.prizePicksObservedProps,
   underdogObservedProps:platformLineShop.underdogObservedProps,
   officialIdentityMatchedPairs:platformLineShop.standardSideMatches,
   derivedDisplayAuthorized:platformLineShop.underdogPublicDerivedDisplayAuthorized===true,
   comparedLines:platformLineShop.underdogPublicDerivedDisplayAuthorized===true?
    (platformLineShop.publicComparisons||[]).slice(0,50):[],
   sourceFreshAtBuild:Number.isFinite(Date.parse(platformLineShop.generatedAt))&&
    Date.parse(platformLineShop.generatedAt)<=epoch&&epoch-Date.parse(platformLineShop.generatedAt)<=30*60000,
   originalPlatformSettlementVerified:false
  }:{status:"underdog_feed_not_connected",prizePicksObservedProps:0,underdogObservedProps:0,
    comparedLines:[],officialIdentityMatchedPairs:0,derivedDisplayAuthorized:false,
    sourceFreshAtBuild:false,originalPlatformSettlementVerified:false},
  dfoRoleGoalieShadow:dfoRoleShadow?.kind==="nhl_dfo_role_goalie_conditional_shadow_v1"?{
   asOf:dfoRoleShadow.asOf,skaterProjectedRoleCandidates:dfoRoleShadow.counts?.skaterRoleCandidates||0,
   conditionalGoalieSaveCandidates:dfoRoleShadow.counts?.conditionalGoalieCandidates||0,
   reporterConfirmedGoalieCandidates:dfoRoleShadow.counts?.dfoReporterConfirmedGoalieCandidates||0,
   excludedReasons:dfoRoleShadow.counts?.exclusions||{},
   modelDeployed:false,roleCoefficientsCalibrated:false,clubStarterVerified:false
  }:null,
  goalieStarterAudit:goalieStarterAudit?.kind==="nhl_dfo_goalie_report_official_start_audit"?{
   generatedAt:goalieStarterAudit.generatedAt,gradedOfficialStarts:goalieStarterAudit.gradedStarts,
   reporterConfirmedVerifiedAfterFinal:goalieStarterAudit.dfoConfirmedReportsVerifiedAfterFinal,
   reportedConfirmedActualStarts:goalieStarterAudit.reportedConfirmedActualStarts,
   reportedConfirmedNotActualStarts:goalieStarterAudit.reportedConfirmedNotActualStarts,
   starterFlagUnavailable:goalieStarterAudit.officialStarterFlagMissing,
   pendingOfficialResults:goalieStarterAudit.pendingOfficialFinalAppearance,
   originalPregameTeamStarterAuthenticated:false,starterProbabilityCalibrated:false
  }:null,
  historicalGoalieShotQuality:goalieHistoryLab?.kind==="nhl_moneypuck_goalie_conditional_playing_retro_ablation"?{
   season:goalieHistoryLab.holdoutSeason,goalieAppearances:goalieHistoryLab.eligibleGoalieAppearances,
   games:goalieHistoryLab.distinctGames,championMae:goalieHistoryLab.championMae,
   shotQualityMae:goalieHistoryLab.shotQualityMae,
   conditionalOnAppearance:true,confirmedStarterProbability:false,modelDeployed:false
  }:null,
  historicalShotQualityStudy:moneyPuckHistoryLab?.kind==="moneypuck_historical_skater_shot_quality_walkforward"?{
   season:moneyPuckHistoryLab.holdoutSeason,evaluatedForecasts:moneyPuckHistoryLab.evaluatedForecasts,
   byMarket:moneyPuckHistoryLab.byMarket,
   modelPromoted:false,pregameOriginalBetsRecorded:false
  }:null,
  approvedSourceScorecard:approvedShadowScorecard?.kind==="nhl_money_puck_dfo_prospective_shadow_scorecard"?{
    generatedAt:approvedShadowScorecard.generatedAt,
    sourceSnapshots:approvedShadowScorecard.sourceSnapshotsProcessed,
    verifiedOfficialFinalDecisions:approvedShadowScorecard.matchedDecisions,
    matchedOfficialGames:approvedShadowScorecard.distinctGames,
    pendingRows:approvedShadowScorecard.pendingRows,
    excludedRows:approvedShadowScorecard.excludedRows,
    reasons:approvedShadowScorecard.excludedReasons,
    brier:approvedShadowScorecard.grade?.overall?.brier||null,
    mae:approvedShadowScorecard.grade?.overall?.mae||null,
    logLoss:approvedShadowScorecard.grade?.overall?.logLoss||null,
    byMarket:approvedShadowScorecard.grade?.byMarket||{},
    modelPromoted:false,calibrationVerified:false,
    originalPlatformOfferAuthenticated:false,platformSettlementVerified:false,
    independentServerPushReceiptVerified:false,
    warning:"Only Git-frozen pregame forecasts matched to official NHL FINAL stats are scored; missing games/players remain pending or excluded. Brier, MAE and log loss are experimental and do not establish reliable betting probabilities, settled payouts or profitability."
  }:null,
  approvedSourceResearch:approvedSources?.kind==="approved_nhl_source_research_snapshots"?{
   sourceCapturedAt:approvedSources.generatedAt,
   lastObservedMoneyPuck:approvedSources.moneyPuck?.sourceFileLastModified||null,
   moneyPuckSkaters:approvedSources.moneyPuck?.skaters?.matchedRows||0,
   moneyPuckGoalies:approvedSources.moneyPuck?.goalies?.matchedRows||0,
   moneyPuckTeams:approvedSources.moneyPuck?.teams?.matchedRows||0,
   dailyFaceoffUpcomingGames:approvedSources.dailyFaceoff?.games?.length||0,
   dailyFaceoffGoalieReports:approvedSources.dailyFaceoff?.goalieReports||0,
   dailyFaceoffReporterConfirmed:approvedSources.dailyFaceoff?.reporterConfirmed||0,
   dailyFaceoffLineTeams:approvedSources.dailyFaceoff?.lineTeams||0,
   sourceWarnings:approvedSources.provenance?.errors?.length||0,
   shadowAsOf:approvedSourceShadow?.asOf||null,
   shadowCandidateRows:approvedSourceShadow?.counts?.shadowRows||0,
   shotQualityProbabilitiesDeployed:false,officialClubGoalieStarterVerified:false,
   forwardAndPowerPlayUnitsProjectedOnly:true,
   sourcePermissionsUserReported:true,userConfirmedAutomationAndCommercialUse:true,writtenCommercialTermsVerified:false,
   originalExactPlatformSettlementVerified:false,prospectiveModelAccuracyEstablished:false,
   warning:"MoneyPuck season-to-date CSV and DFO projected lines are privately cached for uncalibrated research; their sources are user-approved but commercial redistribution terms are not documented in this repository. Research shadow never changes live NHL picks. No historical outcome reuse from postgame season summaries."
  }:null,
  distributionResearch:distributionAudit?.kind==="nhl_real_quote_poisson_vs_overdispersion_shadow"?{
    generatedAt:distributionAudit.generatedAt,sourceMatchedQuoteRows:distributionAudit.actualArchivedQuoteRows,
    overall:distributionAudit.overall,bySeason:distributionAudit.bySeason,byMarket:distributionAudit.byMarket,
    gameClusterDifferenceInterval:distributionAudit.gameClusterDifferenceInterval,
    prospectiveVerified:false,probabilityCalibrated:false,
    actualPlatformSettlementVerified:false,commercialExternalShotQualityImported:false,
    liveChampionStill:"poisson-v0",candidateOnly:"negative-binomial-shrink-v1",
    modelPromoted:false,
    warning:"Retrospectively recomputed from only a sampled historical PrizePicks-labelled real quote archive with official NHL game outcomes. 220 rows across 21 games do not establish a transferable improvement, live win probability or betting profitability."
  }:null,
  distributionProspectiveArchiveAudit:distributionGitProof?.kind==="nhl_distribution_shadow_pregame_archive_proof"?{
   asOf:distributionGitProof.generatedAt,
   auditedSnapshots:distributionGitProof.snapshots,
   sourceObservedQuoteRows:distributionGitProof.totalOfferedRows,
   gitAndOfficialStartMatchedRows:distributionGitProof.gitAndOfficialStartMatchedRows,
   timingRejectedRows:distributionGitProof.rejectedRows,
   officialResultsGraded:false,independentlyAuthenticatedOriginalPlatformOffers:false,
   verifiedOriginalPrizePicksSettlement:false,calibratedProbabilities:false,
   caveat:"Git committer-time versus official NHL start and source timing checked; independent GitHub server push receipt and platform offer authentication still needed. Future NHL final outcomes pending."
  }:null,
  distributionShadowArchive:distributionFrozen?.kind==="nhl_live_distribution_shadow_unconfirmed_git_archive"?
   {asOf:distributionFrozen.generatedAt,
    frozenOfferRows:Array.isArray(distributionFrozen.rows)?distributionFrozen.rows.length:0,
    matchesCurrentResearch:distributionFrozen.generatedAt===research.generatedAt,
    gitCommitBeforePuckDropProven:false,
    originalPlatformSettlementVerified:false,liveLineupsAffected:false}:null,
  matchupResearch:{sources:SOURCE_CATALOG,
   ...matchupScoutSummary,
   methodology:"Past-only official NHL player TOI rates and opponent total-stat volumes; research only",
   thirdPartyDataAccessAuthorized:false,
   externalSitesUsedForLinksOnly:SOURCE_CATALOG.filter(s=>!s.modelFeatureImported).map(s=>s.id),
   noNewModelAdjustment:true,modelChangeAllowed:false,
   warning:"Five-site NHL research library. MoneyPuck noncommercial, other proprietary site licensing unverified. No automatic copying of third-party stats; all numeric matchup fields from official NHL boxscore/game history."},
  roleContextAudit:{source:usage?.source??null,updatedAt:usage?.generatedAt??null,
   historicalGameRows:usage?.summary?.playerGames??0,
   withOfficialTOI:usage?.summary?.withToi??0,
   historicalGoalieRows:usage?.summary?.goalies??0,
   pregameGoalieStartersConfirmed:false,pregameInjuriesVerified:false,
   watchlistProps:props.filter(p=>p.researchEligibility==="watchlist").length,
   externalReportedGoalieConfirmations:pregame?.goalieReportedConfirmed??0,
   externalInjuryReports:pregame?.injuries?.length??0,
   externalInjuryWatchlist:props.filter(p=>(p.roleEvidence?.reasons||[]).some(x=>x==="EXTERNAL_INJURY_OUT_OR_IR_REPORT"||x==="EXTERNAL_INJURY_UNCERTAIN_REPORT")).length,
   externalPregameCapturedAt:pregame?.generatedAt??null,
   externalFeedFreshAtBuild:Number.isFinite(Date.parse(pregame?.generatedAt))&&
    Date.parse(pregame.generatedAt)<=epoch&&epoch-Date.parse(pregame.generatedAt)<=90*60000,
   externalCommercialLicenseVerified:false,independentTeamStarterConfirmationVerified:false,
   lineCombinationAndPowerPlayVerified:false,
   warning:"Historical official NHL TOI is not proof of upcoming starting goalie, healthy status or fantasy-platform settlement. Unconfirmed starter/major role shifts remain research watchlist only."},
  officialNhlSeasonSchedules:officialGameSchedules,
  independentNhlOfficialOutcomeGrading:independentNhlGrading?.source?.includes("Official NHL final boxscore")?{
   generatedAt:independentNhlGrading.generatedAt,
   targetGamesWithCloses:independentNhlGrading.targetGamesWithArchivedPlatformLines||0,
   gamesWithOfficialBoxscore:independentNhlGrading.gamesWithOfficialCachedBoxscores||0,
   remainingGames:independentNhlGrading.remainingGames??null,
   dateCoverageComplete:independentNhlGrading.outcomeCoverageComplete===true,
   historicalClosingLineOutcomesGraded:independentNhlGrading.gradedLineRecords||0,
   excludedDueToUncertainPlayerIdentityOrStat:independentNhlGrading.excludedLineRecords||0,
   byBookSeason:Object.entries(independentNhlGrading.replaySummary?.byBookSeason||{}).map(([key,v])=>({
    book:key.split("|")[0],season:key.split("|")[1],
    retrospectiveEvaluated:v.evaluated||0,retrospectiveCorrect:v.correct||0,
    reconstructedModelHitRate:v.retrospectiveHitRate??null,
    alwaysLowerBaseline:v.baselineAlwaysLower??null,
    alwaysHigherBaseline:v.baselineAlwaysHigher??null,
    distinctGames:v.distinctGames||0
   })),
   modelVersion:independentNhlGrading.replaySummary?.modelVersion||null,
   retrospectiveOnly:true,prospectivePredictionsVerified:false,
   originalPlatformSettlementVerified:false,
   originalScoringSnapshotVerified:false,
   dnpRebootVerified:false,originalOffersVerified:false,
   payoutVerified:false,calibrated:false,
   warning:"Current NHL boxscore-derived directions are not confirmed original PrizePicks settled outcomes (DNP, Reboot, corrections). Backtests reconstruct choices using past game stats; NOT pre-published model predictions or validated profits."
  }:null,
  independentPrizePicksTierEvidence:independentTierEvidence?.dataSource?.includes("prizepicksapi.com")?{
   generatedAt:independentTierEvidence.generatedAt,
   independentPregameTierObservations:independentTierEvidence.validObservations||0,
   counts:independentTierEvidence.observedTierValues,
   exactPayoutMultipliersVerified:independentTierEvidence.exactMultiplierRecords||0,
   firstProviderCaptureDate:independentTierEvidence.earliestTierSnapshotSource,
   originalPlatformFullHistoryVerified:false,
   olderSeasonStatus:independentTierEvidence.bySeason,
   payoutEVAvailable:false,
   warning:"Independent snapshot tier observations starting October 28 2026. No authenticated 2023–24 or 2024–25 PrizePicks tier data, exact special-line payouts or original first-party archive."
  }:null,
  fullNhlHistoricalGameCoverage:fullNhlCoverage?.bySeason?{
   generatedAt:fullNhlCoverage.generatedAt,
   kind:"official_schedule_against_independent_historical_closing_lines",
   seasons:["2025-26","2026-27"].map(season=>{
    const v=fullNhlCoverage.bySeason[season]||{};
    return {season,
     officialScheduleComplete:v.officialScheduleComplete===true,
     officialCompletedGamesTotal:v.officialCompletedGamesTotal||0,
     officialCompletedGamesInEligiblePeriod:v.officialCompletedGamesInEligiblePeriod||0,
     completedGamesInsideCheckedWindows:v.completedGamesInsideCheckedWindows||0,
     completedGamesNotYetChecked:v.completedGamesNotYetChecked||0,
     officialGamesMatchedToProvider:v.officialGamesMatchedToProvider||0,
     officialGamesWithPrizePicksClosingLines:v.officialGamesWithPrizePicksClosingLines||0,
     officialGamesWithUnderdogClosingLines:v.officialGamesWithUnderdogClosingLines||0,
     distinctPrizePicksClosingLineRecords:v.distinctPrizePicksClosingLineRecords||0,
     distinctUnderdogClosingLineRecords:v.distinctUnderdogClosingLineRecords||0,
     fullDateCoverageChecked:v.allEligibleCompletedGameDatesChecked===true,
     closingLineCoverageFull:false};
   }),
   prospectiveModelAccuracyUnchanged:true,
   originalPlatformOffersVerified:false,tiersVerified:false,
   warning:fullNhlCoverage.caution
  }:null,
  historicalProviderClosingCoverage:sgoHistory?.bySeason?{
    provider:"SportsGameOdds Pro",generatedAt:sgoHistory.generatedAt,
    type:"independent_book_level_pregame_closing_lines",
    seasons:["2025-26","2026-27"].map(season=>{
      const v=sgoHistory.bySeason[season]||{};
      return {season,windows:v.windows||0,gameObservations:v.gameObservations||0,
        prizepicksClosingLines:v.prizepicksClosingLines||0,
        underdogClosingLines:v.underdogClosingLines||0,
        ordinarySportsbookClosingLines:v.ordinarySportsbookClosingLines||0,
        windowsFullyPaginated:v.windowsFullyPaginated||0};
    }),
    sourceBookmakerProvenance:"independent_provider_only",seasonCoverageComplete:false,
    officialPrizePicksOrUnderdogVerified:false,tiersVerified:false,
    officialResultsMatched:false,modelAccuracyRecomputed:false,backtestHitRate:null,
    expectedValue:null,warning:"Independent provider supplied book-level closing lines. Only sampled calendar windows, not full seasons. Player identity, NHL outcomes and Standard/Goblin/Demon tiers require verification; not pre-published model predictions or measured betting edge."
  }:null,
  historicalPrizePicksCoverage:historicalPP?.archive?.includes("PrizePicks")?{
    kind:"partial_historical_prizepicks_archive",
    provider:"OddsPapi independent archive",
    generatedAt:historicalPP.generatedAt,
    seasons:["2025-26","2026-27"].map(season=>{
      const windows=(historicalPP.seasons||[]).filter(w=>w.season===season);
      return {season,records:windows.reduce((total,w)=>total+(w.historicalPrizePicksRows||0),0),
        sampledFixtures:windows.reduce((total,w)=>total+(w.sampledFixtures||0),0),
        windows:windows.map(w=>({from:w.from,to:w.to,records:w.historicalPrizePicksRows||0}))};
    }),
    actualPrizePicksBookmakerSource:true,rawNhlBoxScoresIncluded:false,
    allPlayerIdentitiesVerified:false,tierLabelsVerified:false,closingLineVerified:false,
    retrospectiveHitRate:null,coverageComplete:false,officialPrizePicksEndpoint:false,
    caution:"Third-party historical PrizePicks archive, sampled only. Independent game-outcome matching and retrospective model tests are reported separately when verified. Tiers and lineup payouts remain unknown."
  }:null,
  historicalPrizePicksOutcomeAudit:auditMatchesArchive?{
    status:ppAudit.status,generatedAt:ppAudit.generatedAt,
    totalLinesMatched:ppAudit.matchedLines,
    bySeason:ppAudit.bySeason,
    verifiedPlayerIdentities:ppAudit.matchedProviderPlayers,
    officialGames:ppAudit.officialGamesMatched,
    tierAccuracyAvailable:false,hitRateAvailable:false,
    warning:ppAudit.warning
  }:null,
  historicalPrizePicksModelBacktest:modelMatchesAudit?{
    kind:ppModel.kind,generatedAt:ppModel.generatedAt,
    bySeason:ppModel.bySeason,evaluated:ppModel.evaluated,
    uncertainty:ppModel.uncertainty?{all:ppModel.uncertainty.all,bySeason:ppModel.uncertainty.bySeason,byMarket:ppModel.uncertainty.byMarket,calibrated:false}:null,
    temporalModelComparison:ppModel.temporalModelComparison?{
      kind:ppModel.temporalModelComparison.kind,
      candidates:ppModel.temporalModelComparison.candidates,
      bySeason:ppModel.temporalModelComparison.bySeason,
      eligibleArchivedLines:ppModel.temporalModelComparison.eligibleArchivedLines,
      temporalHoldout:ppModel.temporalModelComparison.temporalHoldout,
      calibrated:false,verifiedProfitability:false,
      warning:ppModel.temporalModelComparison.warning
    }:null,
    directionalBenchmarks:ppModel.directionalBenchmarks?{
      all:ppModel.directionalBenchmarks.all,
      bySeason:ppModel.directionalBenchmarks.bySeason,
      byMarket:ppModel.directionalBenchmarks.byMarket,
      pairedDifferenceVsAlwaysLower95:ppModel.directionalBenchmarks.pairedDifferenceVsAlwaysLower95,
      gating:ppModel.directionalBenchmarks.gating,
      warning:ppModel.directionalBenchmarks.warning
    }:null,
    excluded:ppModel.excluded,playersSampled:ppModel.playerSeasonsFetched,
    officialNhlHistoryErrors:ppModel.logErrors?.length||0,
    sampleOnly:true,calibrated:false,prospectiveVerified:false,
    tierAccuracyAvailable:false,expectedValue:null,
    warning:ppModel.warning
  }:null,
  historicalSportsbookBacktest:historicalPuck?.summary?.kind==="historical_nhl_sportsbook_closing_line_backtest"?{
    generatedAt:historicalPuck.generatedAt,
    source:historicalPuck.summary.source,
    markets:historicalPuck.summary.markets,
    sampledPlayers:historicalPuck.summary.players?.length||0,
    seasons:historicalPuck.summary.seasons,
    overall:historicalPuck.summary.overall,
    coverage:historicalPuck.summary.coverage,
    isPrizePicks:false,
    prospectiveVerified:false,
    calibrated:false,
    warning:historicalPuck.summary.warning
  }:null,
  grading:grading?{
   generatedAt:grading.generatedAt,
   rawOfferedSidesGraded:grading.summary?.graded||0,
   rawOfferedSidesDecided:grading.summary?.decisions||0,
   rawOfferedSideCorrectRate:grading.summary?.rawOfferedSideCorrectRate??null,
   graded:grading.individualPropAudit?.explicitProspective?.graded??0,
   decisions:grading.individualPropAudit?.explicitProspective?.decided??0,
   verifiedHitRate:grading.individualPropAudit?.explicitProspective?.hitRate??null,
   pending:grading.individualPropAudit?.explicitProspective?.pending??0,
   individualPropsOnly:true,originalPlatformSettlementsVerified:false
  }:null,
  prospectiveResearchAudit:grading?{
   generatedAt:grading.generatedAt,
   source:"archived_pregame_research_snapshots_and_official_NHL_boxscores",
   accuracySource:"explicit_git_frozen_individual_prop_policy_v1",
   capturedRankedRows:grading.snapshotAudit?.totalRankedProps??null,
   eligiblePregamePredictions:grading.individualPropAudit?.explicitProspective?.uniqueSelections??0,
   rawOfferedSideEligibleRecords:grading.snapshotAudit?.eligiblePredictions??null,
   recoveredGameIdentities:grading.snapshotAudit?.recoveredGameIdentity??null,
   quarantinedMissingGameIdentities:grading.snapshotAudit?.skipped?.missingGameIdentity??null,
   excludedNoPregameProof:grading.snapshotAudit?.skipped?.notProvenPregame??null,
   excludedDuplicateSnapshots:grading.snapshotAudit?.skipped?.duplicate??null,
   gradedDecisions:grading.individualPropAudit?.explicitProspective?.decided??0,
   prospectiveCorrect:grading.individualPropAudit?.explicitProspective?.correct??0,
   prospectivePushes:grading.individualPropAudit?.explicitProspective?.pushes??0,
   verifiedProspectiveHitRate:grading.individualPropAudit?.explicitProspective?.hitRate??null,
   selectedOfficialStatsGraded:grading.individualPropAudit?.explicitProspective?.graded??0,
   selectedIndividualPending:grading.individualPropAudit?.explicitProspective?.pending??0,
   pendingTotal:grading.individualPropAudit?.explicitProspective?.pending??0,
   alwaysLowerBaseline:grading.individualPropAudit?.explicitProspective?.alwaysLowerBaseline??null,
   alwaysHigherBaseline:grading.individualPropAudit?.explicitProspective?.alwaysHigherBaseline??null,
   individualByTier:grading.individualPropAudit?.explicitProspective?.byTier||{},
   individualByMarket:grading.individualPropAudit?.explicitProspective?.byMarket||{},
   prospectiveReliability:grading.individualPropAudit?.explicitProspective?.directionalEvidence?{
    decided:grading.individualPropAudit.explicitProspective.directionalEvidence.gradedDecisions,
    distinctGames:grading.individualPropAudit.explicitProspective.directionalEvidence.distinctGames,
    observedRate:grading.individualPropAudit.explicitProspective.directionalEvidence.observedHitRate,
    wilson95:grading.individualPropAudit.explicitProspective.directionalEvidence.wilson95Unclustered,
    gameClusterBootstrap95:grading.individualPropAudit.explicitProspective.directionalEvidence.gameClusterBootstrap95,
    observedMeanModelProbability:grading.individualPropAudit.explicitProspective.directionalEvidence.meanModelProbability,
    brier:grading.individualPropAudit.explicitProspective.directionalEvidence.brier,
    logLoss:grading.individualPropAudit.explicitProspective.directionalEvidence.logLoss,
    provisionalSampleGateSatisfied:grading.individualPropAudit.explicitProspective.directionalEvidence.provisionalSampleGateSatisfied,
    independentlyVerifiedPositiveReturn:false,
    platformSettlementsVerified:false,
    modelCalibrationApproved:false,
    warning:"Prospective directional skill and probability diagnostics only. Clustered uncertainty is grouped by NHL game; model winning probabilities and payout-adjusted returns are not verified."
   }:null,
   legacyReconstructed:grading.individualPropAudit?.legacyRetrospective?{
    firstPregameProbabilityVectorPolicyAppliedAfterOutcomes:true,
    selectedUniqueProps:grading.individualPropAudit.legacyRetrospective.uniqueSelections,
    decided:grading.individualPropAudit.legacyRetrospective.decided,
    correct:grading.individualPropAudit.legacyRetrospective.correct,
    observedRate:grading.individualPropAudit.legacyRetrospective.hitRate,
    byTier:grading.individualPropAudit.legacyRetrospective.byTier,
    byMarket:grading.individualPropAudit.legacyRetrospective.byMarket,
    byGameDate:grading.individualPropAudit.legacyRetrospective.byGameDate,
    prespecifiedProspectiveStrategy:false,prospectiveHitRateVerified:false
   }:null,
   archivedOptimizerLineupCohort:grading.selectedLineupAudit?{
    selectedUniqueProps:grading.selectedLineupAudit.selectedDistinctOriginalOffers,
    decided:grading.selectedLineupAudit.decided,
    correct:grading.selectedLineupAudit.correct,
    observedRate:grading.selectedLineupAudit.observedSelectedDirectionHitRate,
    lineupJointProbabilityVerified:false
   }:null,
   rawOfferedSideDecisions:grading.summary?.decisions||0,
   rawOfferedSideCorrectRate:grading.summary?.rawOfferedSideCorrectRate??null,
   rawOfferedSidePending:grading.pending?.length||0,
   pendingReasons:null,rawOfferedSidePendingReasons:grading.prospectiveQuality?.pendingReasons||null,
   calibrationApproved:false,originalPlatformSettlementVerified:false,
   statisticalEdgeVerified:false,expectedValueAvailable:false,
   warning:"Standalone individual NHL prop preferences are graded without requiring lineup membership. Only a direction explicitly selected in an immutable pregame snapshot enters the prospective model rate. Earlier frozen probability vectors evaluated using a later-written policy are exploratory retrospective reconstruction and cannot be advertised as precommitted picks. Raw offered Higher/Lower sides are not predictions. Payouts, calibration and fantasy-platform settlements remain unverified."
  }:null,
  historicalStandardAlternateResearch:standardAlternate?{
   generatedAt:standardAlternate.generatedAt,
   season:"2025-26",source:"The Odds API independent PrizePicks-labelled historical archive",
   gameSnapshotsEligible:standardAlternate.sourceEvents||0,
   eventSnapshotsCompleted:standardAlternate.eventsCompleted||0,
   quoteRecords:standardAlternate.quotesSaved||0,
   standardAlternatePairs:standardAlternate.standardAlternatePairs||0,
   unmatchedAlternateRecords:standardAlternate.alternateMissingStandard||0,
   savedMarketCategories:Object.entries(standardAlternate.byMarket||{})
     .map(([market,count])=>({market,count})),
   goalieStandardSaves:standardAlternate.byMarket?.player_total_saves||0,
   goalieAlternateSaves:standardAlternate.byMarket?.player_total_saves_alternate||0,
   totalCreditsUsedByAllMarketCollector:allMarketProgress?.creditsSpentTotal??null,
   fallGamesChecked:fallMarketProgress?.eventQuotesChecked??null,
   fallAlternateQuotes:fallMarketProgress?.archivedOfferRows??null,
   tierIndicators:tierIndicators?.providerIndicatedTierCounts||null,
   originalTierVerified:false,originalPayoutVerified:false,
   fullSeasonCoverageVerified:false,providerComparisonsOnly:true,
   warning:"Standard/alternate historical pairs are source-labelled comparisons, not authenticated original platform offers or multipliers. Missing standards stay unmatched; provider price-indicated Goblin/Demon candidates are unverified."
  }:null,
  researchIntelligence:buildNhlSevenReadiness({
    // Source health MUST use the latest genuinely captured independent quote
    // board even when the chosen model research snapshot is older. Never
    // allow that quote board to silently refresh stale model picks.
    now,board:read("outputs/free-source/nhl/latest.json"),research:free||research,
    grading,ledger:originalPrecommitLedger,
    shadow:approvedShadowScorecard,platform:platformLineShop,
    watchdog:read("outputs/health/nhl-morning-board-watchdog.json"),
    movement:freeMovement,availability:pregame,site:read("site/data.json")
   }),
  payoutStatus:{standard:"not_verified",goblin:"not_verified",demon:"not_verified",expectedValueAvailable:false},
  lineMovement:{
    previousAt:movement?.previousAt||null,currentAt:movement?.currentAt||null,
    removalsVerified:movement?.removalsVerified===true,
    summary:usingFree?freeMovement?.summary||null:null,
    changesTruncated:(movement?.changes?.length||0)>200,
    changes:(movement?.changes||[]).slice(-200).map(c=>({type:c.type,player:c.player,team:c.team,
      market:c.market,tier:c.tier,previousTier:c.previousTier??null,previousLine:c.previousLine,line:c.line,capturedAt:c.capturedAt}))},
  disclaimer:"Research only. Uncalibrated model probabilities are not historical hit rates. Source is third-party and current PrizePicks availability is unverified. Lineups exclude same player and game but are not payout-EV or verified joint probability optimizations. No bets placed."
 };
 return data;
}
function main(){
 const data=buildPublicData();
 const out=path.join(root,"site/data.json");
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify(data,null,2)+"\n");
 console.log(JSON.stringify({source:data.dataProvider,props:data.matchedProps,
  roleWatchlist:data.roleContextAudit?.watchlistProps??0,
  archivedOfficialToi:data.roleContextAudit?.withOfficialTOI??0,
  historicalGoalies:data.roleContextAudit?.historicalGoalieRows??0,
  lineups:Object.fromEntries(Object.entries(data.lineups).map(([n,v])=>[n,!!v])),out}));
}
if(require.main===module)main();
module.exports={buildPublicData,main};
