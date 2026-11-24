"use strict";
/**
 * Partner NFL source -> past-only nflverse weekly boxscore projection research.
 * No live selection, no implied player identity from same surname or team,
 * no odds-derived "probability". Kicker source requires verified ID crosswalk.
 */
const {classifyMarket}=require("./nfl-market-registry.cjs");
const {SPECS,marketValue,forecast,kickingObservations}=require("../scripts/backtest-nfl-historical-stats.cjs");
const {NFL_COLUMNS}=require("./partner-prizepicks-compact-archive.cjs");
const {probabilities:empiricalProbabilities}=require("./nfl-empirical-threshold-shadow.cjs");
const matchupEvidence=require("./prop-matchup-evidence-v1.cjs");
const supported=new Map(SPECS.map(x=>[x.id,x]));
const idName=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
const asDate=s=>{const pts=new Intl.DateTimeFormat("en-US",{
 timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"
}).formatToParts(new Date(s));const p=Object.fromEntries(pts.map(x=>[x.type,x.value]));
 return p.year+"-"+p.month+"-"+p.day;};
function indexWeekly(rows,season,week){
 const players=new Map();
 for(const r of rows){
  const yr=Number(r.season),wk=Number(r.week);
  if(!Number.isInteger(yr)||!Number.isInteger(wk)||yr>season||
   yr===season&&wk>=week||r.season_type&&!["REG","REGULAR_SEASON"].includes(r.season_type))
   continue;
  const name=r.player_display_name||r.player_name;
  const team=r.recent_team||r.team;
  if(!r.player_id||!name||!team)continue;
  const id=String(r.player_id);
  if(!players.has(id))players.set(id,{id,names:new Set(),teams:new Set(),weeks:new Set(),observations:[],latest:null});
  const p=players.get(id);
  p.names.add(idName(name));p.teams.add(String(team).toUpperCase());
  p.weeks.add(yr+"|"+wk);
  const measures={};
  for(const spec of SPECS.filter(s=>s.family!=="kicking")){
   const v=marketValue(spec,r);
   if(Number.isFinite(v))measures[spec.id]=v;
  }
  p.observations.push({yr,wk,measures});
  if(!p.latest||yr>p.latest.yr||yr===p.latest.yr&&wk>p.latest.wk)
   p.latest={yr,wk,team:String(team).toUpperCase(),position:String(r.position||"").toUpperCase(),name:idName(name)};
 }
 return [...players.values()].map(p=>({...p,observations:p.observations.sort((a,b)=>a.yr-b.yr||a.wk-b.wk)}));
}
function matchScheduledWeek(r,schedule){
 const date=asDate(r.eventStartsAt),a=String(r.team||"").toUpperCase(),b=String(r.matchup||"").toUpperCase();
 const matches=schedule.filter(x=>Number(x.season)===2026&&
  Number.isInteger(Number(x.week))&&Number(x.week)>=1&&Number(x.week)<=18&&
  String(x.gameday)===date&&
  [String(x.home_team).toUpperCase(),String(x.away_team).toUpperCase()].includes(a)&&
  [String(x.home_team).toUpperCase(),String(x.away_team).toUpperCase()].includes(b)&&a!==b);
 return matches.length===1?{season:2026,week:Number(matches[0].week),gameId:matches[0].game_id||null}:null;
}
function matchPriorKickerRoster(roster,source,season,week){
 const ids=new Map(),team=String(source.team||"").toUpperCase(),name=idName(source.player);
 for(const r of roster||[]){
  const yr=Number(r.season),wk=Number(r.week);
  if(!Number.isInteger(yr)||!Number.isInteger(wk)||yr>season||
   yr===season&&wk>=week||r.season_type&&!["REG","REGULAR_SEASON"].includes(r.season_type))
   continue;
  const id=r.player_id||r.gsis_id||null;
  const fullname=r.full_name||r.player_display_name||r.player_name||
   (r.first_name&&r.last_name?r.first_name+" "+r.last_name:null);
  const currentTeam=String(r.team||r.recent_team||"").toUpperCase();
  if(!id||!fullname||!name||idName(fullname)!==name)continue;
  const key=String(id),prior=ids.get(key);
  if(!prior||yr>prior.yr||yr===prior.yr&&wk>prior.wk)
   ids.set(key,{id:key,yr,wk,team:currentTeam});
 }
 return [...ids.values()].filter(p=>p.team===team);
}
// Use only unique earlier regular-season weeks and reconciled final schedules.
// These are opportunity-conditional appearances, NOT complete active rosters.
function matchupSample(weeklyRows,schedule,season,week,spec,position){
 const idx=new Map(),gameIds=new Map(),rows=new Map();
 for(const g of schedule){
  if(!g.game_id||g.game_type!=="REG"||!Number.isFinite(g.home_score)||!Number.isFinite(g.away_score))continue;
  const y=Number(g.season),w=Number(g.week);
  if(!Number.isInteger(y)||!Number.isInteger(w)||y>season||y===season&&w>=week)continue;
  gameIds.set(g.game_id,(gameIds.get(g.game_id)||0)+1);
  for(const [team,opp] of [[g.home_team,g.away_team],[g.away_team,g.home_team]]){
   if(!team||!opp||team===opp)continue;
   const key=[y,w,team].join("|");
   idx.set(key,idx.has(key)?null:{g,opp});
  }
 }
 for(const x of weeklyRows){
  if(!x.player_id||x.position!==position||x.season_type&&!["REG","REGULAR_SEASON"].includes(x.season_type))continue;
  const y=Number(x.season),w=Number(x.week),team=x.recent_team||x.team;
  const k=[y,w,x.player_id].join("|");
  // Reject duplicate weekly identities even if one row has no opportunity.
  if(rows.has(k)){rows.set(k,null);continue;}
  rows.set(k,null);
  const m=idx.get([y,w,team].join("|"));
  if(!m||gameIds.get(m.g.game_id)!==1||x.opponent_team&&x.opponent_team!==m.opp)continue;
  const opportunity=spec.family==="passing"?x.attempts:spec.family==="rushing"?x.carries:spec.family==="receiving"?x.targets:spec.id==="pass_rush_yards"&&Number.isFinite(x.attempts)&&Number.isFinite(x.carries)?x.attempts+x.carries:spec.id==="rush_receive_yards"&&Number.isFinite(x.carries)&&Number.isFinite(x.targets)?x.carries+x.targets:null;
  if(!Number.isFinite(opportunity)||opportunity<=0)continue;
  const value=marketValue(spec,x);if(!Number.isFinite(value))continue;
  rows.set(k,{playerId:String(x.player_id),team,opponent:m.opp,gameId:m.g.game_id,y,w,value,opportunity,
   airYards:spec.family==="receiving"&&Number.isFinite(x.receiving_air_yards)?x.receiving_air_yards:null,
   receptions:spec.family==="receiving"&&Number.isInteger(x.receptions)&&x.receptions>=0&&x.receptions<=opportunity?x.receptions:null,
   yac:spec.family==="receiving"&&Number.isFinite(x.receiving_yards_after_catch)?x.receiving_yards_after_catch:null});
 }
 return [...rows.values()].filter(Boolean).sort((a,b)=>a.y-b.y||a.w-b.w);
}
function describeMatchup(rows,playerId,team,opponent,line,base,season){
 const own=rows.filter(x=>x.playerId===playerId&&x.team===team),h2h=own.filter(x=>x.opponent===opponent),current=rows.filter(x=>x.y===season);
 const aggregate=a=>({appearances:a.length,games:new Set(a.map(x=>x.gameId)).size,
  average:a.length?a.reduce((s,x)=>s+x.value,0)/a.length:null,
  averageOpportunities:a.length?a.reduce((s,x)=>s+x.opportunity,0)/a.length:null,
  valuePerOpportunity:a.length?a.reduce((s,x)=>s+x.value,0)/a.reduce((s,x)=>s+x.opportunity,0):null});
 const defense=aggregate(current.filter(x=>x.opponent===opponent)),offense=aggregate(current.filter(x=>x.team===team)),league=aggregate(current);
 const form=matchupEvidence.windows(own.map(x=>x.value),line),headToHead=matchupEvidence.windows(h2h.map(x=>x.value),line);
 // Fixed descriptive shadow: shrunken positional effect, with a capped residual
 // H2H sensitivity. No live role, rank or calibrated probability asserted.
 let positionShadow=null,combinedShadow=null;
 if(defense.games>=5&&league.games>=30&&Number.isFinite(league.average)&&Math.abs(league.average)>.01){
  const factor=Math.max(.85,Math.min(1.15,1+(defense.average-league.average)/Math.abs(league.average)*defense.games/(defense.games+20)));
  positionShadow={projection:base*factor,factor,researchOnly:true,calibrated:false};
  combinedShadow=matchupEvidence.h2hShadow(positionShadow.projection,form.all,headToHead.all);
 }
 return {scope:"prior regular-season market-specific opportunity appearances; incomplete participation; no league rank",
  opponentPositionDefense:defense,ownPositionOffense:offense,leaguePosition:league,leagueRank:null,
  playerForm:form,headToHead,positionShadow,combinedShadow,calibrated:false,modelPromoted:false};
}
function projectNflPartnerBoard({board,weeklyRows,schedule,historicalSchedule=schedule,
 kickerRosterRows=null,kickerEventRows=null,now=new Date().toISOString()}={}){
 if(board?.provider!=="partner-api.prizepicks.com"||board?.sourceStatus!=="fresh"||
  board?.completePagination!==true||!Array.isArray(board.rows)||
  !Array.isArray(weeklyRows)||!Array.isArray(schedule)||
  !Number.isFinite(Date.parse(now))||Date.parse(now)-Date.parse(board.boardAsOfAt)>30*60000)
  throw Error("Require a fresh full NFL source board, season schedule and past-only history");
 const exclusions={},results=[],seen=new Set(),weeklyIndexes=new Map(),kickerIndexes=new Map(),matchupIndexes=new Map();
 const skip=s=>{exclusions[s]=(exclusions[s]||0)+1;};
 // A date + team mapping establishes a season/week label, not official game kickoff proof.
 for(const r of board.rows){
  if(Date.parse(r.eventStartsAt)<=Date.parse(now)+15*60000){skip("started_or_within_15_minutes");continue;}
  const matched=matchScheduledWeek(r,schedule);
  if(!matched){skip("unresolved_schedule_week_or_matchup");continue;}
  const market=classifyMarket("prizepicks",r.market,{period:"full_game",participants:1,
   sourceAuthenticity:"independent_partner_snapshot",observedAt:r.capturedAt});
  if(market.status!=="recognized_research_only"){skip("unrecognized_market");continue;}
  const spec=supported.get(market.marketId);
  if(!spec){skip("no_historical_boxscore_model_for_market");continue;}
  if(spec.family==="kicking"){
   if(!Array.isArray(kickerRosterRows)||!Array.isArray(kickerEventRows)){
    skip("kicker_identity_crosswalk_and_zero_attempt_games_missing");continue;
   }
   const matchedRoster=matchPriorKickerRoster(kickerRosterRows,r,matched.season,matched.week);
   if(matchedRoster.length!==1){skip("unverified_kicker_roster_identity");continue;}
   if(!kickerIndexes.has(matched.week)){
    const priorEvents=kickerEventRows.filter(e=>Number(e.season)<matched.season||
     Number(e.season)===matched.season&&Number(e.week)<matched.week);
    kickerIndexes.set(matched.week,kickingObservations(priorEvents).observations);
   }
   const prior=kickerIndexes.get(matched.week).filter(x=>
    x.identity==="kicker:"+matchedRoster[0].id&&Number.isFinite(x.measures?.[spec.id]));
   if(prior.length<5){skip("fewer_than_five_prior_kicker_attempt_games");continue;}
   const values=prior.sort((a,b)=>a.year-b.year||a.week-b.week).map(x=>x.measures[spec.id]);
   const f=forecast(values);if(!f){skip("unavailable_kicker_projection");continue;}
   const tail=values.slice(-20),conditional=empiricalProbabilities(tail,r.line,f.shrunk_last5,{nonnegative:true});
   results.push({sport:"NFL",player:r.player,playerSourceId:r.providerPlayerId,
    historicalPlayerId:matchedRoster[0].id,team:r.team,opponent:r.matchup,
    eventStartsAt:r.eventStartsAt,season:matched.season,week:matched.week,
    observedProviderGameId:r.providerGameId,market:market.marketId,rawMarket:r.market,
    sourceProjectionId:r.projectionId,line:r.line,tier:r.tier,side:r.side,
    capturedAt:r.capturedAt,observedAt:r.observedAt,projection:f.shrunk_last5,
    baseline:f.last5_mean,priorGames:prior.length,
    historicalRange:"prior week only: kicking attempt-games; ZERO-ATTEMPT GAMES MISSING",
    conditionalOnHistoricalKickerAttempt:true,unobservedZeroAttemptGames:true,
    matchupEvidenceV1:{status:"specialist_opportunity_context_pending_complete_participation_and_drive_data",calibrated:false,modelPromoted:false},
    kickerAttemptConditionalDistribution:conditional?{kind:"nfl_kicking_attempt_conditional_distribution_v1",
     probabilities:conditional,priorAttemptGames:tail.length,conditionalOnAtLeastOneRecordedFieldGoalOrPAT:true,
     unconditionalGameProbability:null,zeroAttemptGameProbability:null,createdAt:now,researchOnly:true,calibrated:false}:null,
    probability:null,verifiedProspectiveHitRate:null,calibrationStatus:"not_calibrated",
    originalPlatformSettlementVerified:false,autoPickEligible:false,
    reason:"kicker_attempt_conditional_descriptive_projection_not_game_level_eligible_or_calibrated"});
   continue;
  }
  const k=[r.projectionId,r.side].join("|");
  if(seen.has(k)){skip("duplicate_offered_side");continue;}seen.add(k);
  if(!weeklyIndexes.has(matched.week))weeklyIndexes.set(matched.week,indexWeekly(weeklyRows,matched.season,matched.week));
  const players=weeklyIndexes.get(matched.week);
  const exact=players.filter(x=>x.latest?.team===String(r.team).toUpperCase()&&
   x.names.has(idName(r.player))&&x.latest.name===idName(r.player));
  if(exact.length!==1){skip(exact.length?"ambiguous_verified_player_identity":"no_exact_player_name_and_latest_team_match");continue;}
  const player=exact[0];
  if(spec.family==="passing"&&player.latest.position!=="QB"||
   spec.family==="receiving"&&!["WR","TE","RB","FB"].includes(player.latest.position)||
   spec.family==="rushing"&&!["QB","RB","FB","WR"].includes(player.latest.position)){
   skip("position_market_mismatch");continue;
  }
  const values=player.observations.map(x=>x.measures[spec.id]).filter(Number.isFinite);
  if(values.length<5){skip("fewer_than_five_prior_recorded_games");continue;}
  const projection=forecast(values);
  if(!projection||!Number.isFinite(r.line)){skip("unavailable_projection");continue;}
  const contextKey=[matched.season,matched.week,spec.id,player.latest.position].join("|");
  if(!matchupIndexes.has(contextKey))matchupIndexes.set(contextKey,matchupSample(weeklyRows,historicalSchedule,matched.season,matched.week,spec,player.latest.position));
  const matchupContext=describeMatchup(matchupIndexes.get(contextKey),player.id,String(r.team).toUpperCase(),String(r.matchup).toUpperCase(),r.line,projection.shrunk_last5,matched.season);
  const ablation=require("./matchup-factor-ablation-v1.cjs");
  const priorOpportunity=matchupIndexes.get(contextKey).filter(x=>x.playerId===player.id&&x.team===String(r.team).toUpperCase());
  matchupContext.independentWorkload=ablation.nflOpportunity(priorOpportunity,projection.shrunk_last5);
  matchupContext.independentFactors=ablation.nflFactors(matchupContext,projection.shrunk_last5);
  matchupContext.explanation={position:player.latest.position,market:spec.id,baseProjection:projection.shrunk_last5,priorOpportunityGames:priorOpportunity.length,liveRoutesVerified:false,liveSnapRoleVerified:false,probabilityApproved:false};
  results.push({sport:"NFL",player:r.player,playerSourceId:r.providerPlayerId,
   historicalPlayerId:player.id,team:r.team,opponent:r.matchup,
   eventStartsAt:r.eventStartsAt,season:matched.season,week:matched.week,
   observedProviderGameId:r.providerGameId,market:market.marketId,rawMarket:r.market,
   sourceProjectionId:r.projectionId,line:r.line,tier:r.tier,side:r.side,
   capturedAt:r.capturedAt,observedAt:r.observedAt,projection:projection.shrunk_last5,
   baseline:projection.last5_mean,priorGames:values.length,matchupEvidenceV1:matchupContext,
   historicalRange:"all earlier regular-season weeks only; current week withheld",
   probability:null,verifiedProspectiveHitRate:null,calibrationStatus:"not_calibrated",
   originalPlatformSettlementVerified:false,autoPickEligible:false,
   reason:"research_projection_only_need_identity_roster_injury_settlement_and_offered_line_walkforward"});
 }
 return {kind:"nfl_partner_past_only_boxscore_projection_preview_v1",
  sourceBoardAsOfAt:board.boardAsOfAt,generatedAt:now,
  sourceOffers:board.rawOfferCount,inputOfferedSides:board.rows.length,
  matchedResearchSides:results.length,excluded:exclusions,rows:results,
  hasVerifiedKickoffIdentity:false,
  hasKickingCrosswalk:results.some(x=>x.conditionalOnHistoricalKickerAttempt===true),
  kickerZeroAttemptGamesIncluded:false,
  futureOutcomesUsed:false,calibratedProbabilities:false,
  lineupRecommendationEligible:false,verifiedExpectedValue:false,
  prospectiveFrozenSelections:[],note:"Strict name/team/week research matching, not an independently verified roster, original app odds, prospective bet or calibrated hit probability."};
}
module.exports={NFL_COLUMNS,idName,indexWeekly,matchScheduledWeek,matchPriorKickerRoster,matchupSample,describeMatchup,projectNflPartnerBoard};
