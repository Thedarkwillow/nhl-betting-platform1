"use strict";
/**
 * Precommitted, market-specific directional shadow, not betting selections.
 * Uses only the eight-factor rows already frozen before the game. Higher and
 * Lower require independent-looking evidence agreement and credible exposure;
 * their empirical/shifted estimates share player-history inputs (not independent
 * evidence for calibration).
 * Do NOT fit cutoffs from the retro replay, use outcomes, or flip platform offers.
 */
const {key,LIMITS}=require("./nhl-standard-quality-challenger-v2.cjs");
const KIND="nhl_strict_market_directional_abstention_shadow_20261120_v1";
const BOUND=Object.freeze({
 shotsOnGoal:{higher:.67,lower:.33,empHigher:.57,empLower:.43,need:"on_net_attempts"},
 points:{higher:.68,lower:.32,empHigher:.56,empLower:.44,need:"team_pp_opportunities"},
 assists:{higher:.70,lower:.30,empHigher:.58,empLower:.42,need:"assist_involvement"},
 blockedShots:{higher:.67,lower:.33,empHigher:.57,empLower:.43,need:"defensive_exposure"}
});
const finite=Number.isFinite,prob=p=>finite(p)&&p>=0&&p<=1;
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const s=(p,side)=>side==="Higher"?p:1-p;
const decide=(p,min,max)=>p>=min?"Higher":p<=max?"Lower":null;
function roleCheck(m,raw){
 const ice=raw?.iceTime||{},v=raw?.evidence||{},
  pp=ice.ppVerifiedHistory===true,sh=ice.pkVerifiedHistory===true;
 switch(m){
 case "shotsOnGoal":
  return raw?.shotConversion?.status==="source_verified_pregame"&&
   prob(raw?.models?.shotAttemptConversion)?
    {ok:true,status:"verified_attempt_conversion"}:
    {ok:false,status:"source_gated_shot_attempt_conversion_missing"};
 case "points":
  return pp&&v.assists?.sourceGoalOpportunityAvailable===true&&
   (v.assists?.lineMatesProjected??0)>=1&&
   v.assists?.projectedPowerPlayGroup?
    {ok:true,status:"pp_teammate_offense_source"}:
    {ok:false,status:"pp_teammate_opportunity_not_fully_verified"};
 case "assists":
  return pp&&v.assists?.individualPPAssistHistoryVerified===true&&
   v.assists?.sourceGoalOpportunityAvailable===true?
    {ok:true,status:"historical_pp_assist_involvement_confirmed"}:
    {ok:false,status:"historical_pp_assist_involvement_unverified"};
 case "blockedShots":
  return sh&&v.blocks?.opponentShotAttemptsVerified===true&&
   v.blocks?.defensiveZoneStartsVerified===true?
    {ok:true,status:"verified_pk_opposing_attempt_zone_exposure"}:
    {ok:false,status:"opposing_attempt_or_pk_zone_exposure_unverified"};
 default:return {ok:false,status:"unsupported_market"};
 }
}
function assess(p,r){
 const m=p?.market,c=BOUND[m],
  original={gameId:p?.gameId,playerId:p?.playerId,market:m,
   line:p?.line,tier:p?.tier,originalSide:p?.lean,
   capturedAt:p?.capturedAt,gameStartAt:p?.gameStartAt},
  reject=(why,details={})=>({...original,status:"shadow_abstain",
   reason:why,selectedResearchOnly:false,direction:null,
   directionHigherProbability:null,bettingEligible:false,
   ...(details||{})});
 if(!c||!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
   p.tier!=="Standard"||!["Higher","Lower"].includes(p.lean)||
   !finite(p.line)||p.line<0||p.line%1!==.5||!finite(at(p.capturedAt))||
   !finite(at(p.gameStartAt)))return reject("unsupported_original_source");
 if(!r||r.originalSide!==p.lean||r.gameId!==p.gameId||
  r.playerId!==p.playerId||r.market!==m||r.line!==p.line||
  r.capturedAt!==p.capturedAt||r.gameStartAt!==p.gameStartAt||
  r.status!=="research_only_conditional_on_appearance")
  return reject("missing_unchanged_original_eight_factor_forecast");
 const q=r.models||{},fund=q.opponentAdjusted,emp=q.dist_empirical,
  shifted=q.dist_shifted;
 if(![fund,emp,shifted].every(prob))
  return reject("missing_statistical_direction_components");
 const opportunity=(
  m==="shotsOnGoal"?q.shotAttemptConversion:
  m==="points"||m==="assists"?q.teammateAndRole:
  q.defensiveExposure);
 if(!prob(opportunity))return reject("market_specialist_forecast_missing");
 // Independent direction-specific branches, not a single original lean.
 const higher=.55*opportunity+.45*fund,
  branch=decide(higher,c.higher,c.lower),
  historyBranch=decide(emp,c.empHigher,c.empLower),
  shiftedBranch=decide(shifted,.52,.48);
 const diag={marketModel:higher,
  fundamentalModel:fund,marketSpecialistModel:opportunity,
  historicalOverLine:emp,shiftedHistoricalOverLine:shifted,
  originalSide:p.lean,rawModelDirection:branch,
  historicalDirection:historyBranch,shiftedDirection:shiftedBranch,
  estimatedDirectionConfidence:branch?s(higher,branch):null,
  independentlyCalibrated:false};
 const common={...original,diagnostics:diag,
  status:"shadow_abstain",selectedResearchOnly:false,
  direction:null,directionHigherProbability:higher,
  bettingEligible:false,
  oppositeSideBookabilityVerified:false,
  activeStatusVerified:false,actualPayoutEVVerified:false,
  calibrated:false};
 const withReason=(reason,extra={})=>({...common,reason,...extra});
 const verified=roleCheck(m,r);
 if(!verified.ok)return withReason(verified.status,{
  requiredEvidence:verified.status});
 if(r.iceTime?.instableRecentUsage===true)
  return withReason("unstable_recent_minutes");
 if(r.opponentFactorUsed!==true)
  return withReason("opponent_adjustment_unverified");
 if(!branch)return withReason("forecast_separation_below_market_threshold");
 if(historyBranch!==branch||shiftedBranch!==branch)
  return withReason("prior_history_direction_disagrees");
 // Do not retroactively invent an offered opposite side.
 if(branch!==p.lean)return withReason("independent_side_not_same_original_offer",{
  shadowUnbookableDirection:branch});
 const sportsbook=r.sportsbookBenchmark;
 if(sportsbook?.status==="conditional_identity_name_team_game_line"&&
  prob(sportsbook.higher)&&
  Math.abs(sportsbook.higher-higher)>.15)
  return withReason("independent_market_consensus_disagrees");
 // Conditional only on official game participation. Even with strict inputs,
 // pregame player participation and original bookmaker pricing are unverified.
 return {...common,status:"shadow_selected_research_only",
  selectedResearchOnly:true,direction:branch,
  reason:"all_prespecified_directional_quality_gates_passed",
  evidenceStatus:verified.status,
  noAutomaticBets:true};
}
function freeze(snapshot){
 if(!Number.isFinite(at(snapshot?.generatedAt))||
  !Array.isArray(snapshot?.individualPropSelections)||
  !Array.isArray(snapshot?.rankedProps)||
  !Array.isArray(snapshot?.eightAccuracyResearchV1?.rows)||
  snapshot.eightAccuracyResearchV1.generatedAt!==snapshot.generatedAt)
  throw Error("Same original first-Git eight-factor freeze required");
 const originals=snapshot.individualPropSelections.filter(x=>
  x.tier==="Standard"&&LIMITS[x.market]);
 const source=new Map(),seen=new Set(),frozen=[];
 for(const r of snapshot.eightAccuracyResearchV1.rows){
  const k=key(r);if(source.has(k))throw Error("Duplicate eight-factor original key");
  source.set(k,r);
 }
 if(source.size!==originals.length)throw Error("Incomplete upstream original offer population");
 for(const p of originals){
  const k=key(p);if(seen.has(k))throw Error("Duplicate original offers");
  seen.add(k);
  const match=snapshot.rankedProps.filter(x=>key(x)===k&&
   x.lean===p.lean&&x.capturedAt===p.capturedAt&&
   x.gameStartAt===p.gameStartAt);
  if(match.length!==1)throw Error("Changed original offer identity");
  const good=at(snapshot.generatedAt)>=at(p.capturedAt)&&
   at(snapshot.generatedAt)-at(p.capturedAt)<=30*60000&&
   at(p.gameStartAt)-at(snapshot.generatedAt)>=15*60000;
  frozen.push(good?assess(p,source.get(k)):
   {...assess(p,source.get(k)),status:"shadow_abstain",reason:"invalid_original_clock",
    selectedResearchOnly:false,direction:null});
 }
 return {kind:KIND,generatedAt:snapshot.generatedAt,rows:frozen,
  registered:frozen.length,
  researchSelected:frozen.filter(x=>x.selectedResearchOnly).length,
  byMarket:Object.fromEntries(Object.keys(BOUND).map(m=>[
   m,{originals:frozen.filter(x=>x.market===m).length,
    selected:frozen.filter(x=>x.market===m&&x.selectedResearchOnly).length}])),
  precommittedCutoffs:BOUND,
  historicalAndShiftedEstimatesSharePriorStats:true,
  originalExactPlatformSideAndLineUnchanged:true,
  predictionsNeverTrainedOnPostGameResults:true,
  separateMarketDirectionalEvidence:true,
  independentExpectedValueUnverified:true,
  calibrationApproved:false,modelPromoted:false,
  bettingEligible:false,placedWagers:0};
}
module.exports={KIND,BOUND,assess,freeze};
