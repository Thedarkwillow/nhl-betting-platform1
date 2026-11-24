"use strict";
/**
 * Three fixed-parameter, UNCALIBRATED NHL Standard-line research challengers.
 * A: official historical ice-time/usage with optional PRE-GAME DFO role evidence
 * B: official past-only opponent suppression, optionally combined with PRE-GAME
 *    MoneyPuck rates, never current/postgame season aggregates
 * C: game-count NB variance shrinkage + conservative prior-only zero inflation
 * Champion unchanged. All forecasts for the SAME, originally offered threshold.
 */
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {challengerProbabilities}=require("./nhl-count-distribution-shadow.cjs");
const {buildOpponentContext,adjustProjection,canonical}=require("./nhl-opponent-context.cjs");
const {sogOpportunity,sogAttempts,sogMovement}=require("./nhl-sog-opportunity-challengers.cjs");
const {candidatePointsStability,POLICY:POINTS_POLICY,pacificGameDate}=require("./nhl-points-stability-shadow.cjs");
const MARKETS=new Set(["shotsOnGoal","goals","assists","points","blockedShots"]);
const ROUNDED=x=>Number(x.toFixed(6));
const cap=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=x=>x.reduce((s,v)=>s+v,0)/x.length;
const validTime=s=>typeof s==="string"&&Number.isFinite(Date.parse(s));
function priorRows(history,p,asOf){
 if(!history?.players||!Number.isInteger(p?.playerId)||!validTime(p?.gameStartAt))return [];
 const source=history.players[String(p.playerId)];
 if(!source||source.type!=="skater"||!Array.isArray(source.games))return [];
 const cutoff=pacificGameDate(p.gameStartAt),seen=new Set(),rows=[];
 // Exclude the entire GAME DATE, not just the listed event, to prevent
 // same-date NHL results leaking into retrospective as-of reconstructions.
 for(const g of source.games){
  if(!g||!Number.isInteger(g.gameId)||!/^\d{4}-\d{2}-\d{2}$/.test(g.gameDate||"")||
     g.gameDate>=cutoff||g.gameId===p.gameId||g.type!=="skater")continue;
  if(seen.has(g.gameId))return []; // conflicting same-player official rows
  seen.add(g.gameId);
  rows.push(g);
 }
 return rows.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
}
function eligibleSource(approved,p,asOf){
 const capture=Date.parse(approved?.generatedAt),now=Date.parse(asOf),start=Date.parse(p.gameStartAt);
 return Number.isFinite(capture)&&capture<=now&&capture<start&&now-capture<=8*3600000;
}
function projectedRole(approved,p,asOf){
 if(!eligibleSource(approved,p,asOf))return null;
 const record=approved?.dailyFaceoff?.lineups?.[canonical(p.team)];
 const captured=Date.parse(record?.sourceCapturedAt),updated=Date.parse(record?.sourceUpdatedAt);
 if(!Number.isFinite(captured)||!Number.isFinite(updated)||updated>captured||
    captured>Date.parse(asOf)||captured>=Date.parse(p.gameStartAt)||
    Date.parse(asOf)-captured>8*3600000)return null;
 const matches=(record?.players||[]).filter(x=>x.playerId===p.playerId&&
  canonical(x.team)===canonical(p.team));
 if(matches.length!==1||matches[0].injuryStatus||matches[0].gameTimeDecision)return null;
 const roles=matches[0].roles||[];
 const ev=roles.filter(x=>x.categoryIdentifier==="ev");
 const pp=roles.filter(x=>x.categoryIdentifier==="pp");
 if(ev.length!==1||pp.length>1)return null;
 const e=ev[0].groupIdentifier,unit=pp[0]?.groupIdentifier||null;
 if(!/^[fd][1-4]$/.test(e)||unit&&!/^pp[12]$/.test(unit))return null;
 return {ev:e,pp:unit,projectedNotConfirmed:true,sourceCapturedAt:record.sourceCapturedAt};
}
function validInput(p,asOf){
 const start=Date.parse(p?.gameStartAt),now=Date.parse(asOf),captured=Date.parse(p?.capturedAt);
 return p?.tier==="Standard"&&MARKETS.has(p.market)&&Number.isInteger(p.gameId)&&
  Number.isInteger(p.playerId)&&Number.isFinite(p.line)&&p.line>=0&&
  ["Higher","Lower"].includes(p.lean)&&Number.isFinite(p.projection)&&p.projection>=0&&
  Number.isFinite(p.probability)&&p.probability>0&&p.probability<1&&
  validTime(p.gameStartAt)&&validTime(asOf)&&validTime(p.capturedAt)&&
  captured<=now&&now<start-15*60000&&captured<start;
}
function candidateA(p,prior,approved,asOf){
 const valid=prior.filter(x=>Number.isInteger(x[p.market])&&x[p.market]>=0&&
  Number.isInteger(x.timeOnIceSeconds)&&x.timeOnIceSeconds>=180);
 if(valid.length<8)return {status:"insufficient_prior_verified_minutes",priorGames:valid.length};
 const last5=valid.slice(-5),last10=valid.slice(-10);
 const min=cap((.65*mean(last10.map(x=>x.timeOnIceSeconds))+
  .35*mean(last5.map(x=>x.timeOnIceSeconds)))/60,5,40);
 const rate=valid.slice(-20).reduce((s,x)=>s+x[p.market],0)*3600/
  valid.slice(-20).reduce((s,x)=>s+x.timeOnIceSeconds,0);
 if(!Number.isFinite(rate)||rate<0)return {status:"invalid_past_only_rate"};
 const role=projectedRole(approved,p,asOf);
 // Fixed, small unfitted opportunity adjustments. NOT deployed.
 const ev=role?.ev||null,pp=role?.pp||null;
 const roleFactor=role?cap(1+(["f1","d1"].includes(ev)?.02:ev==="f4"?-.02:0)+
  (["goals","assists","points"].includes(p.market)?pp==="pp1"?.03:pp==="pp2"?.01:0:0),.94,1.07):1;
 const rateMean=rate*min/60*roleFactor;
 const proposed=cap(.60*p.projection+.40*rateMean,0,40);
 const probabilities=estimateCountProbabilities(proposed,p.line);
 return probabilities?{status:"research_only",estimate:ROUNDED(proposed),probabilities,
  historicalGames:valid.length,expectedMinutesShadow:ROUNDED(min),
  historicalRatePer60:ROUNDED(rate),role:role||null,roleFactor,
  noConfirmedStarterOrAvailability:true}:{status:"invalid_distribution"};
}
function candidateB(p,prior,context,approved,asOf){
 const stat=context?.factors?.[canonical(p.opponent)]?.[p.market];
 if(!stat?.ready||stat.games<3)return {status:"insufficient_prior_opponent_games",
  opponentGames:stat?.games??0};
 const off=adjustProjection(p.projection,p.market,p.opponent,context);
 let factor=off.multiplier||1,mpApplied=false;
 if(eligibleSource(approved,p,asOf)){
  const team=approved.moneyPuck?.teams?.rows?.[canonical(p.opponent)];
  const all=Object.values(approved.moneyPuck?.teams?.rows||{})
   .filter(t=>t.gamesPlayed>=5);
  const k=["shotsOnGoal","blockedShots"].includes(p.market)?
   "shotsOnGoalAgainstPer60":"xGoalsAgainstPer60";
  const vals=all.map(x=>x[k]).filter(x=>Number.isFinite(x)&&x>=0);
  const ref=vals.length>=20?mean(vals):null;
  if(team?.gamesPlayed>=5&&Number.isFinite(team[k])&&ref>0){
   const ratio=cap(team[k]/ref,.85,1.15);
   factor=cap(factor*(.9+.1*ratio),.88,1.12);
   mpApplied=true;
  }
 }
 const estimate=cap(p.projection*factor,0,40);
 const probabilities=estimateCountProbabilities(estimate,p.line);
 return probabilities?{status:"research_only",estimate:ROUNDED(estimate),probabilities,
  opponentGames:stat.games,officialSuppression:stat.multiplier,
  moneyPuckPregameSourceUsed:mpApplied}:{status:"invalid_distribution"};
}
function candidateC(p,prior){
 const vals=prior.map(x=>x[p.market]).filter(x=>Number.isInteger(x)&&x>=0);
 if(vals.length<8)return {status:"insufficient_prior_count_games",priorGames:vals.length};
 const dist=challengerProbabilities(p.projection,p.line,vals);
 if(!dist)return {status:"invalid_distribution"};
 let prob=dist.challenger,extraZero=0;
 // A fixed conservative excess-zero mixture for the genuinely sparse markets.
 // Uses previous game outcomes ONLY, never the target-game result.
 if(["goals","assists"].includes(p.market)&&vals.length>=12){
  const freq=vals.filter(x=>x===0).length/vals.length;
  const baseZero=dist.challengerUsesNB?
   Math.pow(dist.dispersion.r/(dist.dispersion.r+p.projection),dist.dispersion.r):
   Math.exp(-p.projection);
  extraZero=cap((freq-baseZero)*.5*vals.length/(vals.length+30),0,.2);
  if(extraZero>0){
   const low=prob.lower,high=prob.higher;
   // CDF of mixture: extra mass at 0; for thresholds above or equal 0.
   const lower=p.line>0?extraZero+(1-extraZero)*low:(1-extraZero)*low;
   const higher=(1-extraZero)*high;
   const push=Math.max(0,1-lower-higher);
   prob={higher:ROUNDED(higher),lower:ROUNDED(lower),push:ROUNDED(push),
    distribution:"zero-inflated-"+prob.distribution,calibrated:false};
  }
 }
 return {status:"research_only",estimate:p.projection,probabilities:prob,
  priorGames:vals.length,negativeBinomial:dist.challengerUsesNB,
  varianceRatio:dist.dispersion.varianceRatio,
  extraZeroMass:ROUNDED(extraZero)};
}
function direction(model,p){
 if(model?.status!=="research_only")return {side:null,probability:null};
 const h=model.probabilities?.higher,l=model.probabilities?.lower;
 if(!Number.isFinite(h)||!Number.isFinite(l)||Math.abs(h-l)<1e-6)return {side:null,probability:null};
 return h>l?{side:"Higher",probability:h}:{side:"Lower",probability:l};
}
function evaluateOne(p,history,{asOf,approved=null,opponentContext=null,movementEvidence=null}={}){
 if(!validInput(p,asOf))return {status:"invalid_or_not_pregame_standard_offer"};
 const prior=priorRows(history,p,asOf);
 const base=estimateCountProbabilities(p.projection,p.line);
 if(!base)return {status:"invalid_champion_probability"};
 const champion={status:"research_only",estimate:p.projection,probabilities:base};
 const a=candidateA(p,prior,approved,asOf),b=candidateB(p,prior,opponentContext,approved,asOf),
  c=candidateC(p,prior);
 // SOG-specific opportunity and attempt-volume ablations are also frozen HERE,
 // alongside the same original quote. They NEVER modify the deployed champion.
 const sogRole=p.market==="shotsOnGoal"?projectedRole(approved,p,asOf):null;
 const sogOfficial=sogOpportunity(p,prior,opponentContext,sogRole);
 const sogAttempt=sogAttempts(p,prior,opponentContext,approved,asOf,sogRole);
 const sogMove=sogMovement(p,sogOfficial,movementEvidence);
 // New pregame-frozen POINTS-only challenger; historical snapshots will not
 // retroactively acquire this decision when official final outcomes arrive.
 const pointsModel=candidatePointsStability(p,prior,opponentContext,
  p.market==="points"?projectedRole(approved,p,asOf):null);
 const variants={champion,usage:a,matchup:b,distribution:c,
  sogOpportunity:sogOfficial,sogAttempts:sogAttempt,sogMovement:sogMove,
  pointsStability:pointsModel};
 const decision=Object.fromEntries(Object.entries(variants).map(([name,v])=>[name,direction(v,p)]));
 const alternatives=[a,b,c].filter(x=>x.status==="research_only");
 const aligned=alternatives.filter(x=>direction(x,p).side===p.lean).length;
 const originalSideProb=base[p.lean==="Higher"?"higher":"lower"];
 const filterReasons=[];
 if(originalSideProb<.60)filterReasons.push("champion_below_60pct_uncalibrated_threshold");
 if(alternatives.length<2)filterReasons.push("fewer_than_two_supported_challengers");
 if(aligned<2)filterReasons.push("less_than_two_shadow_directions_agree");
 // The filter is a PRIOR-DECLARED challenger policy and does not affect champion.
 const abstain=filterReasons.length>0;
 return {status:"research_only",kind:"nhl_standard_triple_challenger_v1",
  policyVersion:"standard-min60-two-shadow-agreement-unfitted-v1",
  gameId:p.gameId,playerId:p.playerId,market:p.market,line:p.line,tier:"Standard",
  eventStartsAt:p.eventStartsAt,gameStartAt:p.gameStartAt,originalCapturedAt:p.capturedAt,
  originalSelectedSide:p.lean,originalModelProbability:p.probability,
  generatedAt:asOf,originalChampionModel:p.model||"weighted-form-v1",
  sogShadowPolicyVersion:"sog-unfitted-opportunity-attempts-v1",
  sogMovementPolicyVersion:"nhl-sog-25pct-line-delta-capped-half-shot-v1",
  pointsShadowPolicyVersion:POINTS_POLICY,
  priorGames:prior.length,variants,decisions:decision,
  researchFilter:{status:abstain?"abstain":"shadow_candidate_only",reasons:filterReasons,
   comparedChallengers:alternatives.length,agreedWithOriginal:aligned},
  calibrated:false,automaticRecommendationEligible:false,
  verifiedPayoutEV:null,originalPlatformSettlementVerified:false,
  noProductionModelMutation:true,noNewWagers:true};
}
function freezeOnOriginalSelections(snapshot,history,{asOf,approved=null,movementContext=null}={}){
 if(!snapshot?.individualPropSelections||!Array.isArray(snapshot.rankedProps)||
  !history?.players||!validTime(asOf)||snapshot.generatedAt!==asOf)
  throw Error("Require identical ORIGINAL pregame snapshot and cached official history");
 const rows=[],seen=new Set(),contexts=new Map();
 for(const selection of snapshot.individualPropSelections.filter(x=>x.tier==="Standard")){
  const original=snapshot.rankedProps.filter(p=>p.gameId===selection.gameId&&
   p.playerId===selection.playerId&&p.market===selection.market&&p.tier==="Standard"&&
   p.line===selection.line&&p.lean===selection.lean&&p.capturedAt===selection.capturedAt);
  if(original.length!==1)throw Error("Shadow source must match exactly one original frozen selected offered side");
  const p=original[0],id=[p.gameId,p.playerId,p.market,p.line].join("|");
  if(seen.has(id))throw Error("Duplicate original Standard-line research identity");
  seen.add(id);
  const cutoff=pacificGameDate(p.gameStartAt),ctx=contexts.get(cutoff)||
   buildOpponentContext(history,{beforeDate:cutoff});
  contexts.set(cutoff,ctx);
  const evidence=movementContext?.matchFor?.(p)||null;
  const computed=evaluateOne(p,history,{asOf,approved,opponentContext:ctx,movementEvidence:evidence});
  if(computed.status!=="research_only")throw Error("Refuse incomplete pregame challenger identity or time");
  rows.push(computed);
 }
 return {schemaVersion:1,kind:"nhl_standard_precommitted_three_challengers_v1",
  createdAt:asOf,originalSnapshotGeneratedAt:snapshot.generatedAt,
  originalIndividualSelectionCount:snapshot.individualPropSelections.length,
  originalStandardSelectionCount:rows.length,rows,
  provisionalShadowDecisions:rows.filter(x=>x.researchFilter.status==="shadow_candidate_only").length,
  modelPromoted:false,championSelectionsUnchanged:true,calibrationVerified:false,
  originalPlatformPayoutVerified:false,estimatedROI:null,
  GitFirstAdditionBeforeGameStillRequired:true,
  explicitlyNotHistoricalReconstruction:true,
  note:"These fixed unfitted shadow predictions accompany the SAME newly generated, first-Git-frozen pregame research snapshot. No old snapshot is retroactively considered a precommitted challenger."};
}
module.exports={MARKETS,validInput,priorRows,eligibleSource,projectedRole,
 candidateA,candidateB,candidateC,direction,evaluateOne,freezeOnOriginalSelections};
