"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessNhlResearchProbability,auditNhlResearchProbabilities}=require("../src/nhl-probability-safety.cjs");
const {optimize}=require("../src/nhl-lineup-optimizer.cjs");
const {projectNflPartnerBoard,indexWeekly,matchScheduledWeek}=require("../src/nfl-partner-board-research.cjs");
const at="2026-11-08T17:10:00Z",start="2026-11-08T21:00:00Z";
test("Unconfirmed starting goalies and extreme raw probabilities abstain, not magically calibrate",()=>{
 const x=assessNhlResearchProbability({market:"saves",probability:.99997,observations:9,roleEvidence:{starterStatus:"unconfirmed"}});
 assert.equal(x.researchLineupEligible,false);
 assert.equal(x.rawModelProbability,.99997);
 assert.equal(x.verifiedHistoricalHitRate,null);
 assert.ok(x.reasons.includes("pregame_goalie_start_not_verified"));
 assert.ok(x.reasons.includes("extreme_uncalibrated_model_estimate"));
 const y=assessNhlResearchProbability({market:"shotsOnGoal",probability:.65,observations:21,roleEvidence:{starterStatus:"unconfirmed",eligibleForResearchLineup:true}});
 assert.equal(y.researchLineupEligible,true);
 assert.equal(y.automaticRecommendationEligible,false);
 assert.equal(auditNhlResearchProbabilities([{probabilitySafety:x},{probabilitySafety:y}]).onHold,1);
});
test("Strict NHL research optimization rejects fallback same-game stacking and safety-held props",()=>{
 const base={tier:"Standard",market:"shotsOnGoal",lean:"Higher",observations:22,probability:.71};
 const props=Array.from({length:8},(_,i)=>({...base,playerId:i+1,matchup:"game "+Math.floor(i/2)}));
 props[0].probabilitySafety={researchLineupEligible:false};
 const r=optimize(props,{allowSameGameFallback:false});
 assert.equal(r[5],null);
 assert.equal(r[6],null);
 assert.equal(r[2].sameGameStructuralPairsVerifiedAbsent,true);
 assert.equal(r[2].strictIndependentGamesOnly,true);
 assert.ok(!r[2].picks.some(p=>p.playerId===1));
 assert.throws(()=>optimize(props,{allowSameGameFallback:"no"}),/correlation-risk/);
});
const board={provider:"partner-api.prizepicks.com",sourceStatus:"fresh",completePagination:true,
 boardAsOfAt:"2026-11-08T17:03:52Z",rawOfferCount:2,rows:[
 {projectionId:"1",providerPlayerId:"p1",player:"Example Quarterback",team:"BUF",matchup:"MIA",
 eventStartsAt:start,market:"Pass Yards",line:220.5,tier:"Standard",side:"Higher",
 capturedAt:"2026-11-08T17:03:52Z",observedAt:"2026-11-08T16:40:00Z",providerGameId:"game-1"},
 {projectionId:"2",providerPlayerId:"k1",player:"Example Kicker",team:"BUF",matchup:"MIA",
 eventStartsAt:start,market:"Kicking Points",line:6.5,tier:"Standard",side:"Lower",
 capturedAt:"2026-11-08T17:03:52Z",observedAt:"2026-11-08T16:40:00Z",providerGameId:"game-1"}
]};
const schedule=[{season:2026,week:9,gameday:"2026-11-08",home_team:"BUF",away_team:"MIA",game_id:"2026_09_MIA_BUF"}];
const weekly=Array.from({length:8},(_,i)=>({
 season:2026,week:i+1,season_type:"REG",player_id:"player-nflverse-1",
 player_display_name:"Example Quarterback",recent_team:"BUF",position:"QB",
 passing_yards:220+i*4,attempts:28+i,completions:19+i,passing_tds:2,rushing_yards:25
}));
test("NFL prior-week baseline matches original source name/team and excludes kickers without crosswalk",()=>{
 const x=projectNflPartnerBoard({board,weeklyRows:weekly,schedule,now:at});
 assert.equal(x.sourceOffers,2);
 assert.equal(x.matchedResearchSides,1);
 assert.equal(x.rows[0].market,"passing_yards");
 assert.equal(x.rows[0].priorGames,8);
 assert.equal(x.rows[0].probability,null);
 assert.equal(x.rows[0].autoPickEligible,false);
 assert.equal(x.hasKickingCrosswalk,false);
 assert.equal(x.excluded.kicker_identity_crosswalk_and_zero_attempt_games_missing,1);
});
test("NFL matched week excludes future/current-week leakage and ambiguous player matches",()=>{
 const after=[...weekly,{...weekly[0],week:9,passing_yards:10000},
  {...weekly[0],week:10,passing_yards:10000}];
 const profiles=indexWeekly(after,2026,9);
 assert.equal(profiles[0].observations.length,8);
 const base=projectNflPartnerBoard({board,weeklyRows:after,schedule,now:at});
 assert.equal(base.rows[0].projection,projectNflPartnerBoard({board,weeklyRows:weekly,schedule,now:at}).rows[0].projection);
 const ambiguous=weekly.map(x=>({...x,player_id:"other-nfl-id"}));
 const x=projectNflPartnerBoard({board,weeklyRows:[...weekly,...ambiguous],schedule,now:at});
 assert.equal(x.matchedResearchSides,0);
 assert.equal(x.excluded.ambiguous_verified_player_identity,1);
 assert.equal(matchScheduledWeek(board.rows[0],[{...schedule,gameday:"2026-11-09"}]),null);
 assert.throws(()=>projectNflPartnerBoard({board:{...board,sourceStatus:"stale"},weeklyRows:weekly,schedule,now:at}),/fresh full NFL/);
});

test("Kicker source uses exact prior-week roster + event IDs, and keeps missing zero-attempt games explicit",()=>{
 const roster=Array.from({length:8},(_,i)=>({season:2026,week:i+1,
  season_type:"REG",player_id:"kicker-history-1",full_name:"Example Kicker",team:"BUF"}));
 const events=Array.from({length:8},(_,i)=>({
  season:2026,week:i+1,season_type:"REG",game_id:"2026_"+(i+1)+"_BUF_MIA",
  play_id:"kick-"+(i+1),kicker_player_id:"kicker-history-1",
  field_goal_attempt:1,extra_point_attempt:0,field_goal_result:"made",
  extra_point_result:null
 }));
 const x=projectNflPartnerBoard({board,weeklyRows:weekly,schedule,
  kickerRosterRows:roster,kickerEventRows:events,now:at});
 assert.equal(x.matchedResearchSides,2);
 assert.equal(x.hasKickingCrosswalk,true);
 const kicker=x.rows.find(r=>r.market==="kicking_points");
 assert.ok(kicker);
 assert.equal(kicker.priorGames,8);
 const d=kicker.kickerAttemptConditionalDistribution;
 assert.equal(d.priorAttemptGames,8);
 assert.deepEqual(d.probabilities,{higher:0,lower:1,push:0});
 assert.equal(d.unconditionalGameProbability,null);
 assert.equal(d.zeroAttemptGameProbability,null);
 assert.equal(d.calibrated,false);
 const short=projectNflPartnerBoard({board,weeklyRows:weekly,schedule,kickerRosterRows:roster,kickerEventRows:events.slice(0,7),now:at});
 assert.equal(short.rows.find(r=>r.market==='kicking_points').kickerAttemptConditionalDistribution,null);
 assert.equal(kicker.probability,null);
 assert.equal(kicker.autoPickEligible,false);
 assert.equal(kicker.unobservedZeroAttemptGames,true);
 assert.equal(x.kickerZeroAttemptGamesIncluded,false);
 const broken=projectNflPartnerBoard({board,weeklyRows:weekly,schedule,
  kickerRosterRows:roster.map(r=>({...r,full_name:"Different Kicker"})),
  kickerEventRows:events,now:at});
 assert.equal(broken.hasKickingCrosswalk,false);
 assert.equal(broken.excluded.unverified_kicker_roster_identity,1);
});
