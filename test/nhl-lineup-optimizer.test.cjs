"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {optimize}=require("../src/nhl-lineup-optimizer.cjs");
test("builds all distinct-game sizes 2-6 if six distinct games are eligible",()=>{
 const props=Array.from({length:7},(_,i)=>({playerId:i+1,player:"Player "+i,team:"X",matchup:"game "+i,tier:"Standard",lean:"Higher",probability:.7-i*.01,observations:20}));
 const lineups=optimize(props);
 for(let n=2;n<=6;n++){
  assert.equal(lineups[n].picks.length,n);
  assert.equal(lineups[n].probability,null);
  assert.equal(lineups[n].expectedValue,null);
  assert.equal(lineups[n].correlationRisk,"same_game_excluded");
  assert.equal(lineups[n].payoutQuoteVerified,false);
 }
});
test("same-player prevented; goblin excluded; insufficient distinct games rejects small sizes",()=>{
 const props=[{playerId:1,matchup:"A",tier:"Standard",lean:"Higher",probability:.8},{playerId:2,matchup:"A",tier:"Standard",lean:"Lower",probability:.9},{playerId:3,matchup:"B",tier:"Goblin",lean:"Higher",probability:.95},{playerId:4,matchup:"C",tier:"Standard",lean:"Higher",probability:.7}];
 const r=optimize(props);assert.equal(r[2].picks.length,2);assert.equal(r[3],null);
});
test("five-six allow at most two per game, explicitly flag unverified correlated risk",()=>{
 const props=Array.from({length:8},(_,i)=>({playerId:i+1,player:"P"+i,team:"T",matchup:"game "+Math.floor(i/2),tier:"Standard",lean:"Higher",probability:.6+i*.01,observations:12}));
 const r=optimize(props);
 assert.equal(r[5].picks.length,5);assert.equal(r[6].picks.length,6);
 assert.equal(r[6].correlationRisk,"elevated_same_game");
 assert.equal(r[6].payoutQuoteVerified,false);
 assert.equal(r[6].publishedStandardPowerMultiplier,null);
 assert.equal(r[6].expectedValue,null);
 assert.equal(new Set(r[6].picks.map(p=>p.playerId)).size,6);
 const counts={};for(const p of r[6].picks)counts[p.matchup]=(counts[p.matchup]||0)+1;
 assert.ok(Object.values(counts).every(n=>n<=2));
});

test("duplicate market sides and alternate lines cannot crowd out other players",()=>{
 const noisy=Array.from({length:35},(_,i)=>({
  playerId:1,matchup:"BOS vs NYR",market:"shotsOnGoal",line:.5+i,
  tier:"Standard",lean:"Higher",probability:.99-i*.0001,observations:20
 }));
 const others=Array.from({length:7},(_,i)=>({
  playerId:i+2,matchup:"game "+i,market:"shotsOnGoal",
  tier:"Standard",lean:"Higher",probability:.70-i*.01,observations:20
 }));
 const r=optimize([...noisy,...others]);
 assert.equal(r[6].picks.length,6);
 assert.equal(new Set(r[6].picks.map(p=>p.playerId)).size,6);
 assert.equal(r[6].candidateCount,8);
 assert.ok(r[6].deduplicatedCandidates>=34);
});
test("in-game, poststart, and model probability at/below 50% cannot enter a slip",()=>{
 const base={tier:"Standard",lean:"Higher",probability:.7,
   market:"shotsOnGoal",matchup:"BOS vs NYR",
   capturedAt:"2026-11-04T20:00:00Z",eventStartsAt:"2026-11-05T00:00:00Z"};
 const props=[
  {...base,playerId:1},
  {...base,playerId:2,matchup:"NYR vs PHI",isLive:true},
  {...base,playerId:3,matchup:"PIT vs DET",capturedAt:"2026-11-05T01:00:00Z"},
  {...base,playerId:4,matchup:"TOR vs MTL",probability:.5},
  {...base,playerId:5,matchup:"SJS vs LAK",probability:.8}
 ];
 const r=optimize(props);
 assert.equal(r[2].picks.length,2);
 assert.deepEqual(new Set(r[2].picks.map(p=>p.playerId)),new Set([1,5]));
 assert.equal(r[3],null);
});

test("live optimizer rejects expired quotes, imminent starts and suspended lines",()=>{
 const now="2026-11-05T17:30:00Z",good={
  tier:"Standard",lean:"Higher",probability:.66,market:"shotsOnGoal",
  capturedAt:"2026-11-05T17:25:00Z",observedAt:"2026-11-05T17:24:00Z",
  eventStartsAt:"2026-11-05T19:00:00Z"
 };
 const props=[
  {...good,playerId:1,matchup:"BOS vs NYR"},
  {...good,playerId:2,matchup:"BUF vs OTT"},
  {...good,playerId:3,matchup:"SJS vs LAK",observedAt:"2026-11-05T16:55:00Z"},
  {...good,playerId:4,matchup:"CHI vs FLA",eventStartsAt:"2026-11-05T17:40:00Z"},
  {...good,playerId:5,matchup:"SEA vs CGY",status:"suspended"},
  {...good,playerId:6,matchup:"COL vs DAL",capturedAt:"2026-11-05T17:36:00Z"},
  {...good,playerId:7,matchup:"MIN vs PHI",isLive:true}
 ];
 const r=optimize(props,{at:now});
 assert.deepEqual(r[2].picks.map(x=>x.playerId),[1,2]);
 assert.equal(r[2].candidateCount,2);
 assert.equal(r[2].sourceFreshnessVerifiedAtEvaluation,true);
 assert.equal(r[2].evaluationAsOf,now);
 assert.equal(r[3],null);
});
test("stale-but-pregame lineups fail closed when evaluated as current research",()=>{
 const at="2026-11-05T17:30:00Z";
 const old={tier:"Standard",lean:"Higher",probability:.8,
  market:"points",capturedAt:"2026-11-05T16:00:00Z",
  observedAt:"2026-11-05T15:55:00Z",
  eventStartsAt:"2026-11-05T20:00:00Z"};
 const r=optimize([{...old,playerId:1,matchup:"game 1"},
   {...old,playerId:2,matchup:"game 2"}],{at});
 assert.equal(r[2],null);
 assert.throws(()=>optimize([],{at:"not-a-real-time"}),/Invalid live NHL optimizer clock/);
});


test("immutable as-of membership retains current unchanged quotes without reviving stale captures",()=>{
 const at="2026-11-06T21:00:00Z",base={
  market:"shotsOnGoal",tier:"Standard",lean:"Higher",probability:.68,
  capturedAt:"2026-11-06T20:56:00Z",observedAt:"2026-10-21T17:00:00Z",
  verifiedThirdPartyBoardMembershipAt:"2026-11-06T20:55:57Z",
  eventStartsAt:"2026-11-07T00:15:00Z"
 };
 const p=[
  {...base,playerId:1,matchup:"NYR vs BOS"},
  {...base,playerId:2,matchup:"FLA vs EDM"},
  {...base,playerId:3,matchup:"TOR vs MTL",
   verifiedThirdPartyBoardMembershipAt:"2026-11-06T17:00:00Z"},
  {...base,playerId:4,matchup:"DAL vs ANA",
   capturedAt:"2026-11-06T20:10:00Z",verifiedThirdPartyBoardMembershipAt:"2026-11-06T20:09:00Z"}
 ];
 const r=optimize(p,{at});
 assert.deepEqual(r[2].picks.map(x=>x.playerId),[1,2]);
 assert.equal(r[2].lineupSearchExhaustive,true);
 assert.equal(r[2].probability,null);
 assert.equal(r[2].sensitivityOnly.jointProbability,null);
 assert.equal(r[2].sensitivityOnly.profitabilityVerified,false);
 assert.equal(optimize(p,{at:"2026-11-06T21:30:01Z"})[2],null);
});
test("lineup search has finite node budget and never labels incomplete search globally optimal",()=>{
 const props=Array.from({length:40},(_,i)=>({
  playerId:i+1,matchup:"game "+Math.floor(i/2),market:"shotsOnGoal",
  tier:"Standard",lean:"Higher",probability:.8-i*.001,observations:10
 }));
 const x=optimize(props,{limit:30,maxSearchNodes:150});
 for(const n of [2,3,4,5,6]){
  const lineup=x[n];
  if(!lineup)continue;
  assert.equal(lineup.probability,null);
  assert.equal(lineup.expectedValue,null);
  assert.ok(lineup.searchNodesVisited<=151);
  assert.equal(lineup.optimized,lineup.lineupSearchExhaustive);
  if(!lineup.lineupSearchExhaustive)assert.match(lineup.optimizationScope,/not proven globally optimal/);
 }
 assert.throws(()=>optimize(props,{maxSearchNodes:5}),/Invalid bounded/);
});

test("stress optimizer separates reference bounds from approved EV and excludes two-leg Flex",()=>{const props=Array.from({length:7},(_,i)=>{const p=.8-i*.03;return {playerId:i+1,tier:"Standard",lean:"Higher",probability:p,probabilities:{higher:p,lower:1-p,push:0},matchup:"game "+i};});for(const format of ["power","flex"]){const a=optimize(props,{researchFormat:format,allowSameGameFallback:false,researchObjective:"dependence_lower_reference"});if(format==="flex")assert.equal(a[2],null);for(let n=format==="power"?2:3;n<=6;n++){assert.equal(a[n].picks.length,n);assert.equal(a[n].researchObjective,"dependence_lower_reference");assert.equal(a[n].privateMarginalStress.cases.length,3);assert.equal(a[n].privateMarginalStress.automaticRecommendationEligible,false);assert.equal(a[n].expectedValue,null);assert.ok(Math.abs(a[n].rankScore-a[n].privateReferenceDependenceBounds.referenceGrossLower)<.00001);}}});

test("official NHL pregame injury prevents research lineup even when source line unchanged",()=>{const now="2026-11-16T22:00:00Z",start="2026-11-17T00:30:00Z",source={kind:"nhl_league_published_pregame_status_v1",capturedAt:"2026-11-16T21:59:00Z",sources:[{gameId:2026020331,url:"https://www.nhl.com/news/game"}],rows:[{playerId:8476981,gameId:2026020331,team:"MTL",eventStartsAt:start,reportedAt:"2026-11-16T21:59:00Z",status:"injured"}]},base={tier:"Standard",market:"shotsOnGoal",lean:"Higher",probability:.75,line:1.5,observations:10,capturedAt:"2026-11-16T21:59:30Z",observedAt:"2026-11-16T21:59:00Z",eventStartsAt:start,gameId:2026020331,opponent:"NYR",team:"MTL",matchup:"MTL vs NYR"};const a=optimize([{...base,playerId:8476981},{...base,playerId:999,gameId:2026020332,matchup:"BOS vs NYI"},{...base,playerId:1000,gameId:2026020333,matchup:"PHI vs PIT"}],{at:now,officialPreview:source});assert.equal(a[2].picks.some(x=>x.playerId===8476981),false);assert.equal(a[2].candidateCount,2);});
