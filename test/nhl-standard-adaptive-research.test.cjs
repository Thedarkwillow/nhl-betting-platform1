"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {features,prepare,pointSource,newFit,update,freeze,score}=require("../src/nhl-standard-adaptive-research.cjs");
const {beforeFreeze}=require("../src/archived-prop-market-benchmark.cjs");
const {POLICY}=require("../src/nhl-frozen-individual-props.cjs");
const prior=Array.from({length:12},(_,i)=>({gameId:i+1,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),playerId:1,team:"UTA",type:"skater",gameState:"FINAL",timeOnIceSeconds:1200,shotsOnGoal:i%4,goals:i%2,assists:i%3,points:i%2+i%3,blockedShots:1,powerPlayPoints:0}));
test("standard research requires sufficient role history, does not infer integer-line push law",()=>{
 const f=features(prior,"points",.5,Array(15).fill(5),Array(40).fill(4),"2026-10-20");
 assert.ok(f.componentVerified&&f.opponentUsed&&f.probs.every(p=>p>0&&p<1));
 assert.equal(features(prior,"points",1,[],[],"2026-10-20"),null);
 assert.equal(features(prior.slice(0,5),"points",.5,[],[],"2026-10-20"),null);
});
test("whole target day is withheld; regularized learner updates only previous completed batches",()=>{
 const h={players:{"1":{games:prior}}},schedule={source:"Official NHL Web API",complete:true,games:[]};
 const a=prepare(h,schedule,"2026-10-12");
 const changed={players:{"1":{games:prior.map(g=>g.gameDate==="2026-10-12"?{...g,points:99,shotsOnGoal:99}:g)}}};
 const b=prepare(changed,schedule,"2026-10-12");
 assert.deepEqual(a.fit.points.w,b.fit.points.w);
 assert.deepEqual(a.historical,b.historical);
 const s=newFit();const w=s.w.slice(),r={gameId:1,day:"2026-10-10",x:[1,0,0,0,0,0],y:1};
 update(s,[r]);assert.ok(s.w[0]>w[0]);assert.equal(s.games.size,1);
 const t=newFit();update(t,[r,r]);assert.deepEqual(s.w,t.w);
});
test("source-context and sportsbook benchmarks refuse missing or future evidence",()=>{
 const p={player:"Test Player",playerId:1,gameId:123,team:"UTA",opponent:"SJS",market:"points",line:.5,gameStartAt:"2026-11-15T20:00:00Z"};
 const asOf="2026-11-15T17:00:00Z",q={sport:"NHL",eventId:"abc",homeTeam:"Utah Mammoth",awayTeam:"San Jose Sharks",commenceTime:p.gameStartAt,player:p.player,market:p.market,period:"full_game",line:p.line,source:"The Odds API",overOdds:-110,underOdds:-110,capturedAt:"2026-11-15T16:50:00Z",marketUpdatedAt:"2026-11-15T16:50:00Z"};
 const archive={kind:"bounded_sportsbook_capture_v1",status:"fresh_bounded_archive",generatedAt:q.capturedAt,rows:[{...q,book:"draftkings"},{...q,book:"fanduel"}]};
 const a={archive,firstCommittedAt:"2026-11-15T16:55:00Z",gitHistoryCount:1};
 assert.equal(beforeFreeze(p,[a],asOf).higher,.5);
 assert.equal(beforeFreeze(p,[{...a,firstCommittedAt:"2026-11-15T17:01:00Z"}],asOf),null);
 assert.equal(beforeFreeze({...p,line:1.5},[a],asOf),null);
 assert.equal(pointSource(p,prior,{expectedTOI:1200},{generatedAt:"2026-11-15T17:01:00Z"},asOf),null);
});
test("original selection and offered direction remain unchanged; retrospective replay is separate",()=>{
 const h={players:{"1":{games:prior}}},schedule={source:"Official NHL Web API",complete:true,games:[]};
 const o={playerId:1,gameId:123,team:"UTA",opponent:"SJS",market:"points",tier:"Standard",lean:"Higher",line:.5,capturedAt:"2026-10-20T16:00:00Z",gameStartAt:"2026-10-20T20:00:00Z"};
 const s={generatedAt:"2026-10-20T16:01:00Z",individualPropSelectionPolicy:POLICY,individualPropSelections:[o],rankedProps:[{...o,probabilities:{higher:.6,lower:.4,push:0}}]};
 const v=freeze(s,h,schedule);assert.equal(v.rows.length,1);assert.equal(v.rows[0].originalSide,"Higher");assert.deepEqual(v.rows[0].availableSides,["Higher"]);assert.equal(v.rows[0].selectiveSide,null);
 const frame={snapshot:{...s,standardAdaptiveResearchV2:v},firstCommittedAt:"2026-10-20T16:02:00Z",gitHistoryCount:1};
 assert.deepEqual(score([frame],h,"2026-10-21T00:00:00Z").byMarket,{});
 assert.equal(score([frame],h,"2026-10-19T00:00:00Z").byMarket.points.registered,1);
});
