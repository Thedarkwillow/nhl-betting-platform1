"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {filterNHL}=require("../src/goblin-selective-abstention-v1.cjs");
const {auditNFL}=require("../src/nfl-goblin-identity-audit-v1.cjs");
const now="2026-11-18T23:40:00Z",start="2026-11-20T01:00:00Z";
const hist=Array.from({length:20},(_,i)=>({gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
 gameState:"FINAL",type:"skater",team:"BOS",position:"C",
 timeOnIceSeconds:950,shotsOnGoal:i%3?3:0}));
const line={tier:"Goblin",playerId:8480001,gameId:2026020344,
 market:"shotsOnGoal",line:1.5,lean:"Higher"};
const row={kind:"goblin_two_stage_nhl_first_git_shadow_v1",
 status:"shadow_candidate",originalSide:"Higher",internalChallengerSide:"Higher",
 challengerHigher:.82,calibratedProbability:null,bettingEligible:false};
const opponent={source:"prior_complete_official_games",games:14,ratio:1.08,
 knownAt:"2026-11-17T14:00:00Z"};
test("forward NHL Goblin selective filter accepts only strong independently sourced *research* case",()=>{
 const x=filterNHL(line,hist,row,{now,opponent});
 a.equal(x.status,"shadow_candidate");
 a.equal(x.goblinSelectiveScreen,"provisional_research_candidate");
 a.equal(x.bettingEligible,false);
 a.equal(x.probabilityCalibrated,undefined);
 a.equal(x.experimentalThresholdNotCalibrated,true);
 a.equal(x.officialActiveStatusVerified,false);
});
test("NHL Goblin abstains on weak prior histories, volatile role or minutes, missing matchup",()=>{
 const cases=[
  [hist.slice(-10),opponent,"insufficient_verified_prior_ice_time"],
  [hist.map((x,i)=>i>=15?{...x,timeOnIceSeconds:i%2?550:1700}:x),
   opponent,"high_ice_time_or_recent_usage_uncertainty"],
  [hist.map((x,i)=>i===19?{...x,position:"LW"}:x),opponent,"recent_lineup_role_or_team_not_stable"],
  [hist,null,"opponent_defensive_volume_history_unverified"]];
 for(const [h,o,reason] of cases){
  const r=filterNHL(line,h,row,{now,opponent:o});
  a.equal(r.status,"abstain");
  a.equal(r.reason,reason);
  a.equal(r.internalChallengerSide,null);
  a.equal(r.bettingEligible,false);
 }
});
test("NHL Goblin speculative unoffered Lower and uncertain probability both abstain",()=>{
 const opts=[
  [{...row,internalChallengerSide:"Lower",challengerHigher:.18},
   "model_direction_not_on_original_offered_side"],
  [{...row,challengerHigher:.58},"insufficient_uncalibrated_directional_separation"]];
 for(const [q,reason] of opts)
  a.equal(filterNHL(line,hist,q,{now,opponent}).reason,reason);
});
test("NHL Goblin explicitly confirmed scratch is excluded; missing active status is not portrayed as verified",()=>{
 const status={rows:[{playerId:8480001,gameId:2026020344,
  status:"scratched",reportedAt:"2026-11-18T23:10:00Z"}]};
 a.equal(filterNHL(line,hist,row,{now,opponent,officialPreview:status}).reason,
  "official_pregame_scratched_or_injured");
 a.equal(filterNHL(line,hist,row,{now,opponent}).officialActiveStatusVerified,false);
});
const nflRow={tier:"goblin",period:"Full",eventType:"individual",combo:false,
 status:"pre_game",providerPlayerId:"ppplayer",providerGameId:"ppgame",
 eventStartsAt:start,line:29.5,team:"BUF"};
const cfg={sourceAt:"2026-11-18T23:34:00Z",now,
 originalArchiveFirstGitAt:"2026-11-18T23:35:00Z"};
test("NFL Goblin provider player ID cannot be guessed to be GSIS or NFL active",()=>{
 let x=auditNFL([nflRow],cfg);
 a.equal(x.originalOfferRows,1);
 a.equal(x.eligibleModelInputRows,0);
 a.equal(x.reasons.official_game_crosswalk_unverified,1);
 const mapped={...cfg,gameCrosswalk:[{providerGameId:"ppgame",
  officialGameId:"2026_11_BUF_MIA",officialKickoffAt:start,
  homeTeam:"MIA",awayTeam:"BUF",
  source:"pregame_nflverse_schedule_git_verified",
  independentScheduleOnly:true,originalPlatformIdentityAuthenticated:false,
  firstGitAt:"2026-11-18T22:00:00Z",verifiedBeforeKickoff:true}],
  playerCrosswalk:[{providerPlayerId:"ppplayer",gsisId:"00-1234567",
   team:"BUF",source:"independently_verified_provider_gsis_bridge",
   firstGitAt:"2026-11-18T22:00:00Z"}]};
 x=auditNFL([nflRow],mapped);
 a.equal(x.reasons.official_current_active_roster_missing,1);
 x=auditNFL([nflRow],{...mapped,officialStatus:{
  capturedAt:"2026-11-18T22:00:00Z",activeGameRosterVerified:true,
  rows:[{team:"BUF",gsisId:"00-1234567",gameId:"2026_11_BUF_MIA",
    status:"active",officialPregameConfirmed:true,
    modifiedAt:"2026-11-18T22:00:00Z"}]}});
 a.equal(x.eligibleModelInputRows,1);
 a.equal(x.originalAppAvailabilityVerified,false);
 a.equal(x.recommendationsReleased,0);
});
test("NFL original source time, negative published out status and name-only bridge remain blocked",()=>{
 a.equal(auditNFL([nflRow],{...cfg,originalArchiveFirstGitAt:null})
   .reasons.no_fresh_first_git_full_board,1);
 const mock={...cfg,gameCrosswalk:[{providerGameId:"ppgame",
  officialGameId:"nfl",officialKickoffAt:start,verifiedBeforeKickoff:true,
  homeTeam:"MIA",awayTeam:"BUF",
  source:"pregame_nflverse_schedule_git_verified",
  independentScheduleOnly:true,originalPlatformIdentityAuthenticated:false,
  firstGitAt:"2026-11-18T22:00:00Z"}],
  playerCrosswalk:[{providerPlayerId:"ppplayer",gsisId:"00-123",
  team:"BUF",source:"matched_by_name_only",firstGitAt:"2026-11-18T22:00:00Z"}]};
 a.equal(auditNFL([nflRow],mock).reasons.exact_provider_player_to_gsis_bridge_unverified,1);
});
