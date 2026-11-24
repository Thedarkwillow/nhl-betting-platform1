"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {project,historicalFeatureSet,eligibleEvidence}=require("../src/nfl-pregame-matchup-challenger.cjs");
const {make,teamWithPace}=require("../scripts/build-nfl-matchup-shadow.cjs");
const snapAt="2026-11-10T13:00:10Z",now="2026-11-10T13:12:11Z";
const frozenAt="2026-11-10T13:02:11Z",start="2026-11-10T22:00:00Z";
const p={id:"nfl-original",sourceGameId:"gA",historicalPlayerId:"p1",
 sourceObservedAt:snapAt,season:2026,week:10,team:"AAA",opponent:"BBB",
 eventStartsAt:start,market:"passing_yards",tier:"Standard",line:220.5,
 historicalProjection:250,last5Baseline:241,selectedSide:"Higher",
 offeredSide:"Higher",priorRecordedGames:8,autoPickEligible:false,probability:null};
const teams=Array.from({length:32},(_,i)=>({
 season:2026,week:i%8+1,season_type:"REG",
 team:i<4?"AAA":i>=4&&i<8?"CCC": "L"+i,
 opponent_team:i>=4&&i<8?"BBB":"O"+(i%9),
 game_id:"2026_"+(i%8+1)+"_G"+i,
 passing_yards:i<4?265:i<8?310:230,
 attempts:i<4?34:i<8?35:33,
 priorOffenseSnaps:i<4?68:i<8?63:62}));
const players=Array.from({length:8},(_,i)=>({
 season:2026,week:i+1,player_id:"p1",recent_team:"AAA",
 attempts:30+i,passing_yards:240+i*7,season_type:"REG"}));
const snapCounts=Array.from({length:8},(_,i)=>({
 season:2026,week:i+1,game_id:"snap-"+i,
 team:"AAA",player_id:"p1",offense_snaps:50+i,
 offense_pct:.8,season_type:"REG"}));
const source={kind:"nfl_independent_partner_standard_directional_original_research_v1",
 createdAt:"2026-11-10T13:02:10Z",sourceBoardAsOfAt:snapAt,
 selections:[p]};
const h={teamWeekly:teams,playerWeekly:players,snapCounts};
test("historical opponent defense, offense, player usage and snap pace genuinely alter shadow",()=>{
 const features=historicalFeatureSet(p,h);
 assert.equal(features.status,"partial_past_week_context");
 assert.ok(features.opponentDefenseFactor>1);
 assert.ok(features.teamOffenseFactor>1);
 assert.ok(features.paceFactor>1);
 assert.ok(features.playerUsageFactor>0);
 assert.ok(features.snapShareLast5>0);
 const res=project(p,{...h,now});
 assert.equal(res.shadowStatus,"research_shadow_only");
 assert.ok(res.shadowProjection>p.historicalProjection);
 assert.equal(res.originalSelectedSide,"Higher");
 assert.equal(res.originalLine,220.5);
 assert.equal(res.calibratedProbability,null);
 assert.equal(res.autoPickEligible,false);
 const a=make(source,{...h,history:h,firstGitCommittedAt:frozenAt,now});
 assert.equal(a.candidateCounts.eligible,1);
 assert.equal(a.rows[0].shadowProjection,res.shadowProjection);
 assert.equal(a.championModelUnchanged,true);
 assert.equal(a.EV,null);
});
test("same-week and future results cannot leak into pregame opponent or player features",()=>{
 const original=project(p,{...h,now});
 const poisoned={...h,
  teamWeekly:[...teams,{season:2026,week:10,team:"AAA",opponent_team:"BBB",
   passing_yards:999999,priorOffenseSnaps:10000}],
  playerWeekly:[...players,{season:2026,week:10,player_id:"p1",
   recent_team:"AAA",attempts:99999}],
  snapCounts:[...snapCounts,{season:2026,week:10,player_id:"p1",
   team:"AAA",offense_snaps:99999,offense_pct:100}]};
 const after=project(p,{...poisoned,now});
 assert.equal(after.shadowProjection,original.shadowProjection);
 assert.deepEqual(after.factorEvidence,original.factorEvidence);
});
test("point-in-time weather forecast influences only a real same-game licensed pregame observation",()=>{
 const weather={sourceId:"weather",licenseForResearch:true,sourceGameId:"gA",
  team:"AAA",opponent:"BBB",eventStartsAt:start,issuedAt:"2026-11-10T12:50:00Z",
  observedAt:"2026-11-10T13:04:00Z",windSpeedKmh:43,
  precipitationMm:8,isForecastRun:true,stadiumVenueVerified:true,gameTimeMatched:true};
 const good=project(p,{...h,now,external:[weather]});
 const no=project(p,{...h,now});
 assert.ok(good.shadowProjection<no.shadowProjection);
 assert.equal(good.sourceAvailability.weather.forecastNotActualWeather,true);
 assert.equal(eligibleEvidence({...weather,issuedAt:"2026-11-10T15:00:00Z"},"weather",p,now),false);
 const bad=project(p,{...h,now,external:[{...weather,issuedAt:"2026-11-10T15:00:00Z"}]});
 assert.equal(bad.shadowProjection,no.shadowProjection);
 const actual=project(p,{...h,now,external:[{...weather,isForecastRun:false}]});
 assert.equal(actual.shadowProjection,no.shadowProjection);
});
test("new exact-ID injury reports trigger abstention; unlicensed sites never inject projections",()=>{
 const injury={sourceId:"nflverse_injury_snapshot",sourceGameId:"gA",team:"AAA",
  opponent:"BBB",eventStartsAt:start,licenseForResearch:true,
  issuedAt:"2026-11-10T13:00:00Z",observedAt:"2026-11-10T13:05:00Z",
  historicalPlayerId:"p1",status:"QUESTIONABLE"};
 assert.equal(project(p,{...h,now,external:[injury]}).shadowStatus,
  "abstain_missing_core_or_injury");
 const no=project(p,{...h,now});
 const paywall={sourceId:"rotowire",sourceGameId:"gA",team:"AAA",
  opponent:"BBB",eventStartsAt:start,issuedAt:"2026-11-10T13:00:00Z",
  observedAt:"2026-11-10T13:05:00Z",licenseForResearch:false,
  claimedDvpMultiplier:55};
 const q=project(p,{...h,now,external:[paywall]});
 assert.equal(q.shadowProjection,no.shadowProjection);
 assert.ok(q.sourceAvailability.unavailableSourceIds.includes("rotowire"));
});
test("advanced NGS/PFR/FTN sources listed as research, but unverified live feeds are not invented",()=>{
 const z=project(p,{...h,now,ftn:[{n_blitzers:1}],
  nextgen:Array.from({length:4},(_,i)=>({season:2026,week:i+1,
   player_gsis_id:"p1",avg_time_to_throw:2.4+i*.1})),
  pfr:Array.from({length:4},(_,i)=>({season:2026,week:i+1,
   player_id:"p1",pass_rating:100+i}))});
 assert.equal(z.advancedResearch.nextgen,"past_week_player_identity_matched");
 assert.equal(z.advancedResearch.pfr,"past_week_player_identity_matched");
 assert.equal(z.advancedResearch.ftn,"historical_charting_available_but_no_stable_player_asof_join");
 assert.equal(z.factorEvidence.ftn,null);
 assert.equal(z.sourceAvailability.weather,null);
 assert.equal(z.originalPlatformOfferVerified,false);
});
test("new first-Git claim cannot be made if original market source is stale or after kickoff",()=>{
 assert.throws(()=>make(source,{firstGitCommittedAt:frozenAt,
  history:h,now:"2026-11-10T15:00:00Z"}),/fresh original/);
 assert.throws(()=>make({...source,selections:[{...p,eventStartsAt:"2026-11-10T13:20:00Z"}]},{
  firstGitCommittedAt:frozenAt,history:h,now}),/No future/);
});

test("duplicate team-week rows cannot inflate valid matchup sample counts",()=>{
 const duplicate={...teams[0]},h2={...h,teamWeekly:[...teams,duplicate,duplicate]};
 const result=historicalFeatureSet(p,h2);
 assert.equal(result.priorTeamGames,3);
 const missing={...h,teamWeekly:teams.map(x=>x.team==="AAA"&&x.week<=2?{...x,passing_yards:null}:x)};
 assert.equal(historicalFeatureSet(p,missing).status,"insufficient_prior_history");
 const allDuplicates={...h,teamWeekly:[...teams,...teams]};
 assert.equal(historicalFeatureSet(p,allDuplicates).status,"insufficient_prior_history");
});

test("official league exact player status blocks new shadow, not original line",()=>{const {applyOfficialRisk}=require("../scripts/build-nfl-matchup-shadow.cjs");const base=project(p,{...h,now});const report={kind:"nfl_first_party_published_game_status_v1",capturedAt:"2026-11-10T13:04:00Z",rows:[{gsisId:p.historicalPlayerId,team:p.team,season:p.season,week:p.week,modifiedAt:"2026-11-10T13:00:00Z",status:"out"}]};const q=applyOfficialRisk(base,p,report,now);assert.equal(q.shadowStatus,"abstain_missing_core_or_injury");assert.equal(q.shadowProjection,null);assert.equal(q.originalLine,base.originalLine);assert.equal(q.originalSelectedSide,base.originalSelectedSide);assert.equal(applyOfficialRisk(base,p,null,now).shadowProjection,base.shadowProjection);});
