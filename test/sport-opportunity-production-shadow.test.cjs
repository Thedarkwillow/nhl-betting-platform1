"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const m=require("../src/sport-opportunity-production-shadow.cjs");
const date=i=>"2026-01-"+String(1+i).padStart(2,"0");
const start="2026-02-03T16:00:00Z",earlier="2026-02-01T09:00:00Z";
const opponent={source:"prior_complete_official_games",games:12,
 ratio:1.18,knownAt:earlier,gameDate:"2026-02-01",leagueRatePer3600:2.5};
const skater=Array.from({length:16},(_,i)=>({gameDate:date(i),
 gameState:"FINAL",type:"skater",team:"AAA",position:"D",
 timeOnIceSeconds:1000,shotsOnGoal:i%3===0?0:2,blockedShots:i%2,
 hits:1,points:i%4===0?1:0}));
const nfl=Array.from({length:16},(_,i)=>({
 gameDate:date(i),gameState:"FINAL",team:"NYA",position:"WR",
 sourceAvailableAt:date(i)+"T19:00:00Z",
 receiving_yards:40+i,targets:6+i%3,
 targetShare:.24,airYardShare:.28,airYardSourceAt:date(i)+"T20:00:00Z"
}));
test("NHL shots preserve zeros, separate rate from ice time and keep NB research-only",()=>{
 const p=m.nhlSkater(skater,{market:"shotsOnGoal",cutoff:start,line:1.5});
 a.equal(p.status,"research_shadow_only");
 a.equal(p.projectedOpportunityUnit,"seconds_of_ice_time");
 a.equal(p.zeroGamesPreserved,6);
 a.ok(p.projectedMean>0);
 a.ok(p.probabilityHigherResearchOnly>=0&&p.probabilityHigherResearchOnly<=1);
 a.equal(p.calibratedProbability,null);
 a.equal(p.bettingEligible,false);
});
test("NHL blocked shots require earlier verified opponent attack volume",()=>{
 a.equal(m.nhlSkater(skater,{market:"blockedShots",cutoff:start,line:.5})
   .reason,"no_verified_prior_opponent_attack_volume");
 const x=m.nhlSkater(skater,{market:"blockedShots",cutoff:start,line:.5,
  opponent});
 a.equal(x.status,"research_shadow_only");
 a.equal(x.opponentAdjustmentSource,"verified_prior_team_volume");
 const future={...opponent,gameDate:"2026-02-04"};
 a.equal(m.nhlSkater(skater,{market:"blockedShots",cutoff:start,
  line:.5,opponent:future}).status,"abstain");
});
test("late rows, missing playing time, or role changes cause abstention",()=>{
 a.equal(m.nhlSkater([...skater,{...skater[0],gameDate:"2026-02-04"}],
  {market:"shotsOnGoal",cutoff:start,line:1.5}).status,"abstain");
 a.equal(m.nhlSkater(skater.map((x,i)=>i===1?{...x,shotsOnGoal:null}:x),
  {market:"shotsOnGoal",cutoff:start,line:1.5}).status,"abstain");
 a.equal(m.nhlSkater(skater.map((x,i)=>i>12?{...x,position:"C"}:x),
  {market:"shotsOnGoal",cutoff:start,line:1.5}).status,"abstain");
});
test("NFL models require earlier injury check, earlier usage, explicit opponent source",()=>{
 const eligibility={verifiedPregame:true,active:true,knownAt:earlier};
 const p=m.nflPlayer(nfl,{market:"receiving_yards",cutoff:start,
  opponent,injuryStatus:eligibility});
 a.equal(p.status,"research_shadow_only");
 a.equal(p.projectedOpportunityUnit,"targets");
 a.ok(p.projectedMean>0);
 a.ok(p.verifiedPriorAirYardTargetShare>0);
 a.equal(p.airYardDataUsedToSelectDirection,false);
 a.equal(m.nflPlayer(nfl,{market:"receiving_yards",cutoff:start,opponent})
  .status,"abstain");
 a.equal(m.nflPlayer(nfl.map((r,i)=>i===3?{...r,sourceAvailableAt:start}:r),
  {market:"receiving_yards",cutoff:start,opponent,injuryStatus:eligibility})
  .status,"abstain");
});
test("kicker success rate uses only prior attempts and never knows future kick sites",()=>{
 const kicks=Array.from({length:15},(_,i)=>({gameDate:date(i),
  gameState:"FINAL",fgAttempts:2,fgMade:1,
  sourceAvailableAt:date(i)+"T19:00:00Z",
  kicks:[{distance:33,made:true},{distance:52,made:false}]}));
 const x=m.nflKicker(kicks,{cutoff:start,roleVerified:true});
 a.equal(x.status,"research_shadow_only");
 a.equal(x.futureAttemptLocationsKnown,false);
 a.equal(x.actualGameWeatherUsed,false);
 a.ok(x.projectedMean>0);
 assertNeverApproved(x);
 a.equal(m.nflKicker(kicks.map((r,i)=>i===0?{...r,fgMade:2}:r),
  {cutoff:start,roleVerified:true}).status,"abstain");
});
function assertNeverApproved(x){a.equal(x.modelPromoted,false);a.equal(x.bettingEligible,false);}
test("NBA and CS2/Valorant/LoL adapters abstain without verified pregame exposure",()=>{
 const nba=Array.from({length:15},(_,i)=>({gameDate:date(i),
   gameState:"FINAL",minutes:28,points:16}));
 a.equal(m.nbaMinutes(nba,{market:"points",cutoff:start}).status,"abstain");
 const np=m.nbaMinutes(nba,{market:"points",cutoff:start,
  availability:{verifiedPregame:true,active:true,knownAt:earlier}});
 a.equal(np.status,"research_shadow_only");assertNeverApproved(np);
 const es=Array.from({length:15},(_,i)=>({gameDate:date(i),
   gameState:"FINAL",kills:18,rounds:24}));
 a.equal(m.roundsKills(es,{cutoff:start,game:"CS2"}).status,"abstain");
 const cp=m.roundsKills(es,{cutoff:start,game:"CS2",
  roundsForecast:{source:"pregame_verified",knownAt:earlier,rounds:22}});
 a.equal(cp.status,"research_shadow_only");assertNeverApproved(cp);
 const lol=Array.from({length:15},(_,i)=>({gameDate:date(i),
  gameState:"FINAL",kills:4,teamKills:12}));
 const lp=m.lolKillShare(lol,{cutoff:start,
  teamKillForecast:{source:"pregame_verified",knownAt:earlier,kills:14}});
 a.equal(lp.status,"research_shadow_only");assertNeverApproved(lp);
});
