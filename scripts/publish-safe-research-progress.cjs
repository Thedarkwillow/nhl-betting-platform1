"use strict";
// Public progress only; explicit count allowlist, never private names, lines,
// source prices, calibration coefficients or internal model parameters.
const fs=require("node:fs"),path=require("node:path"),count=x=>Number.isInteger(x)&&x>=0?x:null,dt=x=>typeof x==="string"?Date.parse(x):NaN;


function safeMatchFunnel(f){
 const stages=["no_event","no_exact_name","no_market","no_same_threshold",
  "no_preexisting_frame","ambiguous_identity","conditional_match"];
 if(f?.kind!=="private_sportsbook_match_stage_counts_v1"||
  f.newPaidRequests!==0||f.modelPromoted!==false||
  f.sharedPlayerIdVerified!==false||f.authenticatedClosingLine!==false||
  count(f.archives)===null)return null;
 const bySport={};
 for(const sport of ["NHL","NFL"]){
  const a=f.bySport?.[sport];
  if(!a||count(a.native)===null)return null;
  const b=Object.fromEntries(stages.map(k=>[k,count(a[k])]));
  if(Object.values(b).some(x=>x===null)||
     Object.values(b).reduce((sum,x)=>sum+x,0)!==a.native)return null;
  bySport[sport]={native:a.native,...b};
 }
 const buckets=["within10m","within30m","within2h","within8h","noExactThreshold"];
 const captureSkewBuckets=Object.fromEntries(
  buckets.map(k=>[k,count(f.captureSkewBuckets?.[k])]));
 if(Object.values(captureSkewBuckets).some(x=>x===null))return null;
 return {kind:"public_sportsbook_exact_match_failure_counts_v1",
  archivedSnapshots:f.archives,bySport,captureSkewBuckets,
  exactPlatformIdentityVerified:false,authenticatedClosingLine:false,
  paidProviderRequests:0,modelPromoted:false};
}

function safeModelIdeas(report,now){
 if(report?.kind!=="cross_sport_opportunity_and_data_integrity_research_checkpoint_v1"||
  !Number.isFinite(dt(report.generatedAt))||dt(report.generatedAt)>dt(now)||
  report.modelPromoted!==false||report.calibratedProbabilityApproved!==false||
  report.optimizedLineupsApproved!==false||
  report.authenticatedReturnOnInvestment!==null||
  report.internalPricesPublished!==0||report.providerRequests!==0||
  report.wagersPlaced!==0||
  report.validation?.independentProspectiveOutperformanceProven!==false||
  report.validation?.platformQuoteAndSettlementVerified!==false||
  report.nhl?.syntheticHoldoutOnly!==true||
  report.nfl?.verifiedLiveRoutesOrWOPR!==false||
  report.nba?.verifiedPregameFeeds!==false||
  report.esports?.verifiedPregameFeeds!==false)return null;
 const nhl=report.nhl,markets=nhl.markets||{},valid=x=>count(x);
 return {kind:"public_open_model_research_coverage_v1",
  sourceReportAt:report.generatedAt,
  nhl:{fullRosterAuditAvailable:nhl.fullRosterAuditAvailable===true,
   completeOfficialGames:valid(nhl.officialCompleteGames),
   zeroShotAppearancesRetained:valid(nhl.zeroShotAppearancesRetained),
   missingShotRows:valid(nhl.missingShotRows),
   fullRosterAuditPass:nhl.fullRosterAuditPass===true,
   syntheticShotsPredicted:valid(markets.shotsOnGoal?.predicted),
   syntheticBlockedShotsPredicted:valid(markets.blockedShots?.predicted),
   realPlatformLinesEvaluated:false},
  nfl:{priorWeekUsageLabPresent:report.nfl?.priorWeekUsageReplayAvailable===true,
   kickingLabPresent:report.nfl?.kickerRoleEvidenceAvailable===true,
   routesAndWOPRLiveVerified:false},
  nba:{minutesRateAdapterImplemented:report.nba?.minutesProductionContractImplemented===true,
   pregameFeedVerified:false},
  esports:{roundsAndKillsAdaptersImplemented:
    report.esports?.cs2RoundsKillsContractImplemented===true&&
    report.esports?.valorantRoundsKillsContractImplemented===true&&
    report.esports?.lolTeamKillShareContractImplemented===true,
   pregameFeedVerified:false},
  calibrationSeparatedBySportMarketTier:true,probabilityReleaseApproved:false,
  outperformanceProven:false,modelPromoted:false,optimizedLineupsApproved:false};
}
function buildSelectiveAccuracy(nhl,nfl,now){
 const a=nhl?.selectiveFuture,b=nfl?.selectiveFuture,r=b?.onePerPlayerMarket;
 if(nhl?.kind!=="private_shot_point_opportunity_research_v1"||
  a?.kind!=="nhl_standard_opportunity_concordance_future_shadow_20261117_v1"||
  nfl?.kind!=="nfl_directional_v2_original_first_git_future_holdout_v1"||
  b?.kind!=="nfl_market_usage_margin_future_shadow_20261117_v1"||
  !Number.isFinite(dt(nhl.generatedAt))||!Number.isFinite(dt(nfl.generatedAt))||
  dt(nhl.generatedAt)>dt(now)||dt(nfl.generatedAt)>dt(now)||
  !Number.isFinite(dt(a.policyFirstCommittedAt))||
  dt(nhl.generatedAt)<dt(a.policyFirstCommittedAt)||
  a.precommittedPolicy!==true||a.comparedOnlyOnOriginalSelectedThresholds!==true||
  a.noPosthocMarketFiltering!==true||a.modelPromoted!==false||
  a.calibrationApproved!==false||a.lineupsApproved!==false||
  a.originalPlatformSettlementVerified!==false||
  b.firstFrozenOnly!==true||b.sampleIsSubsetOfV2OriginalDirections!==true||
  b.productionApproved!==false||b.calibratedProbabilitiesApproved!==false||
  b.authenticOppositeOffersVerified!==false||
  r?.modelPromoted!==false||typeof r.minimumEvidenceMet!=="boolean"||
  r.calibratedProbability!==null)return null;
 const valid=[a.registered,a.eligible,a.abstained,a.pending,a.decided,
  r.included,r.decided,r.pending,r.distinctGames,r.distinctGameDates].every(x=>count(x)!==null);
 if(!valid||a.registered<a.eligible||a.registered<a.abstained||
  a.eligible<a.pending+a.decided||r.included<r.pending+r.decided)return null;
 return {
  kind:"public_selective_accuracy_first_git_counts_v1",
  nhlReportAt:nhl.generatedAt,nflReportAt:nfl.generatedAt,
  nhl:{registered:a.registered,eligible:a.eligible,abstained:a.abstained,
   pending:a.pending,decided:a.decided},
  nfl:{included:r.included,pending:r.pending,decided:r.decided,
   distinctGames:r.distinctGames,distinctGameDates:r.distinctGameDates},
  bothPoliciesFutureOnly:true,independentOutperformanceEstablished:false,
  calibrationApproved:false,automatedLineupsApproved:false,
  originalPlatformSettlementVerified:false
 };
}
// Strict aggregate whitelist: no player, game, line, odds, or model-weight fields.
function safeGoblinScreen(s){
 if(s?.kind!=="nhl_goblin_new_policy_first_git_screening_counts_v1"||
    s.policyFirstGitVerified!==true||s.prospectiveDecisionsUsed!==0||
    s.calibrated!==false||s.authenticatedPayouts!==false||
    s.recommendationsReleased!==0||s.modelPromoted!==false)return null;
 const keys=["screened","selected","abstained","lateOrUnverified","unknownStatus"];
 if(keys.some(k=>count(s[k])===null)||
    s.selected+s.abstained+s.unknownStatus!==s.screened)return null;
 const markets=["shotsOnGoal","blockedShots","assists","points"],
       reasons=["insufficient_verified_prior_ice_time",
        "high_ice_time_or_recent_usage_uncertainty",
        "recent_lineup_role_or_team_not_stable",
        "opponent_defensive_volume_history_unverified",
        "official_pregame_scratched_or_injured",
        "distribution_direction_missing",
        "model_direction_not_on_original_offered_side",
        "insufficient_uncalibrated_directional_separation",
        "other_model_abstention"];
 if(Object.keys(s.byMarket||{}).some(x=>!markets.includes(x))||
    Object.keys(s.abstentionReasons||{}).some(x=>!reasons.includes(x)))return null;
 const byMarket={};
 for(const market of markets){
  const m=s.byMarket?.[market]||{screened:0,selected:0,abstained:0};
  if(["screened","selected","abstained"].some(k=>count(m[k])===null)||
     m.selected+m.abstained>m.screened)return null;
  byMarket[market]={screened:m.screened,selected:m.selected,abstained:m.abstained};
 }
 if(markets.reduce((t,m)=>t+byMarket[m].screened,0)!==s.screened||
    markets.reduce((t,m)=>t+byMarket[m].selected,0)!==s.selected||
    markets.reduce((t,m)=>t+byMarket[m].abstained,0)!==s.abstained)return null;
 const abstentionReasons=Object.fromEntries(reasons.map(k=>[k,s.abstentionReasons?.[k]||0]));
 if(Object.values(abstentionReasons).some(v=>count(v)===null)||
    Object.values(abstentionReasons).reduce((a,b)=>a+b,0)!==s.abstained)return null;
 return {kind:"public_goblin_post_policy_screening_counts_v1",
  screened:s.screened,selected:s.selected,abstained:s.abstained,
  lateOrUnverified:s.lateOrUnverified,unknownStatus:s.unknownStatus,
  byMarket,abstentionReasons,verifiedAccuracy:false,
  calibrated:false,bettable:false};
}
function safeNFLPrerequisiteGaps(s,total){
 if(!s||count(total)===null||
   ["officialGame","providerToGSIS","positiveActiveRoster"].some(k=>
    count(s[k])===null||s[k]>total))return null;
 return {kind:"public_nfl_goblin_missing_prerequisites_v1",
  originalOffersAudited:total,officialGame:s.officialGame,
  providerToGSIS:s.providerToGSIS,positiveActiveRoster:s.positiveActiveRoster,
  rowsMayHaveMultipleBlockers:true,verifiedActive:false,eligiblePicks:0};
}
// Independent pregame game-schedule matches are NOT provider->GSIS
// player identities and NEVER establish an active, bettable player.
// Reproducible prior-week GSIS candidate research is NOT a verified
// cross-provider identifier: do not use it to approve NFL picks.
function safeNFLReportedInjuries(e){
 if(e?.kind!=="nfl_first_party_reported_injury_counts_v1"||
    e.officialFirstGitVerified!==true||e.activeGamedayVerified!==false||
    e.missingMeansHealthy!==false||e.approvedSelections!==0||
    e.providerRequests!==0||e.modelPromoted!==false)return null;
 const keys=["rows","out","questionable","doubtful","ambiguous"];
 if(keys.some(k=>count(e[k])===null)||e.out+e.questionable+e.doubtful!==e.rows)return null;
 const time=dt(e.capturedAt);
 if(!Number.isFinite(time))return null;
 return {kind:"public_nfl_explicit_official_injury_status_counts_v1",
  reportCapturedAt:e.capturedAt,explicitStatuses:e.rows,
  ruledOut:e.out,questionable:e.questionable,doubtful:e.doubtful,
  duplicateStatuses:e.ambiguous,medicalClearanceVerified:false,
  gameDayActiveVerified:false,bettingEligible:0};
}
function safeNFLPositiveMentions(e,sourceFresh){
 if(sourceFresh!==true||
  e?.kind!=="nfl_official_positive_game_statement_research_counts_v1"||
  e.officialCompleteGameRosterVerified!==false||
  e.officialPositiveProviderGSISVerified!==0||
  e.approvedSelections!==0||
  e.originalAppActiveVerified!==false||
  e.noActiveByOmission!==true||
  e.modelPromoted!==false||e.providerRequests!==0)return null;
 const keys=["articlesObserved","explicitMentions","corroboratedConditionalPlayers"];
 if(keys.some(k=>count(e[k])===null)||
  e.corroboratedConditionalPlayers>e.explicitMentions)return null;
 return {kind:"public_nfl_official_explicit_active_mention_research_v1",
  officialArticles:e.articlesObserved,explicitMentions:e.explicitMentions,
  conditionalPlayersCorroborated:e.corroboratedConditionalPlayers,
  sharedProviderIDsConfirmed:0,fullOfficialActiveRosterVerified:false,
  approvedPicks:0,playerIdentityAndGamedayBothVerified:false};
}
function safeNFLIdentityCandidates(e,sourceFresh){
 if(sourceFresh!==true||
  e?.kind!=="nfl_original_provider_to_gsis_candidate_research_v1"||
  e.rosterProvenanceVerified!==true||
  e.independentlyVerifiedMappings!==0||
  e.playerCrosswalkSourceVerified!==false||
  e.officialGameDayActiveVerified!==0||
  e.paidProviderRequests!==0||e.modelPromoted!==false)return null;
 const keys=["originalProviderPlayers","candidateMatches","ambiguousPlayers",
  "insufficientPriorWeeks","noRosterMatch","conflictingSourceIdentity","invalidPlayerEntries"];
 if(keys.some(k=>count(e[k])===null))return null;
 if(e.candidateMatches+e.ambiguousPlayers+e.insufficientPriorWeeks+
  e.noRosterMatch+e.conflictingSourceIdentity+e.invalidPlayerEntries>e.originalProviderPlayers)
  return null;
 return {kind:"public_nfl_conditional_gsis_research_counts_v1",
  priorRosterCandidates:e.candidateMatches,sourcePlayers:e.originalProviderPlayers,
  ambiguous:e.ambiguousPlayers,insufficientPriorWeeks:e.insufficientPriorWeeks,
  missingRoster:e.noRosterMatch,conflictingSource:e.conflictingSourceIdentity,
  verifiedSharedProviderIDs:0,verifiedGamedayActive:0,
  approvedSelections:0,probabilityApproved:false};
}
function safeNFLGameSchedule(e,sourceFresh){
 if(sourceFresh!==true||
    e?.kind!=="nfl_independent_pregame_schedule_crosswalk_v1"||
    e.source!=="archived_nflverse_schedule_and_source_board"||
    e.sourceProvenanceValid!==true||e.sourceFirstParty!==false||
    e.noPlayerIdentityProof!==true||
    e.paidProviderRequests!==0||e.modelPromoted!==false)return null;
 const keys=["verifiedGames","originalGames","conflictingSourceGames",
   "missingScheduleMatches","ambiguousScheduleMatches"];
 if(keys.some(k=>count(e[k])===null))return null;
 if(e.verifiedGames+e.conflictingSourceGames+
    e.missingScheduleMatches+e.ambiguousScheduleMatches!==e.originalGames)return null;
 return {kind:"public_nfl_goblin_independent_game_schedule_counts_v1",
  verifiedGames:e.verifiedGames,sourceGameKeys:e.originalGames,
  conflicting:e.conflictingSourceGames,missing:e.missingScheduleMatches,
  ambiguous:e.ambiguousScheduleMatches,
  playerGSISVerified:false,gameDayActiveVerified:false,
  sourceFirstParty:false,modelPromoted:false,approvedPicks:0};
}
function safeGoblin(report,now){
 if(report?.kind!=="private_goblin_forward_evidence_v1"||
  !Number.isFinite(dt(report.generatedAt))||
  dt(report.generatedAt)>dt(now)||
  report.researchOnly!==true||report.modelPromoted!==false||
  report.calibratedProbabilityApproved!==false||
  report.actualWagersPlaced!==0||report.providerRequests!==0||
  report.comparison?.kind!=="future_only_goblin_original_line_comparison_v1"||
  report.comparison.verifiedOutperformance!==false||
  report.calibration?.independentFutureApproval!==false||
  report.lineups?.approvedLineups!==0||
  report.lineups?.exactGoblinEntryMultipliersCaptured!==false)
  return null;
 const n=x=>count(x);
 return {kind:"public_goblin_independent_future_research_counts_v1",
  sourceReportAt:report.generatedAt,
  nhl:{sourceEligible:report.NHL?.currentSourceEligibleForNewPolicy===true,
   examined:n(report.NHL?.originalGoblinOffersExamined),
   newCandidates:n(report.NHL?.newResearchCandidates),
   newAbstentions:n(report.NHL?.newAbstentions),
   archivedFirstGit:n(report.NHL?.archivedFirstGitRecords),
   duplicatesQuarantined:n(report.NHL?.quarantinedDuplicateFirstGitRows),
   selectivePolicyRequiresNewSource:report.NHL?.selectivePolicySourceEligible!==true,
   postPolicyScreening:safeGoblinScreen(report.NHL?.postPolicyScreening),
   futureDecided:n(report.comparison?.decided),
   futureRegistered:n(report.comparison?.registered)},
  nfl:{supportedOpportunityResearchImplemented:
    report.NFL?.historicalOpportunityContractImplemented===true,
   freshFullPlayerIdentityAndAvailabilityVerified:
    report.NFL?.prospectiveOfficialInjuryAndIdentityVerified===true,
   sourceFirstGitCurrent:report.NFL?.freshFirstGitSourceVerified===true,
   gameSchedule:safeNFLGameSchedule(report.NFL?.scheduleEvidence,report.NFL?.freshFirstGitSourceVerified),
   conditionalGSIS:safeNFLIdentityCandidates(report.NFL?.conditionalIdentityEvidence,report.NFL?.freshFirstGitSourceVerified),
   positiveGameStatements:safeNFLPositiveMentions(report.NFL?.officialPositiveEvidence,report.NFL?.freshFirstGitSourceVerified),
   officialInjuryStatuses:safeNFLReportedInjuries(report.NFL?.officialInjuryEvidence),
   originalGoblinOffersAudited:n(report.NFL?.auditedOriginalGoblinOffers),
   exactIdentityReadyForModel:n(report.NFL?.identityReadyForNextModelStage),
   verifiedActiveRoster:report.NFL?.officialActiveRosterVerified===true,
   officialGameBridgeMissing:n(report.NFL?.eligibilityReasonCounts?.official_game_crosswalk_unverified),
   prerequisiteGaps:report.NFL?.freshFirstGitSourceVerified===true?
    safeNFLPrerequisiteGaps(report.NFL?.prerequisiteGaps,report.NFL?.auditedOriginalGoblinOffers):null,
   providerGSiSBridgeMissing:n(report.NFL?.eligibilityReasonCounts?.exact_provider_player_to_gsis_bridge_unverified),
   positiveActiveStatusMissing:n(report.NFL?.eligibilityReasonCounts?.official_current_active_roster_missing),
   firstGitEligible:n(report.NFL?.newEligibleFirstGitRecords)},
  calibration:{isolatedGoblinMarketFit:true,approved:false},
  lineup:{supported2to6PowerFlexResearch:true,
   exactEntryGoblinMultipliersVerified:false,verifiedQuoteEV:null,
   approvedSlips:0,placedWagers:0},
  modelPromoted:false,prospectiveEdgeVerified:false,
  payoutsAndSettlementsVerified:false,privatePlayerRowsPublished:0};
}
function build(source,{now=new Date().toISOString(),nhlSelective=null,nflSelective=null,modelIdeas=null,goblin=null}={}){
 if(source?.kind!=="private_source_completion_readiness_v1"||!Number.isFinite(dt(now))||!Number.isFinite(dt(source.generatedAt))||dt(source.generatedAt)>dt(now)||source.modelPromoted!==false||source.wagersPlaced!==0)return null;
 const d=source.periodCoverage,p=d&&count(d.calendarDays)>0&&count(d.accountedDays)!==null&&count(d.pendingDays)!==null&&d.accountedDays+d.pendingDays===d.calendarDays?{accountedDays:d.accountedDays,calendarDays:d.calendarDays,pendingDays:d.pendingDays}:null;
 const evidence=Object.fromEntries(["nhl","nfl"].map(s=>[s,{firstObserved:count(source.prospective?.[s]?.firstObserved),matchedCalibrationRows:count(source.prospective?.[s]?.matchedCalibrationRows)}]));
 const odds=source.odds||{},paper=source.paper||{},slate=source.lineupSlateEvidence||{};
 const v=source.validationSample||{};
 const acceptedValidation=v.modelPromoted===false&&v.originalPlatformSettlementVerified===false&&
  v.actualPayoutEVVerified===false&&Number.isFinite(dt(v.sourceReportAt))&&
  dt(v.sourceReportAt)<=dt(source.generatedAt);
 const gates=acceptedValidation?{
  sourceReportAt:v.sourceReportAt,
  nhlStandardFrozenDecisions:count(v.nhlStandardFrozenDecisions),
  nhlStandardFrozenGames:count(v.nhlStandardFrozenGames),
  nhlStandardFrozenPacificSlates:count(v.nhlStandardFrozenPacificSlates),
  matchedFrozenCalibrationDecisions:count(v.matchedFrozenCalibrationDecisions),
  independentlySupportedCalibrationGroups:count(v.independentlySupportedCalibrationGroups),
  nflFirstDistinctThresholdDecisions:count(v.nflFirstDistinctThresholdDecisions),
  nflFirstDistinctThresholdGames:count(v.nflFirstDistinctThresholdGames),
  powerFlexRegisteredReferenceEntries:count(v.powerFlexRegisteredReferenceEntries),
  powerFlexResolvedReferenceEntries:count(v.powerFlexResolvedReferenceEntries),
  powerFlexUniqueUnderlyingResolvedSlates:count(v.powerFlexUniqueUnderlyingResolvedSlates),
  probabilitiesCalibrated:false,modelPromoted:false,platformPayoutROI:null
 }:null;
 return {schemaVersion:1,kind:"public_research_progress_counts_v1",generatedAt:now,sourceReportAt:source.generatedAt,periodHistory:p,evidence,
  sportsbook:{strictMatched:count(odds.strictPlatformMatches),conditionalArchived:count(odds.archiveCoverage?.uniqueConditionalPropSides??odds.archivedConditionalMatches),within30Minutes:count(odds.archiveCoverage?.uniqueWithin30Minutes??odds.within30Minutes),verifiedLiveConsensus:false,matchFunnel:safeMatchFunnel(odds.matchFunnel)},
  lineupResearch:Object.fromEntries(["NHL","NFL"].map(s=>[s,{distinctResolvedSlates:count(slate[s]?.distinctSlatesAcrossFormats)}])),
  paper:{authenticatedSettledEntries:count(paper.authenticatedSettledEntries),verifiedROI:null},
  validationSample:gates,
  selectiveAccuracy:buildSelectiveAccuracy(nhlSelective,nflSelective,now),
  modelIdeas:safeModelIdeas(modelIdeas,now),
  goblinFuture:safeGoblin(goblin,now),
  proprietaryRowsPublished:0,calibrationApproved:false,modelPromoted:false};
}
function main([privateRoot,publicRoot]=process.argv.slice(2)){
 if(!privateRoot||!publicRoot)throw Error("Require checkout paths");
 const read=file=>JSON.parse(fs.readFileSync(path.join(privateRoot,file),"utf8"));
 const out=build(read("outputs/health/source-completion-readiness-latest.json"),{
  nhlSelective:read("outputs/health/nhl-shot-point-opportunity-latest.json"),
  nflSelective:read("outputs/nfl/backtests/directional-v2-future-only-latest.json"),
  modelIdeas:(()=>{try{return read("outputs/health/open-model-ideas-latest.json")}catch{return null}})(),
  goblin:(()=>{try{return read("outputs/health/goblin-forward-latest.json")}catch{return null}})()
 });
 if(!out||!out.selectiveAccuracy)throw Error("Missing verified private prospective selective reports; refuse publication");
 const f=path.join(publicRoot,"data/research-evidence-progress.json");fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(out,null,2)+"\n");
 console.log("PASS: allowlisted progress counts only.");
}
if(require.main===module)main();
module.exports={build};
