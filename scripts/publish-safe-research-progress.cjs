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
function build(source,{now=new Date().toISOString(),nhlSelective=null,nflSelective=null,modelIdeas=null}={}){
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
  proprietaryRowsPublished:0,calibrationApproved:false,modelPromoted:false};
}
function main([privateRoot,publicRoot]=process.argv.slice(2)){
 if(!privateRoot||!publicRoot)throw Error("Require checkout paths");
 const read=file=>JSON.parse(fs.readFileSync(path.join(privateRoot,file),"utf8"));
 const out=build(read("outputs/health/source-completion-readiness-latest.json"),{
  nhlSelective:read("outputs/health/nhl-shot-point-opportunity-latest.json"),
  nflSelective:read("outputs/nfl/backtests/directional-v2-future-only-latest.json"),
  modelIdeas:(()=>{try{return read("outputs/health/open-model-ideas-latest.json")}catch{return null}})()
 });
 if(!out||!out.selectiveAccuracy)throw Error("Missing verified private prospective selective reports; refuse publication");
 const f=path.join(publicRoot,"data/research-evidence-progress.json");fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(out,null,2)+"\n");
 console.log("PASS: allowlisted progress counts only.");
}
if(require.main===module)main();
module.exports={build};
