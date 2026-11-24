"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const load=p=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}catch{return null;}};
const n=x=>Number.isInteger(x)&&x>=0?x:null;
const f=x=>typeof x==="number"&&Number.isFinite(x)?x:null;
/** Redacts all player/line/model specifics. Evidence for research status only. */
function build({nhl,nfl,kicking}={},generatedAt=new Date().toISOString()){
 const integrity=nhl?.zeroStatIntegrity;
 const replay=nhl?.experimentalOpportunityReplay;
 const validIntegrity=integrity?.kind==="nhl_full_roster_zero_stat_and_feature_integrity_v1"&&
  integrity.modelPromoted===false&&integrity.noMissingStatConvertedToZero===true;
 const validReplay=replay?.kind==="nhl_fixed_threshold_two_stage_chronological_official_replay_v1"&&
  replay.syntheticThresholds===true&&replay.realPlatformLinesUsed===false&&
  replay.modelPromoted===false&&replay.noSameDayOutcomeFeatures===true;
 const markets={};
 if(validReplay)for(const m of ["shotsOnGoal","blockedShots"]){
  const z=replay.byMarket?.[m]||{};
  markets[m]={historicalAppearanceRows:n(z.matchedAppearanceRows),
   predicted:n(z.predicted),abstained:n(z.abstained),
   distinctGames:n(z.distinctGames),distinctDates:n(z.distinctDates),
   simplePast10MAE:f(z.simplePast10MAE),twoStageMAE:f(z.twoStageMAE),
   syntheticFixedThresholdBrier:f(z.syntheticFixedThresholdBrier),
   originalPlatformLineBacktest:false,releaseApproved:false};
 }
 // Source reports from existing market models are still retrospective,
 // even where 2026 heldout weeks are present.
 const nflMatched=nfl?.kind==="nfl_yards_volume_efficiency_replay_v1"&&
  nfl.priorWeekOnly===true&&nfl.modelPromoted===false;
 const nmarkets={};
 if(nflMatched)for(const m of ["passing_yards","receiving_yards"]){
  const r=nfl.byMarket?.[m]||{};
  nmarkets[m]={development:n(r.development),historicalHoldout:n(r.holdout),
   historicalHoldoutWeeks:n(r.holdoutWeeks),selectedIn2025:r.selected||null,
   retrospectiveOnly:true,originalLineAccuracy:null,modelPromoted:false};
 }
 // Two archived evidence families exist. The prior-week kicker-context
 // replay covers historical field-goal/PAT markets, not current platform sides.
 const originalKicker=kicking?.kind==="nfl_kicker_prior_team_opportunity_research_v1"&&
  kicking.modelPromoted===false&&kicking.actualGameWeatherUsed===false;
 const existingKicker=kicking?.kind==="nfl_position_and_kicker_context_weight_trial_v1"&&
  kicking.priorWeeksOnly===true&&kicking.modelPromoted===false&&
  kicking.actualGameWeatherUsed===false&&
  n(kicking.reconciledKickerAppearances)!==null&&
  n(kicking.kicking?.fg_made?.holdoutGames)!==null&&
  n(kicking.kicking?.kicking_points?.holdoutGames)!==null;
 const kickerOK=originalKicker||existingKicker;
 return {kind:"cross_sport_opportunity_and_data_integrity_research_checkpoint_v1",
  generatedAt,nhl:{
   fullRosterAuditAvailable:validIntegrity,
   officialCompleteGames:validIntegrity?n(integrity.completeGames):null,
   zeroShotAppearancesRetained:validIntegrity?n(integrity.completeZeroShotAppearances):null,
   missingShotRows:validIntegrity?n(integrity.byMarket?.shotsOnGoal?.missingOrInvalid):null,
   noMissingStatConvertedToZero:validIntegrity,
   fullRosterAuditPass:validIntegrity&&integrity.fullRosterZeroStatPopulationVerified===true,
   syntheticHoldoutOnly:true,markets},
  nfl:{priorWeekUsageReplayAvailable:nflMatched,
   byMarket:nmarkets,kickerRoleEvidenceAvailable:kickerOK,
   kickerAppearanceCount:kickerOK?n(originalKicker?
    kicking.evaluatedAppearances:kicking.reconciledKickerAppearances):null,
   kickerHistoricalHoldoutGames:existingKicker?
    n(kicking.kicking.fg_made.holdoutGames):null,
   kickingResultsRetrospectiveOnly:true,
   verifiedLiveRoutesOrWOPR:false,prospectiveKickingEdgeProven:false},
  nba:{minutesProductionContractImplemented:true,
   verifiedPregameFeeds:false,prospectiveResults:0,productionApproved:false},
  esports:{cs2RoundsKillsContractImplemented:true,
   valorantRoundsKillsContractImplemented:true,
   lolTeamKillShareContractImplemented:true,
   verifiedPregameFeeds:false,prospectiveResults:0,productionApproved:false},
  calibration:{pastOnlyPlattAndBetaResearchImplemented:true,
   separateSportMarketTierRequired:true,prospectiveApproval:false},
  validation:{sameOriginalFirstGitLineAndGameClusterRequired:true,
   independentProspectiveOutperformanceProven:false,
   platformQuoteAndSettlementVerified:false},
  internalPricesPublished:0,modelPromoted:false,
  calibratedProbabilityApproved:false,optimizedLineupsApproved:false,
  authenticatedReturnOnInvestment:null,providerRequests:0,wagersPlaced:0};
}
function main(){
 const report=build({
  nhl:load("outputs/health/nhl-shot-point-opportunity-latest.json"),
  nfl:load("outputs/nfl/backtests/yardage-volume-efficiency-latest.json"),
  kicking:load("outputs/nfl/backtests/kicker-opportunity-latest.json")||
    load("outputs/nfl/backtests/kicker-usage-opportunity-latest.json")||
    load("outputs/nfl/backtests/position-kicker-context-latest.json")});
 const dest=path.join(root,"outputs/health/open-model-ideas-latest.json");
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({kind:report.kind,
  nhlCompleteGames:report.nhl.officialCompleteGames,
  zeroShotAppearances:report.nhl.zeroShotAppearancesRetained,
  shotResearchRows:report.nhl.markets.shotsOnGoal?.predicted??0,
  blockResearchRows:report.nhl.markets.blockedShots?.predicted??0,
  modelPromoted:false,providerRequests:0}));
 return report;
}
if(require.main===module)main();
module.exports={build,main};
