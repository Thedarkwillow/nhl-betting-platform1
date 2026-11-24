"use strict";
/**
 * NHL shots-on-goal-only research challengers. Fixed, UNFITTED coefficients.
 * Attach to original Git-frozen pregame Standard picks; never overwrite champion.
 * Never recompute a completed game as an original forecast.
 */
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const cap=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const rounded=x=>Number(x.toFixed(6));
const timestamp=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const validCount=x=>Number.isInteger(x)&&x>=0;
const isSog=p=>p?.tier==="Standard"&&p?.market==="shotsOnGoal"&&
  Number.isFinite(p?.projection)&&p.projection>=0&&
  Number.isFinite(p?.line)&&p.line>=0;
const validPrior=(prior)=>prior.filter(x=>validCount(x?.shotsOnGoal)&&
  Number.isInteger(x?.timeOnIceSeconds)&&x.timeOnIceSeconds>=180&&
  x.timeOnIceSeconds<=3600&&["OFF","FINAL"].includes(x.gameState));
function usageData(prior){
 const games=validPrior(prior);
 if(games.length<8)return {status:"insufficient_prior_official_minutes",priorGames:games.length};
 const last5=games.slice(-5),last10=games.slice(-10),last20=games.slice(-20);
 const minutes=cap((.65*mean(last10.map(x=>x.timeOnIceSeconds))+
   .35*mean(last5.map(x=>x.timeOnIceSeconds)))/60,5,40);
 const ice=last20.reduce((s,x)=>s+x.timeOnIceSeconds,0);
 const rate=last20.reduce((s,x)=>s+x.shotsOnGoal,0)*3600/ice;
 if(!Number.isFinite(rate)||rate<0)return {status:"invalid_prior_rate"};
 return {status:"ready",games:games.length,expectedMinutes:minutes,sogPer60:rate};
}
function officialOpponent(p,context){
 const row=context?.factors?.[canonical(p.opponent)]?.shotsOnGoal;
 return row?.ready&&row.games>=3&&Number.isFinite(row.multiplier)?
  {factor:cap(row.multiplier,.9,1.1),games:row.games,used:true}:
  {factor:1,games:row?.games??0,used:false};
}
function makeVariant(meanProjection,p,details){
 const probs=estimateCountProbabilities(cap(meanProjection,0,40),p.line);
 return probs?{status:"research_only",estimate:rounded(cap(meanProjection,0,40)),
  probabilities:probs,...details,calibrated:false,notDeployed:true,
  verifiedPlatformSettlement:false,expectedValue:null}:
  {status:"invalid_sog_distribution"};
}
function sogOpportunity(p,prior,context,role=null){
 if(!isSog(p))return {status:"not_standard_shots_on_goal"};
 const usage=usageData(prior);
 if(usage.status!=="ready")return usage;
 const opponent=officialOpponent(p,context);
 const ev=role?.ev,pp=role?.pp;
 const roleFactor=role?
  cap(1+(ev==="f1"||ev==="d1"?.02:ev==="f4"?-.02:0)+
  (pp==="pp1"?.015:pp==="pp2"?.005:0),.94,1.05):1;
 const candidate=.65*p.projection+.35*
  (usage.sogPer60*usage.expectedMinutes/60)*opponent.factor*roleFactor;
 return makeVariant(candidate,p,{
  verifiedHistoricalGames:usage.games,
  historicalSogPer60:rounded(usage.sogPer60),
  historicalExpectedMinutes:rounded(usage.expectedMinutes),
  opponentGames:opponent.games,officialOpponentUsed:opponent.used,
  roleUsed:!!role,projectedRoleOnly:!!role,roleFactor:rounded(roleFactor),
  priorStatsOfficialOnly:true,
  sourceLineMovement:"unavailable_without_independent_timestamped_prior_quote"
 });
}
function moneyPuckGate(p,approved,asOf){
 const now=timestamp(asOf),start=timestamp(p?.gameStartAt),approvedAt=timestamp(approved?.generatedAt);
 const src=timestamp(approved?.moneyPuck?.skaters?.sourceCapturedAt);
 if(now===null||start===null||approvedAt===null||src===null||
    approvedAt>now||src>now||approvedAt>=start||src>=start||
    now-approvedAt>8*3600000||now-src>8*3600000)
  return {status:"money_puck_source_missing_stale_or_future"};
 const row=approved.moneyPuck.skaters?.rows?.[String(p.playerId)];
 const observed=timestamp(row?.sourceObservedAt);
 if(!row||observed===null||observed>src||observed>now||observed>=start||
    canonical(row.team)!==canonical(p.team)||row.gamesPlayed<5)
  return {status:"money_puck_player_missing_identity_or_pregame_proof"};
 const a=row.shotAttemptsPer60,s=row.shotsOnGoalPer60,x=row.xOnGoalPer60;
 if(![a,s,x].every(v=>Number.isFinite(v)&&v>=0)||
    a<.5||a>60||s>a||x>a*1.2)
  return {status:"money_puck_attempt_rates_invalid"};
 return {status:"ready",attemptsPer60:a,shotsPer60:s,xOnGoalPer60:x,
  seasonGames:row.gamesPlayed,sourceCapturedAt:approved.moneyPuck.skaters.sourceCapturedAt};
}
function sogAttempts(p,prior,context,approved,asOf,role=null){
 if(!isSog(p))return {status:"not_standard_shots_on_goal"};
 const usage=usageData(prior);
 if(usage.status!=="ready")return usage;
 const mp=moneyPuckGate(p,approved,asOf);
 if(mp.status!=="ready")return mp;
 const opponent=officialOpponent(p,context);
 // Mix realized and expected shots-on-goal/attempt conversion, no data fitting.
 const actualConversion=cap(mp.shotsPer60/mp.attemptsPer60,0,1);
 const expectedConversion=cap(mp.xOnGoalPer60/mp.attemptsPer60,0,1);
 const expectedOnGoalRate=mp.attemptsPer60*(.5*actualConversion+.5*expectedConversion);
 const pp=role?.pp;
 const roleFactor=role?cap(1+(pp==="pp1"?.02:pp==="pp2"?.005:0),.96,1.04):1;
 const proposed=.75*p.projection+.25*
  (usage.expectedMinutes/60*expectedOnGoalRate)*opponent.factor*roleFactor;
 return makeVariant(proposed,p,{
  historicalExpectedMinutes:rounded(usage.expectedMinutes),
  verifiedOfficialHistoricalGames:usage.games,
  moneyPuckPriorSeasonToDateGames:mp.seasonGames,
  moneyPuckShotAttemptsPer60:rounded(mp.attemptsPer60),
  moneyPuckObservedSogPer60:rounded(mp.shotsPer60),
  moneyPuckXOnGoalPer60:rounded(mp.xOnGoalPer60),
  conversionObserved:rounded(actualConversion),
  conversionExpected:rounded(expectedConversion),
  opponentGames:opponent.games,officialOpponentUsed:opponent.used,
  roleUsed:!!role,projectedRoleOnly:!!role,
  moneyPuckCapturedBeforeFreeze:mp.sourceCapturedAt,
  sourceLineMovement:"unavailable_without_independent_timestamped_prior_quote",
  commercialDisplayRightsUnverified:true
 });
}
/**
 * Separate line-movement A/B/C ablation (not a replacement for opportunity).
 * A changed player line is NOT evidence of more expected shots unless
 * independently validated on future frozen holdouts. This is an unfitted test.
 */
function sogMovement(p,opportunity,movement){
 if(!isSog(p))return {status:"not_standard_shots_on_goal"};
 if(opportunity?.status!=="research_only")
  return {status:"opportunity_model_unavailable_for_paired_movement"};
 if(movement?.status!=="exact_pregame_same_offer_quote")
  return {status:movement?.status||"no_verified_original_line_movement"};
 if(movement.currentLine!==p.line||!Number.isFinite(movement.earlierLine)||
  !Number.isFinite(movement.deltaLine)||
  !Number.isFinite(Date.parse(movement.currentObservedAt))||
  !Number.isFinite(Date.parse(movement.previousObservedAt))||
  Date.parse(movement.previousObservedAt)>=Date.parse(movement.currentObservedAt)||
  Date.parse(movement.currentObservedAt)>Date.parse(p.capturedAt)||
  Date.parse(p.capturedAt)>=Date.parse(p.gameStartAt))
  return {status:"inconsistent_quote_movement_chronology"};
 // 0.25 shots per one point of line movement, capped at +/-0.5 shots.
 // This directional hypothesis is deliberately NOT trained on Nov 10.
 const applied=cap(.25*movement.deltaLine,-.5,.5);
 return makeVariant(opportunity.estimate+applied,p,{
  sourceOfferMovement:{...movement},
  frozenMovementPolicy:"nhl-sog-25pct-line-delta-capped-half-shot-v1",
  originalOpportunityMean:opportunity.estimate,
  additiveLineAdjustment:rounded(applied),
  previousLine:movement.earlierLine,currentLine:p.line,
  direction:movement.direction,
  previousQuoteFromOriginalGitBeforeFreeze:true,
  sourceLineMovement:"two_exact_original_git_archived_pregame_partner_observations",
  historicalLineSignalUnfitted:true,noPlatformPayoutOrAvailabilityProof:true
 });
}
module.exports={usageData,officialOpponent,moneyPuckGate,sogOpportunity,sogAttempts,sogMovement};
