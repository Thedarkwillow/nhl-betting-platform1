"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildPreview}=require("../scripts/build-nhl-source-preview.cjs");
const now="2026-11-06T21:00:00Z",captured="2026-11-06T20:56:00Z",
 oldSeen="2026-10-25T19:00:00Z",start="2026-11-07T01:00:00Z";
const board={generatedAt:captured,boardAsOfAt:"2026-11-06T20:55:58Z",
 provider:"prizepicksapi.com",snapshotMode:"immutable_as_of",
 completePagination:true,sourceStatus:"fresh",rows:[
  {player:"Alex Skater",team:"NYR",matchup:"EDM",market:"Shots On Goal",
   side:"Higher",tier:"Standard",line:2.5,period:"Full game",
   eventStartsAt:start,capturedAt:captured,observedAt:oldSeen,projectionId:"x"},
  {player:"Bob Skater",team:"BOS",matchup:"FLA",market:"Shots On Goal",
   side:"Higher",tier:"Standard",line:1.5,period:"Full game",
   eventStartsAt:start,capturedAt:captured,observedAt:oldSeen,projectionId:"y"}
 ]};
const projections={model:"weighted-form-v1",builtAt:"2026-11-06T19:58:00Z",players:{
 "1":{playerId:1,name:"A. Skater",team:"NYR",type:"skater",
 latestGameDate:"2026-11-04",projections:{shotsOnGoal:{ready:true,
 estimate:3.2,last5:3,last10:3,observations:10}}},
 "2":{playerId:2,name:"B. Skater",team:"BOS",type:"skater",
 latestGameDate:"2026-11-04",projections:{shotsOnGoal:{ready:true,
 estimate:2.8,last5:2.5,last10:2.9,observations:10}}}
}};
test("preview publishes model research from complete independent board without frozen cohort claims",()=>{
 const report=buildPreview({board,projections,now});
 assert.equal(report.snapshotKind,"nhl_independent_source_model_preview_v1");
 assert.equal(report.boardGeneratedAt,captured);
 assert.equal(report.matchedRows,2);
 assert.equal(report.lineups[2].picks.length,2);
 assert.equal(report.lineups[2].searchNodesVisited>0,true);
 assert.equal(report.prospectiveCohort,false);
 assert.equal(report.eligibleForOfficialProspectiveGrading,false);
 assert.deepEqual(report.individualPropSelections,[]);
 assert.equal(report.originalPlatformAvailabilityVerified,false);
 assert.equal(report.lineups[2].probability,null);
 assert.equal(report.lineups[2].expectedValue,null);
});
test("preview rejects stale, partial, wrong provider, or falsely future board",()=>{
 for(const candidate of [
  {...board,completePagination:false},{...board,sourceStatus:"stale"},
  {...board,provider:"unknown"},
  {...board,generatedAt:"2026-11-06T21:01:00Z"},
  {...board,generatedAt:"2026-11-06T19:50:00Z"}
 ])assert.throws(()=>buildPreview({board:candidate,projections,now}),/complete fresh/);
});
test("preview does not regrade or backdate a model built after player game",()=>{
 const bad=JSON.parse(JSON.stringify(projections));
 bad.players["1"].latestGameDate="2026-11-07";
 const preview=buildPreview({board,projections:bad,now});
 assert.equal(preview.matchedRows,1);
 assert.equal(preview.excluded.lookahead_risk,1);
 const stale={...projections,builtAt:"2026-11-01T00:00:00Z"};
 assert.throws(()=>buildPreview({board,projections:stale,now}),/complete fresh/);
 assert.throws(()=>buildPreview({board,projections:{...projections,builtAt:"2026-11-06T20:59:00Z"},now}),/complete fresh/);
});
