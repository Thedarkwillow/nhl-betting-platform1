"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{stat}=require("../src/nfl-position-rankings-v1.cjs"),w=require("../src/matchup-market-weight-holdout-v1.cjs");
test("new and historical interception schemas map only when nonconflicting",()=>{
 assert.equal(stat({passing_interceptions:2},"interceptions"),2);
 assert.equal(stat({interceptions:1},"interceptions"),1);
 assert.equal(stat({interceptions:1,passing_interceptions:2},"interceptions"),null);
});
test("learned weights never use holdout outcomes and small groups retain baseline",()=>{
 const s=w.create();for(let i=0;i<100;i++)w.observe(s,{base:2,position:4,combined:5,actual:4,gameId:i,train:true});
 w.observe(s,{base:2,position:4,combined:5,actual:0,gameId:101,train:false,lines:[1.5]});
 const first=w.summarize(s).weights;assert.deepEqual(first,{position:1,headToHead:0});
 w.observe(s,{base:2,position:4,combined:5,actual:5,gameId:102,train:false});assert.deepEqual(w.summarize(s).weights,first);
 assert.throws(()=>w.observe(s,{base:2,position:4,combined:5,actual:4,gameId:103,train:true}),/Training after holdout/);
 const small=w.create();w.observe(small,{base:2,position:4,combined:5,actual:4,gameId:1,train:false});assert.deepEqual(w.summarize(small).weights,{position:0,headToHead:0});
});

test("NWS forecast must match exact venue and pregame interval, never assume rain amount",()=>{
 const {parseHourly}=require("../src/nfl-nws-pregame-weather-v1.cjs");
 const game={stadiumId:"A",stadiumName:"Test",team:"A",opponent:"B",eventStartsAt:"2026-11-26T18:30:00Z",roof:"outdoors"};
 const venue={stadiumId:"A",stadiumName:"Test",verified:true};
 const periods=[{startTime:"2026-11-26T18:00:00Z",endTime:"2026-11-26T19:00:00Z",windSpeed:"10 mph",probabilityOfPrecipitation:{value:25}}];
 const v=parseHourly(periods,game,venue,"2026-11-26T17:00:00Z","2026-11-26T16:00:00Z");
 assert.ok(v);assert.equal(v.precipitationMm,null);assert.equal(v.precipitationProbabilityPct,25);
 assert.equal(parseHourly(periods,game,{...venue,stadiumId:"B"},"2026-11-26T17:00:00Z","2026-11-26T16:00:00Z"),null);
 assert.equal(parseHourly(periods,game,venue,"2026-11-26T18:20:00Z","2026-11-26T16:00:00Z"),null);
});
test("drive evidence requires source boundary plays and explicit outcome",()=>{
 const {verifiedDriveSubset}=require("../src/nfl-special-teams-matchup-v1.cjs");
 const x={fixed_drive:1,fixed_drive_result:"Touchdown",drive_play_id_started:1,drive_play_id_ended:2,drive_inside20:1,play_type:"run"};
 assert.equal(verifiedDriveSubset([{...x,play_id:1}]),null);
 const d=verifiedDriveSubset([{...x,play_id:1},{...x,play_id:2}]);assert.equal(d.verifiedObservedRedZoneTouchdowns,1);assert.equal(d.completeDriveChartVerified,false);
});
