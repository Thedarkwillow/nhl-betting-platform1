"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const av=require("../src/nhl-pregame-availability-v2.cjs");
const nhl=require("../src/nhl-standard-quality-challenger-v2.cjs");
const nfl=require("../src/nfl-directional-usage-challenger-v3.cjs");
const f=require("../src/six-priority-future-scorecard.cjs");
const time="2026-11-21T05:00:00Z",git="2026-11-21T05:00:30Z",
 start="2026-11-21T18:00:00Z";
const prop={gameId:2026020399,playerId:8482345,team:"PIT",
 opponent:"OTT",market:"assists",line:.5,tier:"Standard",
 gameStartAt:start,capturedAt:"2026-11-21T04:55:00Z",
 lean:"Higher",probability:.72};
const snapshot={
 generatedAt:time,individualPropSelections:[prop],
 rankedProps:[{...prop,probabilities:{higher:.72,lower:.28}}],
 standardAdaptiveResearchV2:{rows:[{...prop,originalSide:"Higher",
  priorGames:24,opponentGames:14,trainingGames:140,trainingDates:35,
  expectedIceSeconds:1020,opponentHistoryUsed:true,priorComponentVerified:true,
  predictions:{learned:.78,fixed:.76},
  pointsSourceEvidence:{projectedPP:"pp1",linemateCount:2}}]},
 positionRateMatchupV2:{rows:[{...prop,side:"Higher",position:"F",
  defense:{last10:{games:10}},defenseFactor:1.05,offenseFactor:1.03,
  probabilities:{offenseDefense:{higher:.74}}}]}
};
test("NHL reports no medical clearance from a missing source",()=>{
 const s=av.assess(prop,{now:time});
 assert.equal(s.status,"research_only_unknown_active_roster");
 assert.equal(s.activeParticipationVerified,false);
 assert.equal(s.bettingEligible,false);
});
test("NHL pregame official injury, stale source and post-game source are rejected",()=>{
 const official={kind:"nhl_league_published_pregame_status_v1",
  capturedAt:"2026-11-21T04:50:00Z",rows:[{playerId:prop.playerId,
  gameId:prop.gameId,team:prop.team,eventStartsAt:start,
  reportedAt:"2026-11-21T04:40:00Z",status:"scratched"}]};
 let a=av.assess(prop,{now:time,official,officialGitAt:"2026-11-21T04:52:00Z"});
 assert.equal(a.confirmedNotPlaying,true);
 const shadow=nhl.assess(prop,snapshot,{now:time,official,
  officialGitAt:"2026-11-21T04:52:00Z"});
 assert.equal(shadow.status,"shadow_abstain");
 a=av.assess(prop,{now:time,official,officialGitAt:"2026-11-22T04:52:00Z"});
 assert.equal(a.status,"abstain");
 assert.equal(a.confirmedNotPlaying,false);
});
test("NHL Challenger freezes per-market opponent, PP and ice-time evidence",()=>{
 const out=nhl.freeze(snapshot);
 assert.equal(out.registered,1);
 assert.equal(out.selected,1);
 assert.equal(out.rows[0].status,"shadow_selected_research_only");
 assert.equal(out.rows[0].originalLine,.5);
 assert.equal(out.rows[0].availability.activeParticipationVerified,false);
 assert.equal(out.modelPromoted,false);
 const noRole=JSON.parse(JSON.stringify(snapshot));
 noRole.standardAdaptiveResearchV2.rows[0].pointsSourceEvidence=null;
 assert.equal(nhl.freeze(noRole).selected,0);
 const noOpponent=JSON.parse(JSON.stringify(snapshot));
 noOpponent.positionRateMatchupV2.rows=[];
 assert.equal(nhl.freeze(noOpponent).selected,0);
});
const nflp={id:"original-gsis",tier:"Standard",market:"rushing_yards",
 line:49.5,selectedSide:"Higher",offeredSide:"Higher",
 historicalProjection:70,last5Baseline:63,priorRecordedGames:28,
 historicalPlayerId:"00-0037777",sourceGameId:"NFL_game_future",
 season:2026,week:12,team:"BUF",opponent:"NYJ",
 eventStartsAt:"2026-11-22T18:00:00Z",
 sourceObservedAt:time,autoPickEligible:false,probability:null};
const nflSnap={kind:"nfl_independent_partner_standard_directional_original_research_v1",
 createdAt:time,sourceBoardAsOfAt:time,selections:[nflp]};
test("NFL rushing and combined-volume shadows abstain on doubtful margins",()=>{
 const v=nfl.freeze(nflSnap);
 assert.equal(v.selected,1);
 assert.equal(v.rows[0].shadowDirection,"Higher");
 assert.equal(v.rows[0].officialGameDayActive,false);
 const weak={...nflp,historicalProjection:52,last5Baseline:60};
 assert.equal(nfl.assess(weak,{now:time}).status,"shadow_abstain");
 const invalid={...nflp,selectedSide:"Lower"};
 assert.equal(nfl.assess(invalid,{now:time}).status,"shadow_abstain");
 const combo={...nflp,market:"rush_receive_yards",line:90.5,
  historicalProjection:121,last5Baseline:113,priorRecordedGames:25};
 assert.equal(nfl.assess(combo,{now:time}).status,"shadow_selected_research_only");
});
test("Future scorer only grades precommitted new NHL entries and never DNP as loss",()=>{
 const s={...snapshot,standardQualityShadowV2:nhl.freeze(snapshot)};
 const frame={snapshot:s,firstGitCommittedAt:git,gitHistoryCount:1};
 const result=f.scoreNhl([frame],{players:{
  [String(prop.playerId)]:{games:[{gameId:prop.gameId,playerId:prop.playerId,
  gameState:"OFF",type:"skater",timeOnIceSeconds:1000,assists:1}]}}});
 assert.equal(result.all.decided,1);
 assert.equal(result.all.correct,1);
 assert.equal(result.all.distinctGames,1);
 assert.equal(result.all.hypotheticalAlwaysLowerRate,0);
 const pending=f.scoreNhl([frame],{players:{}});
 assert.equal(pending.all.pending,1);assert.equal(pending.all.incorrect,0);
 const repeat=f.scoreNhl([frame,frame],{players:{}});
 assert.equal(repeat.all.registered,1);
 const retro=f.scoreNhl([{...frame,firstGitCommittedAt:"2026-11-19T14:00:00Z"}],{players:{}});
 assert.equal(retro.all.registered,0);
});
test("NFL grader only matches identical original Git and preserved first direction",()=>{
 const s={...nflSnap,usageDirectionShadowV3:nfl.freeze(nflSnap)};
 const fr={snapshot:s,firstGitCommittedAt:git,gitHistoryCount:1};
 const grade={explicitFrozenDirections:{rows:[{
  id:nflp.id,firstGitCommittedAt:git,line:nflp.line,market:nflp.market,
  modeledSide:nflp.selectedSide,status:"decided",actualSide:"Lower",
  officialScheduleGameId:"2026_12_BUF_NYJ"}]}};
 const r=f.scoreNfl([fr],grade);
 assert.equal(r.all.registered,1);
 assert.equal(r.all.decided,1);
 assert.equal(r.all.correct,0);
 assert.equal(r.all.hypotheticalAlwaysLowerRate,1);
 const changed=f.scoreNfl([fr],{explicitFrozenDirections:{rows:[
  {...grade.explicitFrozenDirections.rows[0],line:50.5}]}});
 assert.equal(changed.all.pending,1);assert.equal(changed.all.incorrect,0);
 assert.equal(f.evaluate().modelPromoted,false);
});
test("Game-cluster uncertainty withheld until at least ten separate games",()=>{
 const a=new Map([["A",{decided:15,model:8,lower:6,higher:9}]]);
 assert.equal(f.clusterCI(a,"lower"),null);
});
