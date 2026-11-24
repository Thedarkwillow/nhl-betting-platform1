"use strict";
/**
 * Offline only. REQUIRES a recently and independently captured private board.
 * Must be immediately committed to Git before EACH game's start.
 * No retroactive freeze and no provider request.
 */
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {loadCapture}=require("./build-partner-board-preview.cjs");
const {buildPartnerPregameFreeze}=require("../src/nhl-partner-pregame-freeze.cjs");
const {fitAtFreeze}=require("../src/nhl-standard-calibration-shadow.cjs");
const {buildMovementContext}=require("../src/nhl-sog-line-movement.cjs");
const root=path.resolve(__dirname,"..");
const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),"utf8"));
const optional=relative=>fs.existsSync(path.join(root,relative))?read(relative):null;
function originalOddsArchives(now){
 
 const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:8000,maxBuffer:8*1024*1024}).trim(),a=[];
 for(const dir of ["outputs/sportsbooks/bounded-live","outputs/sportsbooks/independent-nhl"]){const abs=path.join(root,dir);if(!fs.existsSync(abs))continue;
 for(const n of fs.readdirSync(abs).filter(n=>/^\d{8}T\d{9}Z\.json$/.test(n)).sort().slice(-8)){
  const p=dir+"/"+n;try{const c=git(["log","--format=%H","--",p]).split("\n").filter(Boolean);if(c.length!==1)continue;
   const firstCommittedAt=git(["show","-s","--format=%cI",c[0]]);if(Date.parse(firstCommittedAt)>Date.parse(now)||Date.parse(now)-Date.parse(firstCommittedAt)>1800000)continue;
   a.push({archive:JSON.parse(git(["show",c[0]+":"+p])),firstCommittedAt,gitHistoryCount:1});
  }catch{}
 }
 }
 return a;
}
function transferArtifact(now){
 const p="outputs/backtests/nhl-standard-three-season-transfer-latest.json";
 try{
  const artifact=optional(p);if(!artifact||!Number.isFinite(Date.parse(artifact.generatedAt)))return null;
  const commit=execFileSync("git",["log","-1","--format=%cI","--",p],{cwd:root,encoding:"utf8",timeout:8000}).trim();
  if(!(Date.parse(artifact.generatedAt)<=Date.parse(commit)&&Date.parse(commit)<Date.parse(now)))return null;
  return artifact;
 }catch{return null;}
}
function committedSource(p,now){try{const firstCommittedAt=execFileSync("git",["log","-1","--format=%cI","HEAD","--",p],{cwd:root,encoding:"utf8",timeout:8000}).trim();if(!(Date.parse(firstCommittedAt)<=Date.parse(now)))return null;const document=JSON.parse(execFileSync("git",["show","HEAD:"+p],{cwd:root,encoding:"utf8",timeout:8000,maxBuffer:16*1024*1024}));return {document,firstCommittedAt};}catch{return null;}}
// Read only immutable, already committed official per-game scoring sources.
// Archive files added to the working tree but not yet Git-committed are ignored.
function committedSharedIce(now){
 const out=new Map();
 for(const dir of ["outputs/nhl/research/playerwon-reconciled","outputs/nhl/research/goal-credit-shifts"]){
  const full=path.join(root,dir);if(!fs.existsSync(full))continue;
  for(const name of fs.readdirSync(full).filter(x=>/^\d+\.json$/.test(x)).sort().reverse().slice(0,120)){
   try{const p=dir+"/"+name,logs=execFileSync("git",["log","--format=%cI","HEAD","--",p],{cwd:root,encoding:"utf8",timeout:5000}).trim().split("\n").filter(Boolean);
    if(logs.length!==1)continue;const source=committedSource(p,now),d=source?.document;if(d?.gameId!==Number(name.slice(0,-5))||d.goalCreditsVerified!==true||d.shiftsVerified!==true||!(Date.parse(d.collectedAt)<=Date.parse(logs[0])))continue;
    if(dir.endsWith("playerwon-reconciled")&&d.officialBoxscoreReconciled!==true)continue;
    out.set(d.gameId,{...d,firstGitAt:logs[0]});
   }catch{}
  }
 }
 return [...out.values()];
}
function committedResearchHistory(now,dir,kind){
 const full=path.join(root,dir);
 if(!fs.existsSync(full))return [];
 const names=fs.readdirSync(full).filter(n=>/^\d{4}-\d{2}-\d{2}(?:__\d{10})?\.json$/.test(n))
  .sort().slice(-500),archives=[];
 for(const name of names){
  const file=dir+"/"+name;
  try{
   const log=execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","HEAD","--",file],
    {cwd:root,encoding:"utf8",timeout:5000}).trim();
   if(!Number.isFinite(Date.parse(log))||Date.parse(log)>Date.parse(now))continue;
   const count=Number(execFileSync("git",["rev-list","--count","HEAD","--",file],
    {cwd:root,encoding:"utf8",timeout:5000}).trim());
   if(count!==1)continue; // Modified archives are not immutable.
   const archive=JSON.parse(execFileSync("git",["show","HEAD:"+file],
    {cwd:root,encoding:"utf8",timeout:5000,maxBuffer:3*1024*1024}));
   if(archive?.kind!==kind||
     archive.date!==name.slice(0,10)||Date.parse(archive.observedAt)>Date.parse(log))continue;
   archives.push(archive);
  }catch{}
 }
 return archives;
}
// Research-only, bounded immutable official PBP shot-attempt archive loader.
// No paid provider requests; verify first-add Git commit, unchanged file,
// official final source, and dates before the original Pacific slate.
function committedActualAttemptDates(now,{maxArchives=40}={}){
 const dir="outputs/period-stats/dates",full=path.join(root,dir),result=[];
 if(!fs.existsSync(full))return result;
 const day=require("../src/nhl-opponent-opportunity-gate-v1.cjs").pacificDay(now);
 if(!day)return result;
 const names=fs.readdirSync(full).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)&&
  x.slice(0,10)<day).sort().reverse();
 for(const name of names){
  if(result.length>=maxArchives)break;
  const rel=dir+"/"+name,disk=optional(rel);
  if(disk?.complete!==true||!Array.isArray(disk.shotAttemptRows)||
     disk.shotAttemptRows.length<36||disk.requestedDate!==name.slice(0,10))continue;
  try{
   const git=(args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",
     timeout:6500,maxBuffer:3*1024*1024}).trim();
   const firstGitAt=git(["log","--diff-filter=A","-1","--format=%cI","HEAD","--",rel]);
   const count=Number(git(["rev-list","--count","HEAD","--",rel]));
   if(count!==1||!Number.isFinite(Date.parse(firstGitAt))||
       Date.parse(firstGitAt)>=Date.parse(now))continue;
   const committed=JSON.parse(git(["show","HEAD:"+rel]));
   if(JSON.stringify(committed)!==JSON.stringify(disk)||
      !Number.isFinite(Date.parse(committed.generatedAt))||
      Date.parse(committed.generatedAt)>Date.parse(firstGitAt))continue;
   result.push({document:committed,firstGitAt});
  }catch{}
 }
 return result;
}
function main(){
 const sourceDir=process.argv[2];
 if(!sourceDir)throw Error("Supply exact private manual-board-captures directory");
 const now=new Date().toISOString();
 const archive=loadCapture(sourceDir,{now});
 const movementContext=buildMovementContext(sourceDir,archive.boards.NHL,{asOf:now,root});
 const {snapshot,readiness}=buildPartnerPregameFreeze(archive.boards.NHL,
  read("outputs/projections/players.json"),
  read("outputs/official-nhl/season-schedules/2026-27.json"),
  read("outputs/history/players.json"),now,undefined,
  optional("outputs/approved-nhl-sources/latest.json"),movementContext);
 try{
  snapshot.specialistIndividualResearch=require("../src/nhl-specialist-individual-forward.cjs").freeze(
   archive.boards.NHL,read("outputs/projections/players.json"),read("outputs/official-nhl/season-schedules/2026-27.json"),
   {priorityShadow:optional("outputs/projections/nhl-four-priority-shadow-latest.json"),
    extraShadow:optional("outputs/projections/nhl-extra-market-shadow-latest.json"),
    officialHistory:read("outputs/history/players.json"),officialRosters:optional("outputs/pregame-availability/official-roster-crosswalk-latest.json"),officialLeagueStatus:optional("outputs/pregame-availability/official-preview-latest.json"),periodHistory:optional("outputs/period-stats/history.json")},now);
 }catch{snapshot.specialistIndividualResearch={status:"abstained_missing_valid_pregame_models",researchOnly:true,rows:[]};}
 // Verified prior-season official rows are research-only; original offers
 // and champion selections were already generated from the current source.
 let multi=null;
 try{
  const loaded=require("./report-nhl-position-multiseason-v3.cjs").load();
  const cutoff=require("../src/nhl-standard-forward-diagnostics.cjs").pacificDay(now);
  multi=require("../src/nhl-strict-input-source-v1.cjs").adapt(loaded,cutoff);
  if(multi.available!==true)multi=null;
 }catch{multi=null;}
 // Preserve the incumbent current-season-only input evidence as the
 // untouched control arm; treatment uses the existing two-season adapter.
 const controlPositionEvidence=snapshot.positionRateMatchupV2;
 let controlAdaptiveEvidence=null;
 snapshot.standardQualityInputSources={
  kind:"nhl_strict_multi_season_pregame_inputs_v1",
  status:multi?"validated_prior_and_current_archived_seasons":"unavailable_use_existing_current_season",
  seasons:multi?.seasons??["2026-27"],historyCounts:multi?.historyCounts??null,
  originalSideAndLineUnchanged:true,researchOnly:true,modelPromoted:false,
  dataAvailableBeforeOriginalGitFreezeOnly:true,
  externallyAuthenticatedHistoricalAsOfProof:false
 };
 try{
  const prior=optional("outputs/health/nhl-standard-forward-improvement-latest.json");
  snapshot.standardAdaptiveResearchV2=require("../src/nhl-standard-adaptive-research.cjs").freeze(snapshot,
   multi?.history??read("outputs/history/players.json"),
   multi?.combinedSchedule??read("outputs/official-nhl/season-schedules/2026-27.json"),
   prior?.firstObservedCalibrationState??null,null,optional("outputs/approved-nhl-sources/latest.json"),
   originalOddsArchives(now),transferArtifact(now));
 }catch{snapshot.standardAdaptiveResearchV2={status:"abstained_invalid_history",rows:[],researchOnly:true,modelPromoted:false};}
 // Freeze the control with the SAME original offers, as-of clock,
 // calibrator state and existing model policy, not a new current board.
 if(multi){
  try{
   const prior=optional("outputs/health/nhl-standard-forward-improvement-latest.json");
   controlAdaptiveEvidence=require("../src/nhl-standard-adaptive-research.cjs").freeze(
    snapshot,read("outputs/history/players.json"),
    read("outputs/official-nhl/season-schedules/2026-27.json"),
    prior?.firstObservedCalibrationState??null,null,
    optional("outputs/approved-nhl-sources/latest.json"),
    originalOddsArchives(now),transferArtifact(now));
  }catch{controlAdaptiveEvidence=null;}
 }
 // Position/opponent research must use the same genuinely pregame season
 // archives as the adaptive model; missing archives never imply evidence.
 let mergedContextHistory=multi?{history:multi.history,schedules:multi.schedules}:null;
 if(multi){
  const originalPosition=snapshot.positionRateMatchupV2;
  try{snapshot.positionRateMatchupV2=require("../src/nhl-position-rate-matchup-v2.cjs").freeze(
    snapshot,multi.history,multi.schedules);
  }catch{snapshot.positionRateMatchupV2={status:"missing_multiseason_verified_position_evidence",
   rows:[],researchOnly:true,modelPromoted:false};}
  snapshot.standardPositionOpponentCoverageComparison={
   kind:"nhl_multiseason_position_opponent_coverage_comparison_v1",
   originalCurrentSeasonRows:originalPosition?.rows?.length??0,
   mergedSeasonRows:snapshot.positionRateMatchupV2?.rows?.length??0,
   qualityThresholdsUnchanged:true,researchOnly:true,notHistoricalAccuracyValidation:true
  };
 }
 try{
  snapshot.standardExpectedIceTimeShadowV1=require("../src/nhl-expected-ice-time-evidence-v1.cjs").freeze(
   snapshot,multi?.history??read("outputs/history/players.json"));
 }catch{snapshot.standardExpectedIceTimeShadowV1={
  status:"asof_ice_time_evidence_unavailable",rows:[],
  alternateDeployed:false,bettingEligible:false};}
 try{
  const ctx=require("../src/nhl-matchup-context-review.cjs"),history=mergedContextHistory?.history||read("outputs/history/players.json"),approved=committedSource("outputs/approved-nhl-sources/latest.json",now),injury=committedSource("outputs/pregame-availability/official-preview-latest.json",now),special=committedSource("outputs/pregame-availability/special-teams/latest.json",now),goalies=committedSource("outputs/pregame-availability/latest.json",now),odds=originalOddsArchives(now);
  const sharedIceArchives=committedSharedIce(now);
  const goalieMLArtifact=committedSource("outputs/research/priority-goalie-ml-artifact.json",now);let mlHistory=history;try{mlHistory=require("../src/priority-common-ml-shadow-v1.cjs").joinGoalieUsage(history,read("outputs/nhl-usage/latest.json"));}catch{}try{mlHistory=require('../src/priority-common-ml-shadow-v1.cjs').joinGoalieUsage(mlHistory,read('outputs/nhl-usage/goalie-starts-rest-latest.json'));}catch{}const commonMLArtifact=committedSource('outputs/research/priority-expanded-ml-artifact.json',now)||committedSource('outputs/research/priority-common-ml-artifact.json',now);
  snapshot.matchupContextReviewV1={generatedAt:now,researchOnly:true,rows:snapshot.individualPropSelections.map(p=>{const raw=snapshot.rankedProps.find(x=>x.gameId===p.gameId&&x.playerId===p.playerId&&x.market===p.market&&x.line===p.line&&x.tier===p.tier&&x.lean===p.lean&&x.capturedAt===p.capturedAt);const position=snapshot.positionRateMatchupV2?.rows?.find(x=>x.gameId===p.gameId&&x.playerId===p.playerId&&x.market===p.market&&x.line===p.line&&x.tier===p.tier);const prop={...raw,...p,probabilities:raw?.probabilities},context=ctx.context(prop,{history,approved,injury,special,goalies,odds,position,now});let component=null;try{component=require("../src/nhl-component-matchup-shadow.cjs").model(prop,{history,ctx:context,approved,now});}catch{}let sharedIceGoalie=null;try{sharedIceGoalie=require('../src/nhl-shared-ice-goalie-shadow-v2.cjs').model(prop,{history,archives:sharedIceArchives,context:{...context,moneyPuckQuality:component?.quality},now,base:component?.estimates?.usage});}catch{}let commonML=null;try{commonML=require('../src/priority-common-ml-shadow-v1.cjs').nhl(prop,mlHistory,require('../src/nhl-standard-forward-diagnostics.cjs').pacificDay(now),(prop.market==="saves"?goalieMLArtifact:commonMLArtifact),now,goalies);}catch{}return {gameId:p.gameId,playerId:p.playerId,market:p.market,line:p.line,tier:p.tier,capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,side:p.lean,originalHigher:raw?.probabilities?.higher??null,context,component,sharedIceGoalie,commonML,sportsbookGameContext:require('../src/sportsbook-matched-model-research.cjs').gameContext(prop,odds,now),sportsbookML:commonML?require('../src/sportsbook-matched-model-research.cjs').freeze(prop,odds,now,commonML.higher):null};})};
 }catch{snapshot.matchupContextReviewV1={status:"missing_context",rows:[],researchOnly:true};}
 try{
  const model=require("../src/nhl-position-multiseason-v3.cjs"),artifact=committedSource("outputs/health/nhl-position-multiseason-v3-latest.json",now),cutoff=require("../src/nhl-standard-forward-diagnostics.cjs").pacificDay(now);
  // Keep original board freeze fast: use current artifact fitted on earlier
  // season and rebuild features from earlier official rows; no full replay.
  if(artifact?.document?.kind==="nhl_position_multiseason_weight_trial_v3"&&artifact.document.cutoff<=cutoff){
   const loader=require("./report-nhl-position-multiseason-v3.cjs"),prepared=loader.prepareLive(cutoff,artifact.document,mergedContextHistory);
   snapshot.positionMultiSeasonV3=model.freeze(snapshot,prepared);
   const v4=committedSource("outputs/health/nhl-form-usage-position-v4-latest.json",now);
   if(v4?.document?.kind==="nhl_form_usage_position_weight_trial_v4"&&v4.document.cutoff<=cutoff)snapshot.formUsagePositionV4=require("../src/nhl-form-usage-position-v4.cjs").freeze(snapshot,{...prepared,report:v4.document});
   const v5=committedSource("outputs/health/nhl-standard-tail-weight-v5-latest.json",now);
   if(v5?.document?.kind==="nhl_standard_tail_weight_trial_v5"&&v5.document.cutoff<=cutoff)snapshot.standardTailWeightV5=require("../src/nhl-standard-tail-weight-v5.cjs").freeze(snapshot,{...prepared,report:v5.document});
  }
 }catch{snapshot.positionMultiSeasonV3={status:"missing_prior_model",rows:[],researchOnly:true};}
 // Precommit new research-only policy choices in the SAME original Git snapshot.
 // No additional vendor call, no changes to selected champion directions.
 try{snapshot.standardFutureAgreementV1=require("../src/nhl-standard-future-agreement-v1.cjs").freeze(snapshot);}
 catch{snapshot.standardFutureAgreementV1={status:"abstained_invalid_original_source",rows:[],researchOnly:true,approved:false};}
 try{
  const preview=committedSource("outputs/pregame-availability/official-preview-latest.json",now);
  const external=committedSource("outputs/pregame-availability/latest.json",now);
  snapshot.standardQualityShadowV2=require("../src/nhl-standard-quality-challenger-v2.cjs").freeze(snapshot,{
   official:preview?.document??null,officialGitAt:preview?.firstCommittedAt??null,
   external:external?.document??null,externalGitAt:external?.firstCommittedAt??null});
 }catch(e){snapshot.standardQualityShadowV2={
   status:"shadow_abstained_invalid_model_or_source",reasons:[e.message],
   rows:[],modelPromoted:false,bettingEligible:false};}
 try{
  const preview=committedSource("outputs/pregame-availability/official-preview-latest.json",now);
  const external=committedSource("outputs/pregame-availability/latest.json",now);
  const availabilityContext={
   official:preview?.document??null,officialGitAt:preview?.firstCommittedAt??null,
   external:external?.document??null,externalGitAt:external?.firstCommittedAt??null};
  snapshot.standardQualityInputABV1=require("../src/nhl-standard-input-frozen-ab-v1.cjs").freeze(
   snapshot,{currentAdaptive:controlAdaptiveEvidence,
    currentPosition:controlPositionEvidence,
    controlContext:availabilityContext,treatmentContext:availabilityContext,
    inputSource:multi});
 }catch(e){snapshot.standardQualityInputABV1={
  kind:"nhl_standard_strict_original_offer_input_ab_v1",
  status:"not_enrolled",reason:"strict_ab_freeze_failed",
  generatedAt:snapshot.generatedAt,researchOnly:true,modelPromoted:false,
  calibrated:false,bettingEligible:false,placedWagers:0};}
 // Precommit the Standard SOG, blocked-shot, points and assists market
 // challengers to this SAME original board snapshot, before grading. The
 // historical fallback is NOT a substitute for the original first-Git proof.
 // Never reconstruct these candidates after the event as live forecasts.
 try{
  const approved=committedSource("outputs/approved-nhl-sources/latest.json",now);
  snapshot.standardTripleChallenger=require("../src/nhl-standard-triple-challenger.cjs")
   .freezeOnOriginalSelections(snapshot,
    multi?.history??read("outputs/history/players.json"),{
     asOf:now,approved:approved?.document??null,movementContext});
  snapshot.standardTripleChallenger.originalSourceFirstGitAtStillRequired=true;
  snapshot.standardTripleChallenger.realPlatformAppOfferVerified=false;
 }catch(e){
  snapshot.standardTripleChallenger={
   kind:"nhl_standard_precommitted_three_challengers_v1",
   createdAt:now,originalSnapshotGeneratedAt:now,
   status:"not_enrolled_missing_exact_original_or_prior_verified_source",
   rows:[],originalStandardSelectionCount:0,
   reason:"original_frozen_standard_challenger_unavailable",
   researchOnly:true,modelPromoted:false,calibrated:false,
   automaticRecommendationEligible:false,bettingEligible:false};
 }
 // Fixed calibration sensitivity is registered pregame on exactly the same
 // Standard original offer. This never promotes a confidence percentage.
 try{
  snapshot.standardForwardCalibrationShadow=require("../src/nhl-standard-forward-calibration.cjs")
   .freeze(snapshot);
 }catch{
  snapshot.standardForwardCalibrationShadow={
   kind:"nhl_standard_forward_fixed_shrink_original_git_v1",
   status:"not_enrolled_missing_exact_original_or_clock",
   rows:[],researchOnly:true,calibrated:false,
   modelPromoted:false,bettingEligible:false};
 }
 // Freeze the new live-context / position / opponent-attack research arm
 // IN THE SAME FIRST GIT SNAPSHOT as the original champion and strict arm.
 // Sources must be ALREADY Git-committed and observed before freeze time;
 // never reattach a "latest" file to old frozen picks after outcomes arrive.
 try{
  const approved=committedSource("outputs/approved-nhl-sources/latest.json",now);
  const external=committedSource("outputs/pregame-availability/latest.json",now);
  const officialAttempts=committedResearchHistory(now,
   "outputs/research/nhl-block-exposure-history",
   "official_nhl_exact_game_block_exposure_v1");
  // New immutable SOG/points/assists CONCESSIONS are independently collected.
  // Do not merge into attempts: duplicate game IDs must never inflate either
  // metric or silently make an old originally-frozen record eligible.
  const officialConcessions=committedResearchHistory(now,
   "outputs/research/nhl-opponent-concessions-history",
   "official_nhl_exact_game_block_exposure_v1");
  snapshot.multifactorFutureV1=require("../src/nhl-multifactor-future-v1.cjs").freeze(snapshot,{
   approved:approved?.document??null,external:external?.document??null,
   schedule:read("outputs/official-nhl/season-schedules/2026-27.json"),
   officialAttempts,officialConcessions});
  snapshot.multifactorFutureV1.sourceFirstGitAudit={
   approvedCommittedBeforeFreeze:!!approved,
   externalCommittedBeforeFreeze:!!external,
   officialHistoricalAttemptArchives:officialAttempts.length,
   officialHistoricalConcessionArchives:officialConcessions.length,
   allSourceObservationsCheckedAgainstSameOriginalFreeze:true,
   firstGitForThisNewSnapshotStillRequired:true};
 }catch(e){snapshot.multifactorFutureV1={
  kind:"nhl_multifactor_point_in_time_future_ab_v1",
  generatedAt:snapshot.generatedAt,status:"not_enrolled_source_or_chronology_error",
  reason:"required_pregame_evidence_unavailable",rows:[],researchOnly:true,
  modelPromoted:false,calibrationApproved:false,bettingEligible:false};}
 // New eight-hypothesis research study: same original first-Git snapshot only.
 // External MoneyPuck evidence must be independently Git-committed before now.
 try{
  const verified=committedSource("outputs/approved-nhl-sources/latest.json",now);
  const scoring=require("../src/nhl-strict-official-evidence-v1.cjs");
  const enriched=scoring.enrichHistory(
   multi?.history??read("outputs/history/players.json"),
   committedResearchHistory(now,"outputs/research/nhl-pp-scoring-history",
    "official_nhl_exact_game_pp_scoring_v1"));
  const block=scoring.enrichBlockHistory(enriched.history,
   committedResearchHistory(now,"outputs/research/nhl-block-exposure-history",
    "official_nhl_exact_game_block_exposure_v1"));
  snapshot.eightAccuracyResearchV1=require("../src/nhl-eight-accuracy-research-v1.cjs").freeze(snapshot,{
   history:block.history,
   approved:verified?.document??null});
  snapshot.eightAccuracyResearchV1.officialScoringContextCoverage=enriched.counts;
  snapshot.eightAccuracyResearchV1.officialBlockExposureCoverage=block.counts;
 }catch(e){
  snapshot.eightAccuracyResearchV1={
   kind:"nhl_standard_eight_accuracy_source_gated_shadow_20261120_v1",
   status:"not_enrolled",reason:"invalid_original_or_pregame_history",
   rows:[],researchOnly:true,modelPromoted:false,bettingEligible:false};
 }
 // Market-specific frozen RESEARCH alternatives: no strict-gate changes.
 // All coefficients were declared before any new prospective slate.
 try{
  snapshot.marketDirectionResearchV1=require("../src/nhl-market-direction-research-v1.cjs")
   .freeze(snapshot,multi?.history??read("outputs/history/players.json"));
 }catch(e){
  snapshot.marketDirectionResearchV1={kind:"nhl_four_market_pregame_direction_research_v1",
   generatedAt:now,status:"not_enrolled",reason:"invalid_official_past_only_input",
   rows:[],researchOnly:true,modelPromoted:false,bettingEligible:false};
 }
 // Separate older-season TRAINING-CHOSEN shadow, conditional only on
 // pre-existing first-Git archived aggregate. Never retroactively attach it.
 try{
  const priorTraining=committedSource(
   "outputs/backtests/nhl-older-seasons-locked-market-families-latest.json",now);
  if(!priorTraining)throw Error("older_season_training_not_committed");
  snapshot.olderSeasonTrainedShadowV1=require("../src/nhl-older-season-trained-shadow-v1.cjs")
   .freeze(snapshot,priorTraining.document,{
    sourceFirstGitAt:priorTraining.firstCommittedAt});
 }catch(e){
  snapshot.olderSeasonTrainedShadowV1={
   kind:"nhl_older_season_chosen_family_first_git_shadow_v1",
   generatedAt:now,status:"not_enrolled",
   reason:"historical_training_artifact_not_prior_git_verified",
   rows:[],bettingEligible:false,modelPromoted:false};
 }
 // Strict directional research precommitted in the exact same source snapshot.
 // Neither original selections nor model champion directions are modified.
 try{
  snapshot.strictDirectionalShadowV1=require("../src/nhl-strict-directional-abstention-v1.cjs").freeze(snapshot);
 }catch(e){
  snapshot.strictDirectionalShadowV1={
   kind:"nhl_strict_market_directional_abstention_shadow_20261120_v1",
   status:"not_enrolled",reason:"immutable_original_or_evidence_invalid",
   rows:[],researchOnly:true,modelPromoted:false,bettingEligible:false};
 }
 try{snapshot.goblinPastOnlyCalibrationV1=require("../src/nhl-goblin-past-only-calibration-v1.cjs").freeze(snapshot,
   optional("outputs/research/registry/nhl-precommitted-ledger-latest.json"));}
 catch{snapshot.goblinPastOnlyCalibrationV1={status:"abstained_invalid_prior_ledger",rows:[],researchOnly:true,calibrationApproved:false};}
 try{snapshot.lineupEvidenceReleaseV1=require("../src/nhl-lineup-evidence-release-v1.cjs").audit(snapshot);}
 catch{snapshot.lineupEvidenceReleaseV1={status:"abstained_invalid_lineup_evidence",productionEligible:false,verifiedJointProbability:null,verifiedExpectedValue:null};}
 // Fixed hypothesis using ACTUAL official PBP attempts and historical
 // defensive opportunity. Unlike aggregate synthetic replay, this is frozen
 // on the same original offered SOG threshold before first Git and puck drop.
 try{
  const verifiedAttemptDates=committedActualAttemptDates(now);
  snapshot.sogActualAttemptFutureV1=require("../src/nhl-official-attempt-future-v1.cjs")
   .freeze(snapshot,verifiedAttemptDates);
  try{snapshot.blockAttemptOpportunityV1=require("../src/nhl-verified-block-attempt-opportunity-v1.cjs").freeze(snapshot,verifiedAttemptDates,multi?.history??read("outputs/history/players.json"));}
  catch{snapshot.blockAttemptOpportunityV1={status:"source_unavailable",rows:[],modelPromoted:false,calibrated:false};}
 }catch{
  snapshot.sogActualAttemptFutureV1={
   kind:"nhl_original_git_official_attempt_sog_future_v1",
   generatedAt:now,status:"not_enrolled_source_or_original_clock_unverified",
   rows:[],modelPromoted:false,productionEligible:false,
   bettingEligible:false,placedWagers:0};
 }
 snapshot.standardCalibrationShadow=fitAtFreeze(
  optional("outputs/research/registry/nhl-precommitted-ledger-latest.json"),now);
 const name=now.slice(0,19).replace(/[-:]/g,"")+"Z";
 const dir=path.join(root,"outputs/research/snapshots");
 fs.mkdirSync(dir,{recursive:true});
 const output=path.join(dir,name+".json");
 fs.writeFileSync(output,JSON.stringify(snapshot,null,2)+"\n",{flag:"wx"});
 console.log(JSON.stringify({snapshotPath:path.relative(root,output),selected:readiness.selectedIndividualProps,
  sourceBoardAt:archive.boards.NHL.boardAsOfAt,recordedAt:now,
  gradeableOnlyAfterOriginalGitCommitBeforePuckDrop:true,
  doesNotVerifyOriginalPlatformAvailability:true,actualWagersPlaced:0}));
 return output;
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main,committedActualAttemptDates};
