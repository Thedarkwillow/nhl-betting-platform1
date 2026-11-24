"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{fullBoundaryDiagnostics}=require("../src/nfl-special-teams-matchup-v1.cjs"),{audit}=require("../scripts/audit-nfl-weather-venue-coverage.cjs");
test("full-source diagnostic distinguishes missing play and invalid boundary",()=>{
 const p={fixed_drive:1,play_id:1,play_type:"run",posteam:"A",defteam:"B",drive_play_id_started:1,drive_play_id_ended:3,fixed_drive_result:"Punt",drive_inside20:0};
 assert.equal(fullBoundaryDiagnostics([p],[],"A","B").reason,"full_source_missing");
 const d=fullBoundaryDiagnostics([p],[p],"A","B");assert.equal(d.drives[0].endPresentInGame,false);assert.equal(d.drives[0].reason,"boundary_absent_from_filtered_archive");
 assert.equal(fullBoundaryDiagnostics([{...p,play_id:9}],[p],"A","B").reason,"filtered_play_absent_from_full_source");
});
test("reviewed international venue does not become eligible for NWS",()=>{
 const a=audit([{game_type:"REG",stadium_id:"LON",stadium:"Test",roof:"outdoors"}],[{stadiumId:"LON",stadiumName:"Test",lat:51,lon:0,verified:true,nwsGeographicCoverage:false}]);assert.equal(a.reviewedPairs,1);assert.equal(a.forecastEligiblePairs,0);
});
