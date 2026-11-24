"use strict";
/**
 * Private, no-provider, no-wager research report. Never publish private source
 * offers or player-specific predictions to the public repository.
 */
const fs=require("node:fs"),path=require("node:path");
const {execFileSync}=require("node:child_process");
const {originalFrames}=require("./report-nhl-standard-triple-challengers.cjs");
const {shadowFrames}=require("../src/nhl-standard-triple-challenger-grader.cjs");
const {audit}=require("../src/nhl-standard-forward-diagnostics.cjs");
const {scoreboard}=require("../src/nhl-standard-forward-scoreboard.cjs");
const {grade}=require("../src/nhl-standard-forward-calibration.cjs");
const {audit:slateValidation}=require("../src/nhl-slate-cluster-validation.cjs");
const {score:scoreRateShadow}=require("../src/nhl-forward-opponent-rate.cjs");
const {score:scoreExpandedShadow}=require("../src/nhl-forward-expanded-market.cjs");
const {grade:gradeAllTiers}=require("../src/nhl-all-tier-probability-sensitivity.cjs");
const {grade:gradeAllTierMass}=require("../src/nhl-all-tier-exact-mass-calibration.cjs");
const {audit:gradeFormats}=require("../src/nhl-lineup-format-grading.cjs");
const {grade:gradeRealAttempt}=require("../src/nhl-official-attempt-forward-grader-v1.cjs");
const ROOT=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
const OUT="outputs/health/nhl-standard-forward-improvement-latest.json";
function firstPolicyCommit(file="src/nhl-standard-forward-calibration.cjs"){
 try{
  const s=execFileSync("git",["log","--diff-filter=A","-1","--format=%cI",
   "HEAD","--",file],
   {cwd:ROOT,encoding:"utf8",timeout:10000}).trim();
  return Number.isFinite(Date.parse(s))?s:null;
 }catch{return null;}
}
function main(){
 const ledger=read("outputs/research/registry/nhl-precommitted-ledger-latest.json");
 const history=read("outputs/history/players.json");
 const frames=originalFrames();
 const diagnostic=audit(ledger);
 if(diagnostic.status!=="descriptive_original_precommitted_only")
  throw Error("Original private ledger diagnostic refused: "+diagnostic.status);
 const committed=shadowFrames(frames,history,{mode:"original_precommitted_only"});
 const paired=scoreboard(committed.rows);
 const calibration=grade(frames,history,{firstPolicyCommit:firstPolicyCommit()});
 const report={kind:"nhl_standard_forward_improvement_research_v1",
  generatedAt:new Date().toISOString(),
  dateOfLatestGradedSlate:diagnostic.latestCompletedOfficialGameDate,
  diagnostics:diagnostic,exactLineChallengerScoreboard:paired,
  prospectiveFixedCalibration:calibration,
  realOfficialSogAttemptFrozenFuture:gradeRealAttempt(frames,history),
  verifiedBlockAttemptOpportunity:require("../src/nhl-verified-block-attempt-opportunity-v1.cjs").grade(frames,history,firstPolicyCommit("src/nhl-verified-block-attempt-opportunity-v1.cjs")),
  slateClusterValidation:slateValidation(ledger,{firstPolicyCommit:firstPolicyCommit("src/nhl-slate-cluster-validation.cjs")}),
  opponentRateAllTierShadow:scoreRateShadow(frames,history,firstPolicyCommit("src/nhl-forward-opponent-rate.cjs")),
  expandedMarketAllTierShadow:scoreExpandedShadow(frames,history,firstPolicyCommit("src/nhl-forward-expanded-market.cjs")),
  allTierExactMassCalibration:gradeAllTierMass(frames,history,firstPolicyCommit("src/nhl-all-tier-exact-mass-calibration.cjs")),
  allTierProbabilitySensitivity:gradeAllTiers(frames,history,firstPolicyCommit("src/nhl-all-tier-probability-sensitivity.cjs")),
  separatePowerFlexFormatEvidence:gradeFormats(frames,history,read("outputs/official-nhl/season-schedules/2026-27.json"),{firstPolicyCommit:firstPolicyCommit("src/nhl-lineup-format-scenario.cjs")}),
  separateSpecialistIndividualEvidence:require("../src/nhl-specialist-individual-forward.cjs").audit(frames,history,read("outputs/official-nhl/season-schedules/2026-27.json"),firstPolicyCommit("src/nhl-specialist-individual-forward.cjs")),
  retrospectiveGameScriptDependence:require("../src/lineup-dependence-bounds-research.cjs").nhlProxy(history),
  retrospectiveTierCalibration:require("../src/nhl-tier-calibration-replay.cjs").study(ledger),
  retrospectiveFixedEnsemble:require("../src/nhl-fixed-ensemble-research.cjs").study(history,{schedule:read("outputs/official-nhl/season-schedules/2026-27.json")}),
  recentRateOriginalForward:require("../src/nhl-recent-rate-forward-v1.cjs").score(frames,history,firstPolicyCommit("src/nhl-recent-rate-forward-v1.cjs")),
  recentRateRetrospectiveExactLine:require("../src/nhl-recent-rate-forward-v1.cjs").score(frames,history,null,{retrospective:true}),
  dedicatedSpecialtyHistoricalResearch:require("../src/nhl-dedicated-specialty-lab.cjs").study(history),
  originalMarketTierSideReliability:require("../src/market-evidence-quality.cjs").reliability(ledger.records),
  originalCommitExclusions:committed.excluded,
  researchOnly:true,originalChampionUnchanged:true,
  gradedFromFirstGitProofOnly:true,noRetrospectiveChallengerAttribution:true,
  noLiveProbabilityPromotion:true,calibrated:false,
  independentlyVerifiedOriginalPlatformSettlement:false,
  payoutAdjustedROI:null,automatedWagersPlaced:0,
  blockers:["insufficient_independent_forward_games",
   "no_cluster_robust_challenger_superiority",
   "no_heldout_calibrator_approval",
   "platform_payout_and_settlement_unverified",
   "provider_offer_offered_side_not_app_authenticated"],
  note:"One bad slate does not justify Higher/Lower reversal. Reassess only after independently frozen prospective results, calibrated probability validation and app-settlement evidence."};
 // These policies are frozen only after their first Git commit. Earlier
 // outcomes are never used as prospective validation of the new rules.
 report.strictStandardAgreementFutureV1=require("../src/nhl-standard-future-agreement-v1.cjs")
   .grade(frames,history,firstPolicyCommit("src/nhl-standard-future-agreement-v1.cjs"));
 report.goblinPastOnlyCalibrationFutureV1=require("../src/nhl-goblin-past-only-calibration-v1.cjs")
   .grade(frames,history,firstPolicyCommit("src/nhl-goblin-past-only-calibration-v1.cjs"));
 let previous=null,priorEvidence=null;try{const old=read(OUT);previous=old.lineupCalibrationResearch;priorEvidence=old.firstObservedCalibrationState;}catch{}
 const lab=require("../src/forward-calibration-evidence.cjs"),valid=require("../src/nhl-frozen-baseline-challenge.cjs").rowValid;
 const inputs=ledger.records.filter(r=>valid(r)&&["correct","incorrect","push"].includes(r.selectionStatus)).map(r=>({id:r.id,gameId:r.gameId,playerId:r.playerId??null,team:r.team??null,market:r.market,period:r.period||"full_game",tier:r.tier,side:r.selectedSide,p:r.estimatedProbability,y:Number(r.selectionStatus==="correct"),frozenAt:r.firstGitCommittedAt,startAt:r.gameStartAt}));
 report.firstObservedCalibrationState=lab.observe(inputs,priorEvidence,report.generatedAt);
 report.hierarchicalCalibration=lab.study(report.firstObservedCalibrationState);
 const risk=require("../src/nhl-tier-calibration-lineup-risk-v2.cjs");
 report.firstObservedTierMarketCalibrationV2=risk.study(report.firstObservedCalibrationState);
 report.firstObservedCrossGameDependencyV2=risk.dependencyEvidence(report.firstObservedCalibrationState);
 report.originalHalfLineCalibrationResearch=require("../src/nhl-original-line-calibration-lab.cjs").study(ledger,report.firstObservedCalibrationState);
 report.originalPairDependence=require("../src/forward-pair-evidence.cjs").study(report.firstObservedCalibrationState);
 report.sameGameCopulaResearch=require('../src/same-game-frozen-copula-research-v1.cjs').study(report.firstObservedCalibrationState);
 report.sameGameCopulaPooledTierSensitivity=require('../src/same-game-frozen-copula-research-v1.cjs').study(report.firstObservedCalibrationState,{grouping:'market_side_pooled'});
 const optional=p=>{try{return read(p);}catch{return null;}};
 const paper=optional('outputs/research/private-paper-entry-ledger.json');
 report.marketBenchmarkReadiness=require('../src/strict-market-benchmark.cjs').evidenceReport({sourceArchive:optional('outputs/sportsbooks/latest.json'),comparison:optional('outputs/comparisons/nhl-latest.json'),close:optional('outputs/health/nhl-pregame-source-close-latest.json'),paper:paper?.kind==='authenticated_private_paper_entry_ledger_v1'?paper.records:[]});
 const adaptive=require("../src/nhl-standard-adaptive-research.cjs"),schedule=read("outputs/official-nhl/season-schedules/2026-27.json");
 const cutoff=require("../src/nhl-standard-forward-diagnostics.cjs").pacificDay(report.generatedAt);
 report.playerContextCoverage=require("../src/nhl-player-context-evidence.cjs").report(history,schedule,cutoff);
 report.positionDefenseAblation=require("../src/nhl-position-defense-ablation.cjs").study(history,schedule,cutoff);
 const positionV2=require("../src/nhl-position-rate-matchup-v2.cjs");
 report.positionRateMatchupHistoricalV2=positionV2.prepare(history,schedule,cutoff).report;
 report.positionRateMatchupForwardV2=positionV2.score(frames,history,firstPolicyCommit("src/nhl-position-rate-matchup-v2.cjs"));
 report.standardAdaptiveHistorical=adaptive.prepare(history,schedule,cutoff).historical;
 report.standardAdaptiveProspective=adaptive.score(frames,history,firstPolicyCommit("src/nhl-standard-adaptive-research.cjs"));
 const transfer=optional("outputs/backtests/nhl-standard-three-season-transfer-latest.json");
 report.standardAdaptiveExactLineReplay=adaptive.score(frames,history,null,{retrospective:true,schedule,transfer});
 report.threeSeasonTransferAvailability={available:transfer?.kind==="nhl_standard_three_season_transfer_v1",generatedAt:transfer?.generatedAt??null,codeCommit:transfer?.codeCommit??null,productionPromoted:false};
 report.fixedTrial=require("../src/fixed-trial-evidence-gates.cjs").releaseReview({now:report.generatedAt});
 report.standardReferencePaperSimulation=require("../src/standard-paper-reference.cjs").study(report.separatePowerFlexFormatEvidence.resolvedScenarioObservations);
 report.lineupCalibrationResearch=require("../src/lineup-count-mass-calibration-lab.cjs").observe(report.separatePowerFlexFormatEvidence.resolvedScenarioObservations,previous,report.generatedAt);
 report.lineupSlateCoverage=require("../src/lineup-evidence-slate-audit.cjs").audit(report.lineupCalibrationResearch);
 report.formatCoverage=require("../src/lineup-dependence-bounds-research.cjs").formatCoverage(report.separatePowerFlexFormatEvidence.groups,report.lineupCalibrationResearch);
 fs.mkdirSync(path.dirname(path.join(ROOT,OUT)),{recursive:true});
 fs.writeFileSync(path.join(ROOT,OUT),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({status:"private_research_only_saved",path:OUT,
  date:report.dateOfLatestGradedSlate,originalStandard:diagnostic.fullStandard,
  lastStandard:diagnostic.lastCompletedDate,
  graderOriginalChallengerLines:paired.all.gradedOriginalLines,
  eligibleNewCalibrator:calibration.all.decided,
  championUnchanged:true,noModelPromotion:true,noProviderCalls:true}));
 return report;
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main,firstPolicyCommit};
