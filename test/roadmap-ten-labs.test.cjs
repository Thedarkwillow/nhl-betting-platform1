"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {study,predict}=require("../src/nhl-fixed-ensemble-research.cjs");
const {study:kicker}=require("../src/nfl-kicker-opportunity-lab.cjs");
const {summarize,pairStudy}=require("../src/lineup-dependence-bounds-research.cjs");
const {compare}=require("../src/pregame-source-close-research.cjs");
const {buildPlayerInsights}=require("../src/nhl-public-research-extensions.cjs");
const day=i=>new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10);
function goalie(i){return {gameId:i+1,playerId:4,gameDate:day(i),gameState:"FINAL",type:"goalie",team:"AAA",opponent:"BBB",timeOnIceSeconds:3600,saves:25+i%4,shotsAgainst:30+i%4};}
test("goalie shot-rate and ensemble use only earlier results",()=>{
 const rows=Array.from({length:12},(_,i)=>goalie(i));
 const a=predict(rows.slice(0,10),[29,30,32,31,28],Array(30).fill(30),"saves",day(10));
 const b=predict([...rows.slice(0,10),{...goalie(10),saves:900,shotsAgainst:1000}], [29,30,32,31,28],Array(30).fill(30),"saves",day(10));
 assert.equal(a.ensemble,b.ensemble);assert.equal(a.goalieShotModel,true);assert.equal(a.mass(a.ensemble,27.5),b.mass(b.ensemble,27.5));
 const r=study({players:{4:{games:rows}}}).byMarket.saves;
 assert.equal(r.playerGames,4);assert.equal(r.thresholdEvaluations,12);assert.ok(Number.isFinite(r.models.ensemble.brier));
});
test("kicker opportunity walk-forward uses earlier weeks and tracks missing weather without imputation",()=>{
 const schedule=Array.from({length:10},(_,i)=>({game_id:"g"+i,home_team:"A",away_team:"B",home_score:20+i,away_score:10,wind:i===9?99:null}));
 const rows=schedule.map((g,i)=>({gameId:g.game_id,playerId:"k",team:"A",year:2025,week:i+1,measures:{fg_made:2,fg_attempts:2,kicking_points:8}}));
 const a=kicker(rows,schedule,[]);assert.equal(a.evaluatedAppearances,2);assert.equal(a.priorKickDistanceCoverage,0);assert.equal(a.priorRecordedWindCoverage,0);assert.equal(a.actualGameWeatherUsed,false);
});
test("lineup uncertainty provides mathematical bounds and explicitly unknown risk",()=>{
 const r=summarize([{probability:.6,playerId:1,gameId:1},{probability:.7,playerId:2,gameId:1}]);
 assert.ok(Math.abs(r.arbitraryDependenceAllHitBounds.lower-.3)<1e-9);assert.equal(r.arbitraryDependenceAllHitBounds.upper,.6);assert.equal(r.pairFlags.sameGame,1);assert.equal(r.jointProbabilityVerified,false);
 assert.equal(summarize([{probability:.9}]),null);
 const prior=Array.from({length:25},(_,i)=>({gameId:i+1,day:day(i),a:i%2,b:i%2}));
 const p=pairStudy(prior,{minPrior:20});assert.equal(p.heldoutGames,5);assert.ok(Number.isFinite(p.pairedJointBrier));assert.equal(p.productionEligible,false);
});
test("near-start exact-source movement excludes post-start and altered markets",()=>{
 const p={projectionId:"id",providerPlayerId:"p",providerGameId:"g",market:"SOG",period:"Full game",tier:"Standard",side:"Higher",eventStartsAt:"2026-11-14T23:00:00Z",capturedAt:"2026-11-14T10:00:00Z",firstCommittedAt:"2026-11-14T10:02:00Z",provider:"source",line:2.5};
 const later={...p,capturedAt:"2026-11-14T22:42:00Z",firstCommittedAt:"2026-11-14T22:44:00Z",line:3.5,completeOriginalBoard:true,singleGitAddition:true};
 const r=compare(p,[later,{...later,market:"Other"},{...later,capturedAt:"2026-11-14T23:01:00Z",firstCommittedAt:"2026-11-14T23:02:00Z",line:9}]);
 assert.equal(r.status,"near_start_source_observation");assert.equal(r.signedThresholdMovement,1);assert.equal(r.authenticatedClose,false);
 assert.equal(compare(p,[{...later,firstCommittedAt:"2026-11-14T23:00:00Z"}]).status,"no_verified_later_pregame_observation");
});
test("historical player chart includes positive-participation earlier official records only",()=>{
 const player={name:"A",team:"AAA",games:[goalie(0),{...goalie(1),gameState:"LIVE"},goalie(2)]};
 const p={playerId:4,player:"A",team:"AAA",market:"saves",capturedAt:day(2)+"T09:00:00Z"};
 const r=buildPlayerInsights([p],{players:{4:player}})[0];
 assert.equal(r.historicalGames,1);assert.deepEqual(r.recentOfficialValues,[{date:day(0),value:25}]);
});
