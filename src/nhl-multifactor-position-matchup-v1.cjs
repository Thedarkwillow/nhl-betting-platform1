"use strict";
/**
 * Private NHL matchup evidence matrix, descriptive and past-only.
 *
 * Links EXACT ORIGINAL frozen player/market/threshold/side to the separately
 * frozen position-rate and usage challenger rows. A current matchup label is
 * never manufactured from postgame statistics, an approximate player name,
 * guessed position, or another line/offer. This is not a fitted forecast.
 *
 * Position vs opponent = conceded events per opposing C/LW/RW/D appearance
 * and per 60 minutes of ACTUAL prior-game exposure, from complete official
 * NHL final game skater box scores. It is not an opponent's "defense ranking"
 * unless every team has a complete comparable league denominator.
 */
const {pacificDay}=require("./nhl-opponent-opportunity-gate-v1.cjs");
const KIND="nhl_frozen_multifactor_position_matchup_v1";
const MARKETS=new Set(["shotsOnGoal","blockedShots","goals","assists","points",
 "powerPlayPoints","hits","faceoffsWon"]);
const POSITIONS=new Set(["C","LW","RW","D"]);
const pnum=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
const time=s=>typeof s==="string"?Date.parse(s):NaN;
const utcDate=x=>typeof x==="string"&&/^\d{4}-\d\d-\d\d$/.test(x);
const round=n=>Number.isFinite(n)?Number(n.toFixed(3)):null;
const unique=(a,p)=>a.filter(p).length===1?a.filter(p)[0]:null;
function exact(a,p){
 return a?.gameId===p.gameId&&a.playerId===p.playerId&&
  a.market===p.market&&a.line===p.line&&a.tier===p.tier&&
  a.gameStartAt===p.gameStartAt&&a.capturedAt===p.capturedAt;
}
function asWindow(w){
 const per60=w?.allowedPer60??w?.per60;
 if(!w||!Number.isInteger(w.games)||w.games<0||
  !pnum(per60)||!pnum(w.allowedPerAppearance)||
  (w.allowedPer60!=null&&w.per60!=null&&w.allowedPer60!==w.per60))return null;
 return {games:w.games,allowedPerAppearance:round(w.allowedPerAppearance),
  allowedPer60:round(per60)};
}
function positionEvidence(s,p){
 const posSource=s?.positionRateMatchupV2;
 if(posSource?.kind!=="nhl_position_rate_matchup_v2"||
    posSource.generatedAt!==s.generatedAt||!Array.isArray(posSource.rows))
  return {status:"position_challenger_not_frozen_with_original_source",row:null};
 const row=unique(posSource.rows,x=>exact(x,p)&&x.side===p.lean);
 if(!row)return {status:"missing_or_ambiguous_exact_position_match",row:null};
 if(!POSITIONS.has(row.position)||!utcDate(row.latestPriorDate)||
    row.latestPriorDate>=pacificDay(p.capturedAt))
  return {status:"missing_official_position_or_future_history",row:null};
 const d={season:asWindow(row.defense?.season),
  last10:asWindow(row.defense?.last10),last5:asWindow(row.defense?.last5)},
 o={season:asWindow(row.offense?.season),
  last10:asWindow(row.offense?.last10),last5:asWindow(row.offense?.last5)};
 const factors=pnum(row.defenseFactor)&&row.defenseFactor>=.8&&row.defenseFactor<=1.2&&
  pnum(row.offenseFactor)&&row.offenseFactor>=.8&&row.offenseFactor<=1.2;
 const coverage=!!(d.season&&d.season.games>=10&&
  d.last10&&d.last10.games>=8&&d.last5&&d.last5.games>=3&&
  o.season&&o.season.games>=10&&o.last10&&o.last10.games>=8&&
  o.last5&&o.last5.games>=3&&factors);
 return {status:coverage?"sufficient_historical_position_context":"insufficient_position_sample",
  row,coverage,defense:d,offense:o,
  defenseFactor:factors?round(row.defenseFactor):null,
  offenseFactor:factors?round(row.offenseFactor):null,
  position:row.position,lastPriorDate:row.latestPriorDate,
  rolesAreFromPriorGamesNotCurrentLineup:true,leagueRank:null,
  leagueRankUnverified:true};
}
function usageEvidence(s,p){
 const src=s?.standardAdaptiveResearchV2;
 if(src?.kind!=="nhl_standard_adaptive_research_v2"||
   src.generatedAt!==s.generatedAt||!Array.isArray(src.rows))
  return {status:"prior_player_usage_shadow_missing"};
 const r=unique(src.rows,x=>exact(x,p)&&x.originalSide===p.lean);
 if(!r)return {status:"missing_or_ambiguous_exact_prior_player_usage"};
 const sufficient=Number.isInteger(r.priorGames)&&r.priorGames>=16&&
  pnum(r.expectedIceSeconds)&&r.expectedIceSeconds>=690&&
  r.expectedIceSeconds<=3900&&
  Number.isFinite(r.restDaysFromLastAppearance)&&
  r.restDaysFromLastAppearance>=0&&r.restDaysFromLastAppearance<=14&&
  r.opponentHistoryUsed===true;
 return {status:sufficient?"historical_player_usage_present":"prior_player_usage_insufficient",
  sufficient,priorGames:Number.isInteger(r.priorGames)?r.priorGames:null,
  expectedIceSeconds:pnum(r.expectedIceSeconds)?round(r.expectedIceSeconds):null,
  lastPriorDate:null, // the adaptive row carries rest days, not an independently verified date
  restDays:Number.isInteger(r.restDaysFromLastAppearance)?r.restDaysFromLastAppearance:null,
  opponentGames:Number.isInteger(r.opponentGames)?r.opponentGames:null,
  projectedPowerPlay:r.pointsSourceEvidence?.projectedPP??null,
  knownLinemates:Number.isInteger(r.pointsSourceEvidence?.linemateCount)?
   r.pointsSourceEvidence.linemateCount:null,
  powerPlayAndTeammatesSourceVerified:r.priorComponentVerified===true&&
   ["pp1","pp2"].includes(r.pointsSourceEvidence?.projectedPP)&&
   Number.isInteger(r.pointsSourceEvidence?.linemateCount)&&
   r.pointsSourceEvidence.linemateCount>=1};
}
/**
 * SECOND estimate of pregame expected TOI from the same already-frozen
 * historical-game dataset. This is NOT an independent live source, active
 * clearance, nor calibration. Reject joins to another offered line/side.
 * Its role-shift flag is a future-research diagnostic, NOT a new v1 veto;
 * absent secondary evidence never qualifies or rewrites an older prediction.
 */
function iceTimeCrosscheck(s,p,adaptive){
 const missing=reason=>({status:"unverified",reason,
  sourceVerified:false,roleShiftRisk:false,independentSource:false,
  officialPuckDropRoleVerified:false});
 const src=s?.standardExpectedIceTimeShadowV1;
 if(src?.kind!=="nhl_pregame_expected_ice_time_history_shadow_20261120_v1"||
   src.generatedAt!==s?.generatedAt||!Array.isArray(src.rows))
  return missing("expected_ice_time_historical_shadow_not_frozen");
 const row=unique(src.rows,x=>exact(x,p)&&x.originalSide===p.lean);
 if(!row)return missing("expected_ice_time_original_side_or_line_not_unique");
 const e=row.evidence,cut=pacificDay(p.capturedAt);
 const age=e?.latestPriorDate&&cut?
  (Date.parse(cut+"T00:00:00Z")-Date.parse(e.latestPriorDate+"T00:00:00Z"))/86400000:NaN;
 if(e?.kind!==src.kind||e.cutoff!==cut||src.cutoff!==cut||
   e.pregameOnly!==true||e.uniqueOriginalGameRows!==true||
   !utcDate(e.latestPriorDate)||!(e.latestPriorDate<cut)||!Number.isInteger(e.priorGames)||
   e.priorGames<16||!Number.isFinite(age)||age<1||age>14||
   !pnum(e.originalExpectedIceSeconds)||e.originalExpectedIceSeconds<690||
   e.originalExpectedIceSeconds>3900||!pnum(e.alternateExpectedIceSeconds)||
   e.alternateExpectedIceSeconds<0||e.alternateExpectedIceSeconds>3900||
   !pnum(adaptive?.expectedIceSeconds)||adaptive.expectedIceSeconds<690||
   adaptive.expectedIceSeconds>3900||typeof e.recentRoleInstability!=="boolean")
  return missing("expected_ice_time_prior_games_clock_or_sample_insufficient");
 const diff=Math.abs(e.originalExpectedIceSeconds-adaptive.expectedIceSeconds);
 const fraction=diff/Math.max(e.originalExpectedIceSeconds,adaptive.expectedIceSeconds);
 // Two precommitted prior-game TOI formulas materially disagree, or the
 // last several played shifts show abnormal volatility. Do not call this an
 // injury or scratch: it only signals uncertain projected usage.
 const risk=e.recentRoleInstability||diff>=300&&fraction>=.25;
 return {status:"same_history_expected_ice_time_crosscheck",
  sourceVerified:true,independentSource:false,
  originalExpectedIceSeconds:Number(e.originalExpectedIceSeconds.toFixed(1)),
  adaptiveExpectedIceSeconds:Number(adaptive.expectedIceSeconds.toFixed(1)),
  absoluteDifferenceSeconds:Number(diff.toFixed(1)),
  relativeDifference:Number(fraction.toFixed(3)),
  latestPriorDate:e.latestPriorDate,priorGames:e.priorGames,
  recentRoleInstability:e.recentRoleInstability,roleShiftRisk:risk,
  officialPuckDropRoleVerified:false,forecastNotCalibrated:true};
}

function assess(snapshot,p,{opponentOpportunity=null}={}){
 const reasons=[];
 const fail=(r)=>{reasons.push(r)};
 if(!snapshot||!Number.isFinite(time(snapshot.generatedAt))||
    !Number.isFinite(time(p?.capturedAt))||
    !Number.isFinite(time(p?.gameStartAt))||
    time(p.capturedAt)>time(snapshot.generatedAt)||
    time(p.gameStartAt)<=time(snapshot.generatedAt)+15*60000||
    !MARKETS.has(p.market)||!["Higher","Lower"].includes(p.lean)||
    !Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
    !pnum(p.line)||!pnum(p.probability)){
  return {kind:KIND,status:"abstain",reasons:["invalid_original_frozen_pregame_prop"],
   position:null,positionOpponent:null,teamOwnPosition:null,playerUsage:null,
   evidenceQualified:false,highConfidenceEligible:false,automaticRecommendationEligible:false,
   calibrated:false};
 }
 const official=unique(snapshot.individualPropSelections||[],x=>exact(x,p)&&x.lean===p.lean);
 const original=unique(snapshot.rankedProps||[],x=>exact(x,p)&&x.lean===p.lean);
 if(!official||!original)fail("original_selected_offer_not_unique");
 const pos=positionEvidence(snapshot,p),usage=usageEvidence(snapshot,p),
  ice=iceTimeCrosscheck(snapshot,p,usage);
 const recent=original?{
  last5:pnum(original.last5)?round(original.last5):null,
  last10:pnum(original.last10)?round(original.last10):null,
  baseProjection:pnum(original.baseProjection)?round(original.baseProjection):null,
  priorObservations:Number.isInteger(original.observations)?original.observations:null}:null;
 if(!pos.coverage)fail(pos.status);
 if(!usage.sufficient)fail(usage.status);
 // Precommitted v1 kept/skipped policy is UNCHANGED; report the TOI risk
 // for a future separately registered experiment, never retrofit eligibility.
 // Opponent position rates alone do not validate Corsi-style attempt exposure.
 const opportunity=opponentOpportunity?.kind==="nhl_opponent_opportunity_verified_v1"?
  opponentOpportunity:null;
 if(opportunity?.evidenceQualified!==true)
  fail("market_specific_opponent_opportunity_unverified");
 // Points and assists require separate source-backed expected power-play and
 // teammate involvement; a position-allowed points table alone cannot prove it.
 if(["points","assists","powerPlayPoints","goals"].includes(p.market)&&
  usage.powerPlayAndTeammatesSourceVerified!==true)
  fail("special_teams_or_teammate_role_unverified");
 // Live role, injury, goalie and platform price cannot be inferred from
 // finished-game positions or history. These remain independent blockers.
 const areas={
  playerFormAndIceTime:usage.sufficient===true,
  historicalIceTimeCrosscheckVerified:ice.sourceVerified===true,
  historicalIceTimeRoleShiftRisk:ice.sourceVerified&&ice.roleShiftRisk,
  opponentVersusExactPosition:pos.coverage===true,
  ownTeamPositionOffense:pos.coverage===true,
  opponentMarketOpportunity:opportunity?.evidenceQualified===true,
  historicalPowerPlayAndLinemates:usage.powerPlayAndTeammatesSourceVerified===true,
  liveLineAndLinematesVerified:false,
  liveInjuryAndScratchVerified:false,
  confirmedStartingGoalie:false,
  verifiedRestTravelBackToBack:false,
  authenticatedPlatformOffer:false,
  calibratedProbabilityAndPayoutEV:false
 };
 const researchEvidenceQualified=reasons.length===0;
 return {kind:KIND,status:researchEvidenceQualified?
    "historical_multifactor_research_supported":"research_abstain_missing_matchup_evidence",
  market:p.market,position:pos.position??null,
  positionOpponent:{season:pos.defense?.season??null,last10:pos.defense?.last10??null,
   last5:pos.defense?.last5??null,defenseFactor:pos.defenseFactor??null,
   leagueRank:null,leagueRankVerified:false},
  teamOwnPosition:{season:pos.offense?.season??null,last10:pos.offense?.last10??null,
   last5:pos.offense?.last5??null,offenseFactor:pos.offenseFactor??null},
  playerUsage:usage.status==="prior_player_usage_shadow_missing"?null:usage,
  iceTimeCrosscheck:ice,
  recentPlayerForm:recent,
  sourceProvenance:"exact_original_frozen_pregame_position_rate_and_usage_rows",
  coverage:areas,
  researchEvidenceQualified,reasons:[...new Set(reasons)],
  forecastConditionalOnAppearance:true,matchupEffectsHistoricallyCalibrated:false,
  opponentRolePositionIsHistoricalNotConfirmedGameLine:true,
  highConfidenceEligible:false,automaticRecommendationEligible:false,
  originalPlatformOfferVerified:false,calibrated:false,verifiedEV:null};
}
module.exports={KIND,exact,asWindow,positionEvidence,usageEvidence,iceTimeCrosscheck,assess};
