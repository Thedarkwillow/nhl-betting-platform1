"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildIndependentNflPreview}=require("../src/nfl-independent-source-preview.cjs");
const now="2026-11-14T20:00:00Z",start="2026-11-15T18:00:00Z";
const schedule=[{game_id:"2026_10_BUF_NYJ",game_type:"REG",season:2026,week:10,gameday:"2026-11-15",gametime:"13:00",home_team:"NYJ",away_team:"BUF"}];
const weeklyRows=Array.from({length:9},(_,i)=>({player_id:"id1",player_display_name:"Example QB",season:2026,week:i+1,season_type:"REG",recent_team:"BUF",position:"QB",passing_yards:200+10*i})).concat([{player_id:"id1",player_display_name:"Example QB",season:2026,week:10,season_type:"REG",recent_team:"BUF",position:"QB",passing_yards:9999}]);
const prop={id:"pp_a",source:"prizepicks",league:"NFL",status:"active",observed_at:now,player:{name:"Example QB",team:"BUF"},event:{opponent:"NYJ",starts_at:start},market:{stat:"Pass Yards",period:"Full game"},line:235.5,selections:[{side:"more",tier:"standard",available:true},{side:"less",tier:"standard",available:true}]};
const board={provider:"prizepicksapi.com",league:"NFL",scope:"standard_full_game_replay",snapshotMode:"immutable_as_of",sourceStatus:"fresh",completePagination:true,generatedAt:now,boardAsOfAt:now,offers:[prop]};
test("fresh scoped independent NFL board yields conditional Standard rows; current week never used",()=>{
 const r=buildIndependentNflPreview({board,weeklyRows,schedule,now});
 assert.equal(r.matchedRows,2);assert.equal(r.rows[0].priorGames,9);
 assert.ok(r.rows.every(x=>x.projection<300&&x.conditionalOnPlaying&&!x.autoPickEligible));
 assert.equal(r.fullNFLBoardVerified,false);assert.equal(r.publicReleaseApproved,false);
});
test("NFL preview rejects incomplete replay and skips wrong kickoff or non-full-game props",()=>{
 assert.throws(()=>buildIndependentNflPreview({board:{...board,completePagination:false},weeklyRows,schedule,now}));
 for(const bad of [{...prop,event:{...prop.event,starts_at:"2026-11-15T19:00:00Z"}},{...prop,market:{...prop.market,period:"1H"}}])
  assert.equal(buildIndependentNflPreview({board:{...board,offers:[bad]},weeklyRows,schedule,now}).matchedRows,0);
});

test("Goblin and Demon scope never invents alternate Lower; current injury blocks affected player",()=>{
 for(const tier of ["goblin","demon"]){
  const b={...board,requestedTier:tier,scope:tier+"_full_game_replay",offers:[{...prop,selections:[{tier,side:"more",available:true},{tier,side:"less",available:true}]}]};
  const r=buildIndependentNflPreview({board:b,weeklyRows,schedule,now});
  assert.equal(r.rows.length,1);assert.equal(r.rows[0].side,"Higher");assert.equal(r.rows[0].tier,tier[0].toUpperCase()+tier.slice(1));
  const injuryReport={kind:"nflverse_official_report_derived_injuries_v1",capturedAt:now,rows:[{gsisId:"id1",team:"BUF",season:2026,week:10,modifiedAt:now,status:"out"}]};
  assert.equal(buildIndependentNflPreview({board:b,weeklyRows,schedule,now,injuryReport}).rows.length,0);
 }
});
