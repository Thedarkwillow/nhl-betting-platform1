"use strict";
// Public progress only; explicit count allowlist, never private names, lines,
// source prices, calibration coefficients or internal model parameters.
const fs=require("node:fs"),path=require("node:path"),count=x=>Number.isInteger(x)&&x>=0?x:null,dt=x=>typeof x==="string"?Date.parse(x):NaN;

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
  r?.modelPromoted!==false||r.minimumEvidenceMet!==false||
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
function build(source,{now=new Date().toISOString(),nhlSelective=null,nflSelective=null}={}){
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
  sportsbook:{strictMatched:count(odds.strictPlatformMatches),conditionalArchived:count(odds.archiveCoverage?.uniqueConditionalPropSides??odds.archivedConditionalMatches),within30Minutes:count(odds.archiveCoverage?.uniqueWithin30Minutes??odds.within30Minutes),verifiedLiveConsensus:false},
  lineupResearch:Object.fromEntries(["NHL","NFL"].map(s=>[s,{distinctResolvedSlates:count(slate[s]?.distinctSlatesAcrossFormats)}])),
  paper:{authenticatedSettledEntries:count(paper.authenticatedSettledEntries),verifiedROI:null},
  validationSample:gates,
  selectiveAccuracy:buildSelectiveAccuracy(nhlSelective,nflSelective,now),
  proprietaryRowsPublished:0,calibrationApproved:false,modelPromoted:false};
}
function main([privateRoot,publicRoot]=process.argv.slice(2)){
 if(!privateRoot||!publicRoot)throw Error("Require checkout paths");
 const read=file=>JSON.parse(fs.readFileSync(path.join(privateRoot,file),"utf8"));
 const out=build(read("outputs/health/source-completion-readiness-latest.json"),{
  nhlSelective:read("outputs/health/nhl-shot-point-opportunity-latest.json"),
  nflSelective:read("outputs/nfl/backtests/directional-v2-future-only-latest.json")
 });
 if(!out)throw Error("Unverified private progress report; refuse publication");
 const f=path.join(publicRoot,"data/research-evidence-progress.json");fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(out,null,2)+"\n");
 console.log("PASS: allowlisted progress counts only.");
}
if(require.main===module)main();
module.exports={build};
