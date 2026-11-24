"use strict";
/**
 * Unfitted, NHL Standard POINTS-only pregame challenger (research shadow).
 * Uses past official player point and shot events, stable ice-time exposure,
 * verified pregame PP role when available, and a *past-only* opponent factor.
 * Abstains on missing evidence. Never changes champion directions, payout
 * estimates, frozen lines or executable selections.
 */
const {challengerProbabilities}=require("./nhl-count-distribution-shadow.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const POLICY="nhl-points-minutes-shot-opponent-zero-v1";
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const round=x=>Number(x.toFixed(6));
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
// Official NHL gameDate is local; evening startAt often rolls into NEXT UTC day.
// All past-only features must use the Pacific game-date cutoff.
function pacificGameDate(at){
 const t=Date.parse(at);if(!Number.isFinite(t))return null;
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
 return `${p.year}-${p.month}-${p.day}`;
}
function candidatePointsStability(p,prior,opponentContext,role=null){
 if(p?.market!=="points")return {status:"not_points_market",policyVersion:POLICY};
 if(!Number.isInteger(p.playerId)||!Number.isInteger(p.gameId)||
  !Number.isFinite(p.projection)||p.projection<0||
  !Number.isFinite(p.line)||p.line<0||
  !Number.isFinite(Date.parse(p.gameStartAt))||
  !Array.isArray(prior))
  return {status:"invalid_pregame_points_identity",policyVersion:POLICY};
 const cutoff=pacificGameDate(p.gameStartAt);
 const team=canonical(p.team);
 const seen=new Set(),valid=[];
 for(const g of prior){
  if(!g||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(g.gameDate||"")||
   g.gameDate>=cutoff||!Number.isInteger(g.gameId)||g.gameId===p.gameId||
   g.type!=="skater"||!["FINAL","OFF"].includes(g.gameState)||
   canonical(g.team)!==team||!Number.isInteger(g.timeOnIceSeconds)||
   g.timeOnIceSeconds<180||
   !["points","assists","goals","shotsOnGoal"].every(k=>
    Number.isInteger(g[k])&&g[k]>=0)||
   g.points!==g.goals+g.assists)continue;
  if(seen.has(g.gameId))return {status:"duplicate_prior_official_game",policyVersion:POLICY};
  seen.add(g.gameId);valid.push(g);
 }
 valid.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
 const recent=valid.slice(-20);
 if(recent.length<15)return {status:"insufficient_same_team_prior_points_and_minutes",
  priorGames:recent.length,policyVersion:POLICY};
 const opp=opponentContext?.factors?.[canonical(p.opponent)]?.points;
 if(!opp?.ready||!Number.isFinite(opp.multiplier)||opp.games<8)
  return {status:"insufficient_prior_opponent_point_context",opponentGames:opp?.games||0,
   policyVersion:POLICY};
 const last10=recent.slice(-10),last5=recent.slice(-5);
 const m10=mean(last10.map(g=>g.timeOnIceSeconds));
 const m5=mean(last5.map(g=>g.timeOnIceSeconds));
 const sd10=Math.sqrt(mean(last10.map(g=>(g.timeOnIceSeconds-m10)**2)));
 const minuteCV=sd10/m10,minuteShift=Math.abs(m5/m10-1);
 if(minuteCV>.3||minuteShift>.25)
  return {status:"unstable_recent_ice_time",priorGames:recent.length,
   minuteCV:round(minuteCV),minuteShift:round(minuteShift),policyVersion:POLICY};
 const sum=(a,k)=>a.reduce((s,g)=>s+g[k],0);
 const minutes=clamp((.65*m10+.35*m5)/60,6,32);
 const pointsPer60=sum(recent,"points")*3600/sum(recent,"timeOnIceSeconds");
 const shotRate20=sum(recent,"shotsOnGoal")*3600/sum(recent,"timeOnIceSeconds");
 const shotRate5=sum(last5,"shotsOnGoal")*3600/sum(last5,"timeOnIceSeconds");
 const shotRatio=shotRate20>0?shotRate5/shotRate20:1;
 // Shot volume is a weak opportunity proxy, not a verified on-ice xG rate.
 const shotFactor=clamp(1+.16*(shotRatio-1),.92,1.08);
 const opponentFactor=clamp(opp.multiplier,.93,1.07);
 const roleFactor=role?.pp==="pp1"?1.03:role?.pp==="pp2"?1.01:1;
 const priorExpected=pointsPer60*minutes/60;
 const estimate=clamp((.55*p.projection+.45*priorExpected)*
  shotFactor*opponentFactor*roleFactor,0,5);
 const dispersion=challengerProbabilities(estimate,p.line,recent.map(g=>g.points));
 if(!dispersion)return {status:"invalid_points_distribution",policyVersion:POLICY};
 const priorZeros=recent.filter(g=>g.points===0).length/recent.length;
 const baseZero=dispersion.challengerUsesNB?
  Math.pow(dispersion.dispersion.r/(dispersion.dispersion.r+estimate),
   dispersion.dispersion.r):Math.exp(-estimate);
 // Excess-zero mass, strongly shrunk and capped; does not let observed
 // future outcomes or unverified PP usage influence this original snapshot.
 const extraZero=clamp((priorZeros-baseZero)*.35*recent.length/
  (recent.length+20),0,.12);
 const base=dispersion.challenger;
 const prob={higher:base.higher,lower:base.lower,push:base.push};
 if(extraZero>0){
  prob.higher=round((1-extraZero)*base.higher);
  if(p.line===0){
   prob.lower=round((1-extraZero)*base.lower);
   prob.push=round(extraZero+(1-extraZero)*base.push);
  }else{
   prob.lower=round(extraZero+(1-extraZero)*base.lower);
   prob.push=round((1-extraZero)*base.push);
  }
 }
 const total=prob.higher+prob.lower+prob.push;
 if(!Number.isFinite(total)||Math.abs(total-1)>.00001)
  return {status:"invalid_points_probability_mass",policyVersion:POLICY};
 return {status:"research_only",policyVersion:POLICY,market:"points",
  estimate:round(estimate),
  probabilities:{...prob,distribution:"points-opportunity-zero-mixture-v1",
   calibrated:false},priorGames:recent.length,
  lastPriorOfficialDate:recent.at(-1).gameDate,
  verifiedPastMinutesPerGame:round(minutes),
  historicalPointsPer60:round(pointsPer60),past20ShotRatePer60:round(shotRate20),
  past5ShotRatePer60:round(shotRate5),shotOpportunityFactor:round(shotFactor),
  opponentGames:opp.games,opponentFactor:round(opponentFactor),
  pregameProjectedPowerPlayRole:role?.pp||null,
  roleSourceProjectedNotConfirmed:!!role,roleFactor,
  minuteCV:round(minuteCV),minuteShift:round(minuteShift),
  previousZeroPointFrequency:round(priorZeros),extraZeroMass:round(extraZero),
  usedPastOnlyTrueGameEvents:true,
  verifiedSportsbookOrPlatformOdds:false,calibrated:false,
  releaseApproved:false,productionModelChanged:false};
}
module.exports={POLICY,pacificGameDate,candidatePointsStability};
