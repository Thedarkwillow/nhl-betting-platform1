"use strict";
/**
 * Point-in-time research evidence. Does NOT certify official NHL starters,
 * positive injury clearance, verified puck-drop lines, or sportsbook EV.
 * Joins only input source observations captured BEFORE the original freeze.
 * Never use this on postgame latest.json to requalify an older frozen pick.
 */
const {canonical}=require("./nhl-opponent-context.cjs");
const KIND="nhl_point_in_time_live_context_research_v1";
const at=s=>typeof s==="string"?Date.parse(s):NaN;
const num=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
const day=s=>{if(!Number.isFinite(at(s)))return null;const p=Object.fromEntries(
 new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",
 month:"2-digit",day:"2-digit"}).formatToParts(new Date(s)).map(x=>[x.type,x.value]));
 return [p.year,p.month,p.day].join("-")};
const fail=reason=>({status:"unverified",reason});
const up=s=>String(s||"").toLowerCase().trim();
const danger=s=>/^(ir|out|injured|injured reserve|scratched|healthy scratch|suspended|inactive|doubtful|questionable|day-to-day|game[- ]time decision)$/i.test(String(s||"").trim());
const unique=(arr,fn)=>{const a=(Array.isArray(arr)?arr:[]).filter(fn);return a.length===1?a[0]:null};
function sourceTime(s,asOf,start,maxHours=6){
 const t=at(asOf),cap=at(s?.generatedAt),st=at(start);
 return Number.isFinite(t)&&Number.isFinite(cap)&&Number.isFinite(st)&&
  cap<=t&&t-cap<=maxHours*3600000&&cap<st&&t<st;
}
function rested(schedule,p,asOf){
 const bad=fail("official_prior_game_schedule_missing_or_stale");
 const t=at(asOf),start=at(p.gameStartAt),team=canonical(p.team);
 if(!schedule||schedule.source!=="Official NHL Web API"||
    schedule.complete!==true||!Array.isArray(schedule.games)||
    !Number.isFinite(at(schedule.generatedAt))||
    at(schedule.generatedAt)>t||!Number.isFinite(t)||!Number.isFinite(start))
  return bad;
 const next=unique(schedule.games,g=>g.id===p.gameId&&g.gameType===2&&
    at(g.startTimeUTC)===start&&[canonical(g.home),canonical(g.away)].includes(team));
 if(!next)return fail("current_official_schedule_game_mismatch");
 const previous=schedule.games.filter(g=>g.gameType===2&&g.finalized===true&&
    ["OFF","FINAL"].includes(g.gameState)&&[canonical(g.home),canonical(g.away)].includes(team)&&
    at(g.startTimeUTC)<t-2*3600000&&at(g.startTimeUTC)<start)
    .sort((a,b)=>at(b.startTimeUTC)-at(a.startTimeUTC));
 if(!previous.length)return bad;
 const prior=previous[0],prevDay=day(prior.startTimeUTC),nextDay=day(next.startTimeUTC);
 if(!prevDay||!nextDay)return bad;
 const delta=(Date.parse(nextDay+"T00:00:00Z")-Date.parse(prevDay+"T00:00:00Z"))/86400000;
 if(!Number.isInteger(delta)||delta<1||delta>30)return fail("unreliable_official_rest_interval");
 return {status:"official_schedule_verified",previousGameId:prior.id,previousGameAt:prior.startTimeUTC,
  restDays:delta-1,backToBack:delta===1,
  priorVenueHost:canonical(prior.home),currentVenueHost:canonical(next.home),
  hostVenueChanged:canonical(prior.home)!==canonical(next.home),
  onRoad:canonical(next.away)===team,
  consecutiveRoadGames:(()=>{let n=0;for(const g of previous){if(canonical(g.away)!==team)break;n++;}return n})(),
  distanceKm:null,flightOrTravelDistanceVerified:false,
  scheduleIsTeamLevelNotIndividualParticipation:true};
}
function roles(approved,p,asOf){
 if(!sourceTime(approved,asOf,p.gameStartAt,6))return fail("approved_line_source_stale_or_postfreeze");
 const d=approved.dailyFaceoff;
 if(!d||d.officialClubLineupProof!==false)return fail("unrecognized_dfo_source_contract");
 const g=unique(d.games,x=>x.gameId===p.gameId&&at(x.eventStartsAt)===at(p.gameStartAt)&&
  [canonical(x.home),canonical(x.away)].includes(canonical(p.team))&&
  [canonical(x.home),canonical(x.away)].includes(canonical(p.opponent))&&
  canonical(p.team)!==canonical(p.opponent));
 if(!g)return fail("no_unique_official_game_dfo_match");
 const line=d.lineups?.[canonical(p.team)];
 if(!line||line.clubLineupsConfirmed!==false||canonical(line.team)!==canonical(p.team)||
  !Number.isFinite(at(line.sourceCapturedAt))||
  !Number.isFinite(at(line.sourceUpdatedAt))||
  at(line.sourceUpdatedAt)>at(line.sourceCapturedAt)||
  at(line.sourceCapturedAt)>at(asOf)||at(line.sourceCapturedAt)>at(p.gameStartAt)||
  at(asOf)-at(line.sourceCapturedAt)>4*3600000||
  at(asOf)-at(line.sourceUpdatedAt)>24*3600000)
  return fail("dfo_projected_line_not_current_or_conflicted");
 const player=unique(line.players,x=>x.playerId===p.playerId&&canonical(x.team)===canonical(p.team));
 if(!player)return fail("no_unique_id_matched_projected_player");
 if(player.gameTimeDecision||String(player.injuryStatus||"").trim()!=="")
  return {status:"negative_report",reason:"injury_or_game_time_decision_on_projected_line",
   officialClubLineConfirmed:false};
 const assignments=new Map();
 for(const x of player.roles||[]){
  const cat=up(x.categoryIdentifier),group=up(x.groupIdentifier);
  if(!["ev","pp","pk"].includes(cat)||!/^(?:f[1-4]|d[1-3]|pp[12]|pk[12])$/.test(group))
   return fail("invalid_projected_line_role_schema");
  if(assignments.has(cat)&&assignments.get(cat)!==group)return fail("conflicting_projected_roles");
  assignments.set(cat,group);
 }
 const ev=assignments.get("ev")||null,pp=assignments.get("pp")||null;
 if(!/^(?:f[1-4]|d[1-3])$/.test(ev||""))return fail("even_strength_unit_not_verified");
 const linemates=(line.players||[]).filter(x=>x.playerId!==p.playerId&&
  canonical(x.team)===canonical(p.team)&&!x.gameTimeDecision&&!x.injuryStatus&&
  (x.roles||[]).some(z=>up(z.categoryIdentifier)==="ev"&&up(z.groupIdentifier)===ev));
 const expected=ev[0]==="f"?2:1,uniqueIds=new Set(linemates.map(x=>x.playerId));
 if(linemates.length!==expected||uniqueIds.size!==expected||!linemates.every(x=>Number.isInteger(x.playerId)))
  return fail("projected_linemates_missing_or_ambiguous");
 const teammatePP=(line.players||[]).filter(x=>x.playerId!==p.playerId&&
  canonical(x.team)===canonical(p.team)&&!x.gameTimeDecision&&!x.injuryStatus&&
  (x.roles||[]).some(z=>up(z.categoryIdentifier)==="pp"&&up(z.groupIdentifier)===pp));
 // Five skaters per projected PP unit: the chosen player + FOUR unique
 // teammates. A partial feed with 1-3 names does NOT prove PP involvement.
 // This is only a Daily Faceoff projection, never official club confirmation.
 const teammatePPIds=new Set(teammatePP.map(x=>x.playerId));
 const ppComplete=["pp1","pp2"].includes(pp)&&teammatePP.length===4&&
  teammatePPIds.size===4&&teammatePP.every(x=>Number.isInteger(x.playerId));
 return {status:"matched_projected_line",source:"Daily Faceoff",capturedAt:line.sourceCapturedAt,
  updatedAt:line.sourceUpdatedAt,evenStrengthUnit:ev,powerPlayUnit:pp,
  linemateIds:linemates.map(x=>x.playerId).sort((a,b)=>a-b),
  powerPlayTeammateCount:pp?teammatePPIds.size:0,
  projectedPowerPlayUnitComplete:ppComplete,
  projectedPowerPlayRoleVerified:ppComplete,
  officialClubLineConfirmed:false,confirmedAtPuckDrop:false,playerActiveVerified:false,
  reportOnly:true};
}
function injuries(external,p,asOf){
 const result={status:"unknown",positiveMedicalClearance:false,negativeReport:false,
  officialTeamPracticeStatusVerified:false};
 if(!sourceTime(external,asOf,p.gameStartAt,6)||external?.kind!=="nhl_external_pregame_availability_research"||
   !Array.isArray(external.injuries))return {...result,reason:"injury_feed_missing_or_stale"};
 const hits=external.injuries.filter(x=>x.playerId===p.playerId&&canonical(x.team)===canonical(p.team));
 if(hits.length>1)return {...result,status:"ambiguous",negativeReport:true,
  reason:"duplicate_or_conflicting_injury_reports"};
 if(!hits.length)return {...result,reason:"no_injury_report_is_not_clearance"};
 const r=hits[0],reported=at(r.reportedAt),source=at(r.sourceCapturedAt);
 if(!Number.isFinite(reported)||reported>source||source>at(asOf)||
  reported>=at(p.gameStartAt)||r.nhlRosterIdentityMatched!==true)
  return {...result,status:"ambiguous",negativeReport:true,reason:"injury_source_identity_or_time_invalid"};
 if(danger(r.status))return {...result,status:"negative_report",negativeReport:true,
  reason:"reported_injury_scratch_or_questionable"};
 return {...result,reason:"non_negative_report_is_not_official_clearance"};
}
function goalie(approved,p,asOf){
 if(!sourceTime(approved,asOf,p.gameStartAt,6))return fail("goalie_source_stale");
 const gs=(approved.dailyFaceoff?.games||[]).filter(g=>g.gameId===p.gameId&&
  at(g.eventStartsAt)===at(p.gameStartAt));
 if(gs.length!==1)return fail("no_unique_dfo_goalie_event");
 const opp=canonical(p.market==="saves"?p.team:p.opponent);
 const report=(gs[0].goalies||[]).filter(g=>canonical(g.team)===opp&&
   (p.market!=="saves"||g.playerId===p.playerId));
 if(report.length!==1)return fail("opposing_goalie_unmatched_or_multiple_reports");
 const r=report[0],reported=at(r.reportAt);
 if(r.status!=="reported_confirmed"||!Number.isFinite(reported)||
  reported>at(approved.generatedAt)||reported>at(asOf)||reported>=at(p.gameStartAt))
  return {status:"report_unconfirmed",reportedStatus:r.status,
   originalClubStarterConfirmed:false,starterVerified:false};
 return {status:"reporter_confirmed",playerId:r.playerId,
  ownGoalieReportOnly:p.market==="saves",
  reportAt:r.reportAt,reportedSource:r.reportSource||null,
  originalClubStarterConfirmed:false,starterVerified:false};
}
function expected(approved,p,asOf){
 const missing=fail("fresh_team_and_player_expected_goals_unavailable");
 if(!sourceTime(approved,asOf,p.gameStartAt,4))return missing;
 const m=approved.moneyPuck;
 if(m?.completeSeasonSummary!==true||m.availableForCurrentShadow!==true)return missing;
 const player=m.skaters?.rows?.[String(p.playerId)],teams=m.teams?.rows,own=teams?.[canonical(p.team)],opp=teams?.[canonical(p.opponent)];
 if(!player||canonical(player.team)!==canonical(p.team)||player.gamesPlayed<8||
  !own||!opp||own.gamesPlayed<8||opp.gamesPlayed<8)
  return fail("expected_goals_sample_or_team_identity_insufficient");
 for(const r of [player,own,opp])if(!Number.isFinite(at(r.sourceObservedAt))||
  at(r.sourceObservedAt)>at(asOf)||at(r.sourceObservedAt)>at(approved.generatedAt)||
  at(asOf)-at(r.sourceObservedAt)>4*3600000)
  return fail("expected_goals_source_not_asof");
 if(![player.xGoalsPer60,player.shotAttemptsPer60,player.highDangerShotsPer60,
  own.xGoalsForPer60,opp.xGoalsAgainstPer60,opp.shotAttemptsAgainstPer60].every(num))
  return fail("expected_goals_required_fields_missing");
 return {status:"fresh_season_to_date_research_only",
  playerXGoalsPer60:player.xGoalsPer60,playerAttemptsPer60:player.shotAttemptsPer60,
  playerHighDangerShotsPer60:player.highDangerShotsPer60,
  teamXGoalsForPer60:own.xGoalsForPer60,
  opponentXGoalsAgainstPer60:opp.xGoalsAgainstPer60,
  opponentShotAttemptsAllowedPer60:opp.shotAttemptsAgainstPer60,
  sourceCapturedAt:approved.generatedAt,sourceAsOfVerified:true,
  seasonSummaryNotPriorGameTimeline:true,oddsOrHitProbabilityNotVerified:true};
}
function assess(p,{asOf,approved,external,schedule}={}){
 const invalid=!Number.isInteger(p?.gameId)||!Number.isInteger(p?.playerId)||
  !Number.isFinite(at(asOf))||!(at(p?.capturedAt)<=at(asOf))||
  !(at(asOf)+15*60000<at(p?.gameStartAt));
 const not=reason=>({kind:KIND,status:"abstain",reasons:[reason],researchOnly:true,
  highConfidenceEligible:false,productionEligible:false});
 if(invalid)return not("original_game_id_and_frozen_time_required");
 const e=roles(approved,p,asOf),i=injuries(external,p,asOf),
  g=goalie(approved,p,asOf),r=rested(schedule,p,asOf),x=expected(approved,p,asOf);
 const reasons=[];
 if(e.status!=="matched_projected_line")reasons.push("projected_ev_pp_linemates_unverified");
 if(["points","assists","goals","powerPlayPoints"].includes(p.market)&&e.projectedPowerPlayRoleVerified!==true)
  reasons.push("power_play_unit_unverified");
 if(i.negativeReport===true)reasons.push("injury_or_uncertain_participation_report");
 if(!i.positiveMedicalClearance)reasons.push("official_active_status_unverified");
 if(!g.starterVerified)reasons.push("opposing_goalie_not_club_verified");
 if(r.status!=="official_schedule_verified")reasons.push("rest_travel_schedule_unverified");
 if(x.status!=="fresh_season_to_date_research_only")reasons.push("fresh_xg_shot_quality_unverified");
 return {kind:KIND,status:reasons.length?"research_context_partial":"historical_context_complete",
  generatedAt:asOf,playerId:p.playerId,gameId:p.gameId,
  lineAndPP:e,injury:i,opposingGoalie:g,restAndTravel:r,expectedGoals:x,
  projectedLineupSupported:e.status==="matched_projected_line",
  independentOfficialActiveStatusVerified:false,
  opponentStarterConfirmedByClub:false,verifiedAirTravelDistanceKm:null,
  scope:"future_frozen_research_only",
  reasons,highConfidenceEligible:false,productionEligible:false,
  modelWeightsLearnedFromProspectiveResults:false,bettingEligible:false};
}
module.exports={KIND,sourceTime,rested,roles,injuries,goalie,expected,assess};
