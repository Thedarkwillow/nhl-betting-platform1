"use strict";
/**
 * First-Git-pregame-only experiment on original Standard NHL offered lines.
 * The "multifactor" arm is a stricter ABSTENTION filter, not a new direction.
 * Comparison with incumbent is coverage/retained-vs-skipped; on the SAME
 * retained offers, both sides are identical by design. No retrospective fit.
 */
const {assess:live}=require("./nhl-pregame-live-context-v1.cjs");
const {assess:position}=require("./nhl-multifactor-position-matchup-v1.cjs");
const {assessNhlOpponentOpportunity}=require("./nhl-opponent-opportunity-gate-v1.cjs");
const {LIMITS,key}=require("./nhl-standard-quality-challenger-v2.cjs");
const {officialOutcome}=require("./nhl-standard-abstention-audit.cjs");
const KIND="nhl_multifactor_point_in_time_future_ab_v1";
const at=s=>typeof s==="string"?Date.parse(s):NaN;
const pacificDay=s=>{if(!Number.isFinite(at(s)))return null;
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
 year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(s)).map(x=>[x.type,x.value]));
 return [p.year,p.month,p.day].join("-")};
const identity=(p,side)=>[p.gameId,p.playerId,p.market,p.line,p.tier,p.capturedAt,p.gameStartAt,side].join("|");
function freeze(s,{approved=null,external=null,schedule=null,
 officialAttempts=[],officialConcessions=[]}={}){
 const base={kind:KIND,generatedAt:s?.generatedAt||null,
  status:"registered_pregame_research_only",firstGitAfterPolicyRequired:true,
  originalSelectionSideNeverReversed:true,modelProbabilitiesUnchanged:true,
  strictThresholdsNotWeakened:true,expectedValueVerified:false,
  bettingEligible:false,calibrationApproved:false,modelPromoted:false};
 if(!Number.isFinite(at(s?.generatedAt))||!Array.isArray(s?.individualPropSelections)||
  !Array.isArray(s?.rankedProps))return {...base,status:"not_enrolled_missing_original_source",rows:[]};
 const all=s.individualPropSelections.filter(p=>p.tier==="Standard"&&LIMITS[p.market]),
  quality=s.standardQualityShadowV2?.rows,rows=[],seen=new Set();
 for(const p of all){
  const k=key(p),clock=at(s.generatedAt),start=at(p.gameStartAt),capture=at(p.capturedAt),
   valid=[clock,start,capture].every(Number.isFinite)&&
    capture<=clock&&clock-capture<=30*60000&&start-clock>=15*60000&&
    Number.isInteger(p.gameId)&&Number.isInteger(p.playerId);
  if(!valid||seen.has(k))return {...base,status:"not_enrolled_invalid_or_duplicate_original",rows:[]};
  seen.add(k);
  const raw=s.rankedProps.filter(x=>key(x)===k&&x.lean===p.lean&&
   x.capturedAt===p.capturedAt&&x.gameStartAt===p.gameStartAt);
  if(raw.length!==1||!Number.isFinite(p.probability))
   return {...base,status:"not_enrolled_original_side_unverified",rows:[]};
  const q=(Array.isArray(quality)?quality:[]).filter(x=>key(x)===k&&
   x.originalSide===p.lean&&x.capturedAt===p.capturedAt&&x.gameStartAt===p.gameStartAt&&
   x.originalLine===p.line);
  const control=q.length===1&&q[0].status==="shadow_selected_research_only"&&
    q[0].bettingEligible===false;
  const corroboratedQuality=q.length===1&&["shadow_selected_research_only","shadow_abstain"].includes(q[0].status);
  const prop={...p,projection:raw[0].projection,observations:raw[0].observations};
  const match=(s.standardTripleChallenger?.rows||[]).filter(x=>
    x.gameId===p.gameId&&x.playerId===p.playerId&&x.market===p.market&&
    x.line===p.line&&x.tier===p.tier&&x.originalSelectedSide===p.lean&&
    x.originalCapturedAt===p.capturedAt&&x.gameStartAt===p.gameStartAt);
  const matched=match.length===1&&match[0].variants?.matchup?.status==="research_only"&&
    match[0].decisions?.matchup?.side===p.lean?{
      direction:p.lean,projection:match[0].variants.matchup.estimate}:null;
  const opp=assessNhlOpponentOpportunity({market:p.market,line:p.line,direction:p.lean,
    projection:raw[0].projection,observations:raw[0].observations,
    opponent:p.opponent,capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,
    matchup:matched},p.market==="blockedShots"?
      // Both official archives contain independently reconciled exact attempts.
      // The opportunity gate already rejects duplicate game IDs, so a single
      // historical game cannot inflate the eight-game prior sample.
      [...officialAttempts,...officialConcessions]:officialConcessions);
  const pf=position(s,p,{opponentOpportunity:opp}),
    lc=live(prop,{asOf:s.generatedAt,approved,external,schedule});
  const reasons=[];
  if(!corroboratedQuality)reasons.push("original_quality_shadow_missing");
  if(!control)reasons.push("incumbent_strict_policy_abstained");
  if(pf.researchEvidenceQualified!==true)reasons.push("multifactor_position_and_opportunity_insufficient");
  if(lc.lineAndPP?.status!=="matched_projected_line")reasons.push("projected_pp_and_linemates_unverified");
  if(lc.injury?.negativeReport===true)reasons.push("negative_or_uncertain_injury_report");
  if(lc.restAndTravel?.status!=="official_schedule_verified")reasons.push("official_rest_or_venue_exposure_missing");
  if(lc.expectedGoals?.status!=="fresh_season_to_date_research_only")
   reasons.push("fresh_xg_and_opponent_quality_unverified");
  // Reported goalie only; no expected/projected starter becomes official.
  if(lc.opposingGoalie?.status!=="reporter_confirmed")
   reasons.push("opposing_goalie_report_not_reconciled");
  if(["points","assists","goals","powerPlayPoints"].includes(p.market)&&
    lc.lineAndPP?.projectedPowerPlayRoleVerified!==true)
    reasons.push("power_play_role_unverified");
  const kept=reasons.length===0;
  rows.push({gameId:p.gameId,playerId:p.playerId,market:p.market,line:p.line,tier:p.tier,
   capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,originalSide:p.lean,
   originalModelEstimate:p.probability,controlSelected:control,multifactorKept:kept,
   sourceAudit:{position:pf.position,positionHistoricalPass:pf.positionOpponent?.last10?.games>=8,
    opponentOfficialExposure:opp.opponentOpportunityVerified,
    opponentOfficialConcession:opp.opponentConcessions?.verified===true,
    opponentConcededPerGame:opp.opponentConcessions?.concededPerGame??null,
    opponentConcessionGameCount:opp.opponentConcessions?.priorDistinctGames??null,
    // Immutable nested evidence reasons show the REAL source blocker without
    // changing any original selection side or policy threshold.
    opponentOpportunityReasons:Array.isArray(opp.reasons)?[...new Set(opp.reasons)]:[],
    positionAndUsageReasons:Array.isArray(pf.reasons)?[...new Set(pf.reasons)]:[],
    // Preserve source-specific original observation STATUS when a provider
    // provides no machine reason (e.g. goalie reported but unconfirmed).
    // These are first-Git frozen annotations; future graders never refetch.
    projectedLineEvidenceReason:lc.lineAndPP?.status!=="matched_projected_line"?
      lc.lineAndPP?.reason||lc.lineAndPP?.status||"line_source_unavailable":null,
    expectedGoalsEvidenceReason:lc.expectedGoals?.status!=="fresh_season_to_date_research_only"?
      lc.expectedGoals?.reason||lc.expectedGoals?.status||"xg_source_unavailable":null,
    restScheduleEvidenceReason:lc.restAndTravel?.status!=="official_schedule_verified"?
      lc.restAndTravel?.reason||lc.restAndTravel?.status||"rest_source_unavailable":null,
    opposingGoalieEvidenceReason:lc.opposingGoalie?.status!=="reporter_confirmed"?
      lc.opposingGoalie?.reason||lc.opposingGoalie?.status||"goalie_report_unavailable":null,
    iceTimeCrosscheckStatus:pf.iceTimeCrosscheck?.status||"unavailable",
    iceTimeCrosscheckReason:pf.iceTimeCrosscheck?.reason||null,
    historicalIceTimeRoleShiftRisk:pf.iceTimeCrosscheck?.roleShiftRisk===true,
    projectedEVUnit:lc.lineAndPP?.evenStrengthUnit||null,
    projectedPowerPlayUnit:lc.lineAndPP?.powerPlayUnit||null,
    projectedLinemates:lc.lineAndPP?.linemateIds?.length||0,
    injuriesUnknownNotCleared:lc.injury?.positiveMedicalClearance!==true,
    negativeInjuryReport:lc.injury?.negativeReport===true,
    goalieReporterConfirmed:lc.opposingGoalie?.status==="reporter_confirmed",
    goalieOfficialClubConfirmed:false,
    restDays:lc.restAndTravel?.restDays??null,
    backToBack:lc.restAndTravel?.backToBack??null,
    venueTransition:lc.restAndTravel?.hostVenueChanged??null,
    verifiedTravelKm:null,
    xGoalsForPer60:lc.expectedGoals?.teamXGoalsForPer60??null,
    xGoalsAgainstPer60:lc.expectedGoals?.opponentXGoalsAgainstPer60??null},
   reasons:[...new Set(reasons)],conditionalOnActualAppearance:true,
   alwaysHigherBaseline:"Higher",alwaysLowerBaseline:"Lower",
   activePlayerVerified:false,originalPlatformOfferAuthenticated:false,
   highConfidenceEligible:false,bettingEligible:false});
 }
 return {...base,originals:all.length,rows,
  incumbentKept:rows.filter(r=>r.controlSelected).length,
  multifactorKept:rows.filter(r=>r.multifactorKept).length,
  todayRosterAndOfficialGoalieClearanceMissing:true,
  highConfidenceApproved:0,
  differencesAreAbstentionsNotNewModelDirections:true};
}
// Count only originally frozen blocker annotations. Never reinterpret a prior
// pick using current source feeds, outcomes, or newly repaired archives.
function blockerAudit(records){
 const byMarket={},reasons={},rootCauses={
  opponentOpportunity:{},positionAndUsage:{},liveContext:{}};
 const increment=(obj,k)=>{
  if(typeof k==="string"&&k)obj[k]=(obj[k]||0)+1;
 };
 let rejected=0;
 for(const row of records){
  const market=row.market||"unknown";
  const slot=byMarket[market]||(byMarket[market]={
   registered:0,kept:0,rejected:0,reasons:{}});
  slot.registered++;
  if(row.multifactorKept===true){slot.kept++;continue}
  rejected++;slot.rejected++;
  for(const reason of new Set(Array.isArray(row.reasons)?row.reasons:[])){
   increment(reasons,reason);increment(slot.reasons,reason);
  }
  if(!row.reasons?.length)increment(reasons,"missing_frozen_rejection_annotation");
  const audit=row.sourceAudit||{};
  for(const reason of new Set(audit.opponentOpportunityReasons||[]))
   increment(rootCauses.opponentOpportunity,reason);
  for(const reason of new Set(audit.positionAndUsageReasons||[]))
   increment(rootCauses.positionAndUsage,reason);
  if(audit.iceTimeCrosscheckReason)
   increment(rootCauses.positionAndUsage,audit.iceTimeCrosscheckReason);
  if(audit.historicalIceTimeRoleShiftRisk===true)
   increment(rootCauses.positionAndUsage,"historical_ice_time_role_shift_risk_diagnostic");
  for(const reason of new Set([
   audit.projectedLineEvidenceReason,audit.expectedGoalsEvidenceReason,
   audit.restScheduleEvidenceReason,audit.opposingGoalieEvidenceReason].filter(Boolean)))
   increment(rootCauses.liveContext,reason);
 }
 return {registered:records.length,kept:records.length-rejected,rejected,
  reasons,byMarket,sourceSpecificFrozenRootCauses:rootCauses,
  sourceSpecificReasonsOnlyAvailableWhenOriginallyFrozen:true,
  noPostgameReclassification:true,bettingEligible:false};
}
function summarize(records){
 const byGame=new Set(),byDay=new Set();
 let pending=0,push=0,decided=0,correct=0,hi=0,lo=0;
 const games=new Map(),slates=new Map();
 for(const r of records){
  if(r.outcome.status==="pending"){pending++;continue}
  if(r.outcome.status==="push"){push++;continue}
  decided++;byGame.add(r.gameId);byDay.add(pacificDay(r.gameStartAt));
  const hit=Number(r.originalSide===r.outcome.side),higher=Number(r.outcome.side==="Higher");
  correct+=hit;hi+=higher;lo+=1-higher;
  for(const [map,k] of [[games,r.gameId],[slates,pacificDay(r.gameStartAt)]]){
   const x=map.get(k)||{n:0,diffLower:0,diffHigher:0};
   x.n++;x.diffLower+=hit-(1-higher);x.diffHigher+=hit-higher;map.set(k,x);
  }
 }
 const {ci}=require("./nhl-prospective-slate-baseline-audit.cjs");
 const interval=(map,field)=>ci([...map.values()].map(x=>({n:x.n,diff:x[field]})));
 const gl=decided?interval(games,"diffLower"):null,gh=decided?interval(games,"diffHigher"):null,
  sl=decided?interval(slates,"diffLower"):null,sh=decided?interval(slates,"diffHigher"):null;
 const sample=decided>=200&&byGame.size>=30&&byDay.size>=20;
 return {registered:records.length,pending,push,decided,correct,
  distinctGames:byGame.size,distinctPacificSlates:byDay.size,
  hitRate:decided?correct/decided:null,
  alwaysHigherSameLines:decided?hi/decided:null,
  alwaysLowerSameLines:decided?lo/decided:null,
  gameCluster95VsHigher:gh,gameCluster95VsLower:gl,
  slateCluster95VsHigher:sh,slateCluster95VsLower:sl,
  minimumSampleMet:sample,descriptiveBeatsBothBaselines:
   !!(sample&&gh?.lower>0&&gl?.lower>0&&sh?.lower>0&&sl?.lower>0),
  modelPromoted:false,bettingEligible:false};
}
/** Predeclared future-only evaluation policy. Kept vs skipped is
 * observational selection bias, NOT a causally paired new-model edge.
 * No possibility of automatically authorizing model promotion or wagers.
 */
function acceptance(kept,skipped){
 const min={decided:200,distinctGames:30,distinctPacificSlates:20};
 const sample=!!kept&&kept.decided>=min.decided&&
  kept.distinctGames>=min.distinctGames&&
  kept.distinctPacificSlates>=min.distinctPacificSlates;
 const bounds={};
 for(const name of ["gameCluster95VsHigher","gameCluster95VsLower",
  "slateCluster95VsHigher","slateCluster95VsLower"]){
  const ci=kept?.[name];
  bounds[name]=ci&&Number.isFinite(ci.lower)&&Number.isFinite(ci.upper)&&
   ci.lower>0&&ci.upper>=ci.lower;
 }
 const supported=sample&&Object.values(bounds).every(Boolean);
 const enoughSkipped=skipped?.decided>=30&&Number.isFinite(skipped.hitRate);
 return {kind:"nhl_multifactor_prospective_acceptance_research_v1",
  requirement:min,keptDecided:kept?.decided??0,
  keptGames:kept?.distinctGames??0,keptPacificSlates:kept?.distinctPacificSlates??0,
  firstGitSourceOnly:true,identicalOriginalOfferedLineThresholdsOnly:true,
  minProspectiveSampleMet:sample,allFourClusterBaselineLowerBoundsPositive:supported,
  comparisonsPassed:Object.fromEntries(Object.entries(bounds).map(([k,v])=>[k,!!v])),
  skippedDecided:skipped?.decided??0,
  descriptiveKeptMinusSkippedRate:enoughSkipped&&Number.isFinite(kept?.hitRate)&&
   kept.decided>=30?Number((kept.hitRate-skipped.hitRate).toFixed(6)):null,
  descriptiveKeptVsSkippedNotPairedOrCausal:true,
  preliminaryProspectiveBaselineSupport:supported,
  independentCalibrationApproved:false,originalAppQuotesAuthenticated:false,
  payoutEVVerified:false,modelPromoted:false,approvedLineups:0,
  highConfidenceApproved:false,bettingEligible:false};
}
function grade(frames,history,{policyFirstGitAt}={}){
 const cutoff=at(policyFirstGitAt),seen=new Set(),accepted=[],exclusions={};
 const skip=x=>exclusions[x]=(exclusions[x]||0)+1;
 if(!Number.isFinite(cutoff)||!Array.isArray(frames)||!history?.players)
  return {kind:KIND,status:"policy_or_official_results_unavailable",registered:0,
   modelPromoted:false,bettingEligible:false};
 for(const f of [...frames].sort((a,b)=>at(a.firstGitCommittedAt)-at(b.firstGitCommittedAt))){
  const s=f?.snapshot,first=at(f?.firstGitCommittedAt),created=at(s?.generatedAt),trial=s?.multifactorFutureV1;
  if(f.gitHistoryCount!==1||![first,created].every(Number.isFinite)||
   first<=cutoff||created<=cutoff||created>first||first-created>15*60000||
   trial?.kind!==KIND||trial.status!=="registered_pregame_research_only"||
   trial.generatedAt!==s.generatedAt||!Array.isArray(trial.rows)||
   !Array.isArray(s.individualPropSelections)||!Array.isArray(s.rankedProps)||
   trial.rows.length!==s.individualPropSelections.filter(p=>p.tier==="Standard"&&LIMITS[p.market]).length){
   skip("not_first_git_precommitted_population");continue;
  }
  const population=s.individualPropSelections.filter(p=>p.tier==="Standard"&&LIMITS[p.market]);
  for(const p of population){
   const k=key(p);
   if(seen.has(k)){skip("duplicate_original_threshold");continue}
   seen.add(k);
   const raw=s.rankedProps.filter(x=>key(x)===k&&x.lean===p.lean&&
     x.capturedAt===p.capturedAt&&x.gameStartAt===p.gameStartAt);
   const rows=trial.rows.filter(x=>key(x)===k&&
      x.originalSide===p.lean&&x.capturedAt===p.capturedAt&&x.gameStartAt===p.gameStartAt);
   if(raw.length!==1||rows.length!==1||rows[0].originalModelEstimate!==p.probability||
    rows[0].multifactorKept&&!rows[0].controlSelected||
    rows[0].bettingEligible!==false||rows[0].highConfidenceEligible!==false||
    first>=at(p.gameStartAt)-15*60000||at(p.capturedAt)>created||
    at(p.gameStartAt)<=created){skip("original_line_or_shadow_broken");continue}
   const outcome=officialOutcome(p,history);
   accepted.push({...rows[0],outcome});
  }
 }
 const all=summarize(accepted),incumbent=summarize(accepted.filter(x=>x.controlSelected)),
  kept=summarize(accepted.filter(x=>x.multifactorKept)),
  skipped=summarize(accepted.filter(x=>x.controlSelected&&!x.multifactorKept));
 const marketSet=[...new Set(accepted.map(x=>x.market))];
 const byMarket=Object.fromEntries(marketSet.map(m=>[m,{
  multifactor:summarize(accepted.filter(x=>x.market===m&&x.multifactorKept)),
  incumbent:summarize(accepted.filter(x=>x.market===m&&x.controlSelected)),
  skipped:summarize(accepted.filter(x=>x.market===m&&x.controlSelected&&!x.multifactorKept))}]));
 return {kind:KIND,status:"future_original_first_git_only",
  policyFirstGitAt,originalRowsAccepted:accepted.length,excluded:exclusions,
  allOriginalModel:all,existingStrictModel:incumbent,
  multifactorKept:kept,incumbentSkippedByMultifactor:skipped,byMarket,
  multifactorBlockerAudit:{
   allOriginallyFrozen: blockerAudit(accepted),
   incumbentStrictCandidates: blockerAudit(accepted.filter(x=>x.controlSelected))
  },
  prospectiveAcceptance:acceptance(kept,skipped),
  originalDirectionUnchanged:true,incumbentMatchesMultifactorOnOverlappingPicks:true,
  differenceIsSelectionCoverageNotPairedDirectionPerformance:true,
  newlyFittedProbabilityModel:false,modelPromoted:false,
  caliberAndBookabilityNotApproved:true,
  highConfidenceApproved:false,bettingEligible:false,placedWagers:0};
}
module.exports={KIND,freeze,summarize,blockerAudit,acceptance,grade};
