"use strict";
/** Bridge private partner observations to ORIGINAL future Git-frozen research picks. */
const {buildFreeNhlResearch}=require("./free-nhl-research.cjs");
const {identifyGame}=require("./nhl-game-identity.cjs");
const {selectIndividualProps,POLICY}=require("./nhl-frozen-individual-props.cjs");
const {frozenSelectionReadiness}=require("./nhl-prospective-freeze-readiness.cjs");
const {freezeSimpleBenchmarks}=require("./nhl-simple-pregame-challengers.cjs");
const {optimize}=require("./nhl-lineup-optimizer.cjs");
const {freezeOnOriginalSelections}=require("./nhl-standard-triple-challenger.cjs");
const {freeze:freezeForwardCalibration}=require("./nhl-standard-forward-calibration.cjs");
const {freeze:freezeRateShadow}=require("./nhl-forward-opponent-rate.cjs");
const {freeze:freezeExpandedShadow}=require("./nhl-forward-expanded-market.cjs");
const {freeze:freezeAllTiers}=require("./nhl-all-tier-probability-sensitivity.cjs");
const {freeze:freezeAllTierMass}=require("./nhl-all-tier-exact-mass-calibration.cjs");
const asTime=x=>typeof x==="string"?Date.parse(x):NaN;
function buildPartnerPregameFreeze(board,projections,schedule,history,now=new Date().toISOString(),builder=buildFreeNhlResearch,approvedSources=null,movementContext=null){
 const nowAt=asTime(now),observed=asTime(board?.boardAsOfAt);
 if(!Number.isFinite(nowAt)||board?.provider!=="partner-api.prizepicks.com"||
  board?.sourceStatus!=="fresh"||board?.snapshotMode!=="direct_live_board"||
  board?.completePagination!==true||board?.sourceScope!=="full_provider_board"||
  !Number.isFinite(observed)||observed>nowAt||nowAt-observed>30*60000||
  board?.originalModelSelectionGitFrozen!==false||
  schedule?.complete!==true||!Array.isArray(schedule.games)||
  !history?.players||!projections?.players)
  throw Error("Fresh complete observed partner board, official schedule and cached NHL histories required");
 const out=builder(board,projections,now);
 if(out.boardFresh!==true||out.projectionsFresh!==true||
  !Array.isArray(out.rankedProps)||out.source!=="partner-api.prizepicks.com")
  throw Error("Existing NHL projection engine did not produce valid fresh research");
 const exclusions={unresolvedOfficialGame:0,notFuture15Min:0};
 const games=schedule.games.filter(g=>Number.isInteger(g.id)&&
  typeof g.home==="string"&&typeof g.away==="string"&&Number.isFinite(asTime(g.startTimeUTC)));
 const rows=[];
 for(const p of out.rankedProps){
  if(!Number.isFinite(asTime(p.eventStartsAt))||asTime(p.eventStartsAt)<=nowAt+15*60000){
   exclusions.notFuture15Min++;continue;
  }
  const plausible=games.filter(g=>Math.abs(asTime(g.startTimeUTC)-asTime(p.eventStartsAt))<=300000);
  const identity=identifyGame(p,plausible);
  if(!identity){exclusions.unresolvedOfficialGame++;continue;}
  rows.push({...p,gameId:identity.gameId,gameStartAt:identity.gameStartAt});
 }
 out.generatedAt=now;
 out.rankedProps=rows;
 out.gameIdentityResolved=rows.length;
 out.officialGameScheduleSource="archived_complete_official_NHL_2026_27_season_schedule";
 out.originalModelSelectionGitFrozen=false;
 out.individualPropSelectionPolicy=POLICY;
 const selected=selectIndividualProps(rows);
 out.individualPropSelections=selected.selected;
 out.individualPropSelectionSummary={selectedUniqueIndividualProps:selected.selected.length,
  abstained:selected.abstained,excluded:selected.exclusions,identityExclusions:exclusions,
  originalGitCommitBeforeStartStillRequired:true,modelCalibrated:false,originalSettlementVerified:false};
 out.boardCoverageComplete=true;
 out.captureScopeComplete=true;
 out.boardFresh=true;
 out.lineups=optimize(rows,{at:now,allowSameGameFallback:false});
 out.lineupCorrelationPolicy="strict_independent_games_only_research_no_validated_joint_probability";
 // Separate diagnostics never change the optimizer or marginal estimates.
 out.privateLineupUncertainty=Object.fromEntries(Object.entries(out.lineups||{}).filter(([,l])=>Array.isArray(l?.picks)).map(([n,l])=>[n,require("./lineup-dependence-bounds-research.cjs").summarize(l.picks)]));
 // Separately freeze format-specific scenarios; champion and public export stay unchanged.
 try{
  const options={at:now,allowSameGameFallback:false};
  out.privateFormatLineupResearch={kind:"nhl_private_power_flex_scenario_v1",generatedAt:now,
   power:optimize(rows,{...options,researchFormat:"power"}),
   flex:optimize(rows,{...options,min:3,researchFormat:"flex"}),
   researchOnly:true,modelPromoted:false,verifiedExpectedValue:null,
   firstGitProofStillRequired:true,originalPlatformSettlementVerified:false};
  const summarize=require("./lineup-dependence-bounds-research.cjs").summarize;
  out.privateFormatUncertainty=Object.fromEntries(["power","flex"].flatMap(format=>Object.entries(out.privateFormatLineupResearch[format]||{}).filter(([,l])=>Array.isArray(l?.picks)).map(([n,l])=>[format+"_"+n,summarize(l.picks)])));
 }catch{out.privateFormatLineupResearch={kind:"nhl_private_power_flex_scenario_v1",status:"abstained_invalid_source",researchOnly:true,modelPromoted:false};}
 const readiness=frozenSelectionReadiness({research:out,now});
 if(!readiness.ready)throw Error("No valid original future pregame selections: "+readiness.reasons.join(","));
 out.simplePregameBenchmarks=freezeSimpleBenchmarks(selected.selected,history,{now});
 // Shadow forecasts are frozen ALONGSIDE original selections in the same
 // remote private Git commit. Never recalculate old snapshots post-game.
 out.standardTripleChallenger=freezeOnOriginalSelections(out,history,
  {asOf:now,approved:approvedSources,movementContext});
 // Predeclared sensitivity is frozen in the SAME original source commit,
 // never reconstructed from a winning historical selection after puck drop.
 out.standardForwardCalibrationShadow=freezeForwardCalibration(out);
 out.forwardOpponentRateShadow=freezeRateShadow(out,history);
 // New independent shadow never blocks original capture.
 try{out.forwardExpandedMarketShadow=freezeExpandedShadow(out,history);}catch{out.forwardExpandedMarketShadow={status:"abstained_invalid_history",rows:[],researchOnly:true,modelPromoted:false};}
 try{out.allTierExactMassCalibrationShadow=freezeAllTierMass(out);}catch{out.allTierExactMassCalibrationShadow={status:"abstained_invalid_original",rows:[],researchOnly:true,modelPromoted:false};}
 try{out.allTierProbabilitySensitivity=freezeAllTiers(out);}catch{out.allTierProbabilitySensitivity={status:"abstained_invalid_source",researchOnly:true,modelPromoted:false};}
 try{out.recentRateForwardV1=require("./nhl-recent-rate-forward-v1.cjs").freeze(out,history);}catch{out.recentRateForwardV1={status:"abstained_invalid_history",rows:[],researchOnly:true,modelPromoted:false};}
 try{out.positionRateMatchupV2=require("./nhl-position-rate-matchup-v2.cjs").freeze(out,history,schedule);}catch{out.positionRateMatchupV2={status:"abstained_invalid_history",rows:[],researchOnly:true,modelPromoted:false};}
 out.standardSogLineMovementSource=movementContext?{
  kind:movementContext.kind,status:movementContext.status,
  currentObservedAt:movementContext.currentObservedAt||null,
  previousObservedAt:movementContext.previousObservedAt||null,
  originalPlatformAvailabilityVerified:false,
  modelPromotionPermitted:false}:null;
 out.snapshotKind="nhl_partner_direct_original_pregame_candidate_unproven_until_first_git_commit";
 out.originalFantasyPlatformOfferAuthenticated=false;
 out.originalPlatformSettlementVerified=false;
 out.payoutAdjustedExpectedValue=null;
 out.officialProspectiveGradingEligible=false;
 out.gradingEligibility="Only after original single Git commit time before puck drop and valid official NHL finals";
 return {snapshot:out,readiness,identityExclusions:exclusions};
}
module.exports={buildPartnerPregameFreeze};
