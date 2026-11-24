"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const d=require("../src/nfl-special-teams-matchup-v1.cjs"),r=require("../src/nfl-receiving-depth-components-v1.cjs");
test("full-play source can recover a missing neutral drive boundary without inventing team identity",()=>{
 const core={fixed_drive:1,fixed_drive_result:"Punt",drive_play_id_started:1,drive_play_id_ended:3,drive_inside20:0,posteam:"A",defteam:"B",game_id:"g"};
 const off={...core,play_id:2,play_type:"run"};
 const full=[{...core,play_id:1,play_type:"no_play",posteam:null},off,{...core,play_id:3,play_type:"no_play",posteam:null}];
 assert.equal(d.driveDiagnostics([off]),"boundary_absent_from_filtered_archive");
 assert.equal(d.verifyFullBoundarySubset([off],full,"A","B").fullSourceBoundaryVerified,true);
 assert.equal(d.verifyFullBoundarySubset([off],[...full,{...off,play_id:4,posteam:"B",defteam:"A"}],"A","B"),null);
 assert.equal(d.verifyFullBoundarySubset([{...off,play_id:9}],full,"A","B"),null);
});
test("receiving depth requires explicit air yards, YAC and catches; no inferred route count",()=>{
 const rows=Array.from({length:12},(_,i)=>({gameId:i,airYards:60,yac:20,receptions:4,opportunity:6,value:60}));
 const m=r.components(rows,rows);assert.ok(m.projection>0);assert.equal(m.airYardsPerTarget,10);assert.equal(m.yacPerReception,5);assert.equal(m.routeParticipationVerified,false);
 assert.equal(r.components(rows.map(x=>({...x,airYards:null})),rows),null);
});
test("blocked shot shadow never substitutes shooter blocked attempts for defensive blocks",()=>{
 const b=require("../src/nhl-verified-block-attempt-opportunity-v1.cjs");
 assert.equal(b.candidate({playerId:1,team:"A",opponent:"B",line:1.5},[],{players:{}}),null);
});
