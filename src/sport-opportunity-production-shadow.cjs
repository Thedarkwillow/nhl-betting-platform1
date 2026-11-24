"use strict";
/**
 * Sport-specific, two-stage opportunity × per-opportunity production research.
 * These are experimental point estimates, NOT calibrated Higher/Lower odds.
 * All samples must have independently known pregame timestamps. Unavailable
 * features cause abstention; missing statistics are never interpreted as 0.
 */
const {challengerProbabilities}=require("./nhl-count-distribution-shadow.cjs");
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const nonnegative=x=>finite(x)&&x>=0;
const integer=x=>Number.isInteger(x)&&x>=0;
const cap=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const sum=a=>a.reduce((s,x)=>s+x,0);
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const wrong=reason=>({status:"abstain",reason,modelPromoted:false,
 calibratedProbability:null,bettingEligible:false});
const result=(market,opportunity,rate,projection,extras={})=>({
 status:"research_shadow_only",market,projectedOpportunity:opportunity,
 productionPerOpportunity:rate,projectedMean:projection,
 calibratedProbability:null,verifiedActualLineEdge:false,
 modelPromoted:false,bettingEligible:false,...extras});
function strictPast(rows,cutoff,dateKey="gameDate"){
 if(!Array.isArray(rows)||!rows.length||!Number.isFinite(at(cutoff)))return null;
 const date=cutoff.slice(0,10);
 if(rows.some(r=>typeof r[dateKey]!=="string"||
    !/^\d{4}-\d{2}-\d{2}$/.test(r[dateKey])||r[dateKey]>=date||
    !["FINAL","OFF"].includes(r.gameState)))return null;
 return rows.slice().sort((a,b)=>a[dateKey].localeCompare(b[dateKey]));
}
function opponentFactor(x,cutoff,{minimum=8}={}){
 if(!x||x.source!=="prior_complete_official_games"||x.games<minimum||
  !integer(x.games)||!finite(x.ratio)||x.ratio<=0||
  !Number.isFinite(at(x.knownAt))||at(x.knownAt)>=at(cutoff)||
  typeof x.gameDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(x.gameDate)||
  x.gameDate>=cutoff.slice(0,10))return null;
 return cap(1+(x.ratio-1)*x.games/(x.games+20),.85,1.15);
}
/** NHL: official player appearances incl zeros, role and minutes as exposure.
 * Blocked shots require verified earlier opponent attack-volume context.
 */
function nhlSkater(prior,{market,cutoff,line,opponent}={}){
 if(!["shotsOnGoal","blockedShots","hits","points","assists"].includes(market)||
    !finite(line)||line<0||!Number.isFinite(at(cutoff)))
  return wrong("invalid_market_line_or_cutoff");
 const rows=strictPast(prior,cutoff);
 if(!rows||rows.length<12||rows.some(r=>r.type!=="skater"||
   !integer(r[market])||!integer(r.timeOnIceSeconds)||
   r.timeOnIceSeconds===0||r.timeOnIceSeconds>3900))
  return wrong("incomplete_official_prior_appearances_or_missing_zeros");
 const h=rows.slice(-30),latest=h.slice(-5),role=h.at(-1).position,team=h.at(-1).team;
 if(!role||!team||latest.filter(x=>x.position===role&&x.team===team).length<4)
  return wrong("uncertain_recent_role_or_team");
 const opponentWeight=opponentFactor(opponent,cutoff);
 if(market==="blockedShots"&&opponentWeight===null)
  return wrong("no_verified_prior_opponent_attack_volume");
 const seconds=.65*mean(h.slice(-10).map(x=>x.timeOnIceSeconds))+
   .35*mean(latest.map(x=>x.timeOnIceSeconds));
 if(seconds<480||seconds>3900)return wrong("unstable_expected_ice_time");
 // Five 60-min appearances of shrinkage toward a league-derived prior rate
 // only when that independently sourced rate existed before the game.
 const league=opponent?.leagueRatePer3600;
 const leagueOK=nonnegative(league)&&opponent?.source==="prior_complete_official_games"&&
   Number.isFinite(at(opponent.knownAt))&&at(opponent.knownAt)<at(cutoff);
 const individualRate=sum(h.map(x=>x[market]))/sum(h.map(x=>x.timeOnIceSeconds));
 const rate=leagueOK?(sum(h.map(x=>x[market]))+league*5)/
  (sum(h.map(x=>x.timeOnIceSeconds))+5*3600):individualRate;
 const factor=opponentWeight??1,expected=cap(seconds*rate*factor,0,40);
 const distribution=challengerProbabilities(expected,line,h.map(x=>x[market]));
 if(!distribution)return wrong("distribution_unavailable");
 return result(market,seconds,rate,expected,{
  projectedOpportunityUnit:"seconds_of_ice_time",
  projectedProductionUnit:"count_per_second",
  opponentAdjustmentSource:opponentWeight===null?"not_used":"verified_prior_team_volume",
  distribution:distribution.challenger.distribution,
  probabilityHigherResearchOnly:distribution.challenger.higher,
  probabilityLowerResearchOnly:distribution.challenger.lower,
  dispersionResearchOnly:distribution.dispersion.status,
  sampleAppearances:h.length,zeroGamesPreserved:h.filter(x=>x[market]===0).length,
  noPostGameFeatures:true});
}
const NFL={
 receiving_yards:"targets",receptions:"targets",
 rushing_yards:"rushing_attempts",passing_yards:"passing_attempts",
 passing_completions:"passing_attempts",receiving_touchdowns:"targets",
 rushing_touchdowns:"rushing_attempts"
};
function nflPlayer(prior,{market,cutoff,opponent,injuryStatus}={}){
 const exposure=NFL[market];
 if(!exposure||!Number.isFinite(at(cutoff)))return wrong("unsupported_market_or_cutoff");
 // Do not treat current-week injury/availability as established by a stale
 // roster feed, and never use after-kickoff snaps or routes.
 if(injuryStatus?.verifiedPregame!==true||injuryStatus?.active!==true||
  !Number.isFinite(at(injuryStatus.knownAt))||at(injuryStatus.knownAt)>=at(cutoff))
  return wrong("player_availability_not_verified_pregame");
 const h=strictPast(prior,cutoff,"gameDate");
 if(!h||h.length<12||h.some(x=>!nonnegative(x[market])||!integer(x[exposure])||
  !Number.isFinite(at(x.sourceAvailableAt))||at(x.sourceAvailableAt)>=at(cutoff)))
  return wrong("insufficient_prior_week_opportunity_or_late_source");
 const rows=h.slice(-20),last5=rows.slice(-5),role=rows.at(-1).position,
  team=rows.at(-1).team;
 if(last5.some(r=>r.position!==role||r.team!==team))
  return wrong("changing_recent_nfl_role_or_team");
 if(sum(rows.map(x=>x[exposure]))<25)return wrong("insufficient_recorded_opportunities");
 const opportunity=.65*mean(last5.map(x=>x[exposure]))+
  .35*mean(rows.slice(-10).map(x=>x[exposure]));
 const per=sum(rows.map(x=>x[market]))/sum(rows.map(x=>x[exposure]));
 const ratio=opponentFactor(opponent,cutoff);
 // An unverified opponent adjustment is never silently set to a guessed rank.
 if(ratio===null)return wrong("opponent_context_not_frozen_prior_week");
 const expected=opportunity*per*ratio;
 const w=last5.every(x=>nonnegative(x.targetShare)&&nonnegative(x.airYardShare)&&
  x.targetShare<=1&&x.airYardShare<=1&&Number.isFinite(at(x.airYardSourceAt))&&
  at(x.airYardSourceAt)<at(cutoff))?
  last5.reduce((s,x)=>s+.45*x.targetShare+.55*x.airYardShare,0)/5:null;
 return result(market,opportunity,per,expected,{
  projectedOpportunityUnit:exposure,position:role,team,
  priorRecordedGames:rows.length,verifiedPriorAirYardTargetShare:w,
  airYardDataUsedToSelectDirection:false,
  opponentAdjustmentSource:"verified_prior_opponent_games",
  noPostKickoffParticipation:true});
}
/** NFL kicking is an opportunity/accuracy lab, NOT an approved prop model.
 * Only historical pregame-known per-kick distances are allowed.
 */
function nflKicker(prior,{cutoff,roleVerified}={}){
 const h=strictPast(prior,cutoff);
 if(!h||h.length<12||roleVerified!==true||
  h.some(x=>!integer(x.fgAttempts)||!integer(x.fgMade)||x.fgMade>x.fgAttempts||
   !Array.isArray(x.kicks)||x.kicks.length!==x.fgAttempts||
   x.kicks.some(k=>!finite(k.distance)||k.distance<=0||
    typeof k.made!=="boolean")||
   x.kicks.filter(k=>k.made).length!==x.fgMade||
   !Number.isFinite(at(x.sourceAvailableAt))||at(x.sourceAvailableAt)>=at(cutoff)))
  return wrong("kicker_history_distance_or_role_unverified");
 const rows=h.slice(-20),opportunities=.65*mean(rows.slice(-5).map(x=>x.fgAttempts))+
   .35*mean(rows.map(x=>x.fgAttempts));
 const kicks=rows.flatMap(x=>x.kicks);
 if(kicks.length<20)return wrong("insufficient_historical_kick_attempts");
 const pct=(kicks.filter(k=>k.made).length+2)/(kicks.length+4);
 // Future kick distance mix is unknown. Historical mixture is a baseline,
 // not pregame weather- or drive-specific quoted field-goal probability.
 return result("field_goals_made",opportunities,pct,opportunities*pct,{
  projectedOpportunityUnit:"field_goal_attempts",
  distanceDistribution:"historical_mix_only",futureAttemptLocationsKnown:false,
  actualGameWeatherUsed:false,pregameAttemptSelectionModeled:false,
  jointFieldGoalVarianceValidated:false});
}
/** NBA minutes × per-minute production: bench/late scratch gates explicit. */
function nbaMinutes(prior,{market,cutoff,availability}={}){
 if(!["points","rebounds","assists"].includes(market)||
   availability?.verifiedPregame!==true||availability?.active!==true||
   !Number.isFinite(at(availability.knownAt))||
   at(availability.knownAt)>=at(cutoff))
  return wrong("nba_market_or_pregame_minutes_role_unverified");
 const h=strictPast(prior,cutoff);
 if(!h||h.length<12||h.some(x=>!nonnegative(x[market])||
    !finite(x.minutes)||x.minutes<=0))
  return wrong("nba_minutes_and_rate_history_missing");
 const rows=h.slice(-20),mins=.6*mean(rows.slice(-5).map(x=>x.minutes))+
  .4*mean(rows.map(x=>x.minutes));
 const rate=sum(rows.map(x=>x[market]))/sum(rows.map(x=>x.minutes));
 return result(market,mins,rate,mins*rate,{
  projectedOpportunityUnit:"minutes",paceAdjustmentVerified:false,
  speculativeFutureLineupContextUsed:false});
}
/** CS2/Valorant: rounds × kills per round; no invented map-length forecast. */
function roundsKills(prior,{cutoff,game,roundsForecast}={}){
 if(!["CS2","Valorant"].includes(game)||!roundsForecast||
   roundsForecast.source!=="pregame_verified"||
   !Number.isFinite(at(roundsForecast.knownAt))||
   at(roundsForecast.knownAt)>=at(cutoff)||!finite(roundsForecast.rounds)||
   roundsForecast.rounds<=0)
  return wrong("map_length_forecast_unverified");
 const h=strictPast(prior,cutoff);
 if(!h||h.length<12||h.some(x=>!integer(x.kills)||!integer(x.rounds)||x.rounds<=0))
  return wrong("complete_round_exposure_missing");
 const rows=h.slice(-25),rate=sum(rows.map(x=>x.kills))/sum(rows.map(x=>x.rounds));
 return result("kills",roundsForecast.rounds,rate,roundsForecast.rounds*rate,{
  sport:game,projectedOpportunityUnit:"rounds",mapsAuthenticated:false});
}
/** League: team kills × player's verified prior share; not an in-game stat. */
function lolKillShare(prior,{cutoff,teamKillForecast}={}){
 if(!teamKillForecast||teamKillForecast.source!=="pregame_verified"||
  !Number.isFinite(at(teamKillForecast.knownAt))||
  at(teamKillForecast.knownAt)>=at(cutoff)||
  !nonnegative(teamKillForecast.kills))
  return wrong("team_kill_forecast_not_verified");
 const h=strictPast(prior,cutoff);
 if(!h||h.length<12||h.some(x=>!integer(x.kills)||!integer(x.teamKills)||
   x.kills>x.teamKills))return wrong("team_kill_share_history_missing");
 const rows=h.slice(-25),team=sum(rows.map(x=>x.teamKills));
 if(team<30)return wrong("small_team_kill_share_sample");
 const rate=(sum(rows.map(x=>x.kills))+1)/(team+5);
 return result("kills",teamKillForecast.kills,rate,teamKillForecast.kills*rate,{
  sport:"LoL",projectedOpportunityUnit:"team_kills",
  verifiedSideAvailability:false,matchFormatAdjustmentValidated:false});
}
module.exports={strictPast,opponentFactor,nhlSkater,nflPlayer,nflKicker,
 nbaMinutes,roundsKills,lolKillShare};
