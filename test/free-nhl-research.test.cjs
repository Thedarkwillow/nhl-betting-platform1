"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildFreeNhlResearch}=require("../src/free-nhl-research.cjs");
const now="2026-11-01T20:00:00Z";
const board={generatedAt:"2026-11-01T19:59:00Z",completePagination:true,rows:[]};
const projections={builtAt:"2026-11-01T18:00:00Z",model:"test",players:{
 "1":{playerId:1,name:"A. Skater",team:"NYR",latestGameDate:"2026-10-29",projections:{shotsOnGoal:{estimate:3.2,observations:18,ready:true,last5:3,last10:3.2}}},
 "2":{playerId:2,name:"B. Skater",team:"BOS",latestGameDate:"2026-10-29",projections:{shotsOnGoal:{estimate:2.2,observations:17,ready:true,last5:2,last10:2.2}}}
}};
const row={player:"Alex Skater",team:"NYR",market:"Shots On Goal",line:2.5,tier:"Standard",
 side:"Higher",matchup:"EDM",period:"Full game",isLive:false,eventStartsAt:"2026-11-02T01:00:00Z",
 capturedAt:"2026-11-01T19:59:00Z",observedAt:"2026-11-01T19:58:00Z",projectionId:"123"};
test("free feed ranks only available sides and preserves honest model status",()=>{
 const b={...board,rows:[row,{...row,side:"Lower"},{...row,player:"Bob Skater",team:"BOS",matchup:"FLA",line:1.5,projectionId:"124"}]};
 const v=buildFreeNhlResearch(b,projections,now);
 assert.equal(v.matchedRows,3);
 assert.equal(v.lineups[2].picks.length,2);
 assert.equal(v.lineups[3],null);
 assert.equal(v.lineups[2].probability,null);
 assert.equal(v.lineups[2].expectedValue,null);
 assert.equal(v.rankedProps[0].probabilityCalibrated,false);
 assert.equal(v.rankedProps[0].expectedValue,null);
});
test("rejects started, stale, unsupported and model lookahead props",()=>{
 const b={...board,rows:[
 {...row,eventStartsAt:"2026-11-01T19:00:00Z"},
 {...row,observedAt:"2026-11-01T17:00:00Z"},
 {...row,market:"Time On Ice"},
 {...row,side:"Lower",tier:"Demon"}
 ]};
 const v=buildFreeNhlResearch(b,projections,now);
 assert.equal(v.rankedProps.length,0);
 assert.equal(v.excluded.game_already_started,1);
 assert.equal(v.excluded.stale_or_invalid_capture,1);
 assert.equal(v.excluded.research_shadow_not_validated_for_live_picks,1);
 assert.equal(v.excluded.unavailable_side,1);
 const x=JSON.parse(JSON.stringify(projections));x.players["1"].latestGameDate="2026-11-02";
 assert.equal(buildFreeNhlResearch({...board,rows:[row]},x,now).excluded.lookahead_risk,1);
});
test("fails closed on stale source or stale projections",()=>{
 assert.equal(buildFreeNhlResearch({...board,generatedAt:"2026-11-01T18:00:00Z",rows:[row]},projections,now).rankedProps.length,0);
 assert.equal(buildFreeNhlResearch({...board,rows:[row]},{...projections,builtAt:"2026-10-25T18:00:00Z"},now).rankedProps.length,0);
});

test("live NHL research keeps unconfirmed goalie saves visible only on watchlist, never auto-lineup",()=>{
 const both=JSON.parse(JSON.stringify(projections));
 both.players["3"]={playerId:3,name:"C. Goalie",team:"ANA",type:"goalie",latestGameDate:"2026-10-29",
  projections:{saves:{estimate:26.4,observations:8,ready:true,last5:27,last10:26}}};
 const g={...row,player:"Chris Goalie",team:"ANA",market:"Goalie Saves",line:23.5,side:"Higher",
  matchup:"NYI",projectionId:"goalie-g1"};
 const s={...row,player:"Alex Skater",team:"NYR",market:"Shots On Goal",line:2.5,side:"Higher",
  matchup:"EDM",projectionId:"skater-s1"};
 const t={...row,player:"Bob Skater",team:"BOS",market:"Shots On Goal",line:1.5,side:"Higher",
  matchup:"FLA",projectionId:"skater-s2"};
 const result=buildFreeNhlResearch({...board,rows:[g,s,t]},both,now);
 assert.equal(result.matchedRows,3);
 const goalie=result.rankedProps.find(x=>x.market==="saves");
 assert.equal(goalie.researchEligibility,"watchlist");
 assert.ok(goalie.roleEvidence.reasons.includes("STARTING_GOALIE_NOT_CONFIRMED"));
 assert.equal(goalie.roleEvidence.starterStatus,"unconfirmed");
 assert.equal(goalie.injuryVerified,false);
 assert.equal(result.roleEvidenceReport.goalieSaveProps,1);
 assert.equal(result.lineups[2].picks.some(x=>x.playerId===3),false);
});

test("The Odds API PrizePicks backup ranks separately without falsely labelling event scope as full NHL board",()=>{
 const fallback={...board,provider:"The Odds API",
  sourceScope:"verified_selected_events",completePagination:true,
  rows:[{...row,projectionId:"oddsapi:game1:shots"}]};
 const r=buildFreeNhlResearch(fallback,projections,now);
 assert.equal(r.rankedProps.length,1);
 assert.equal(r.boardCoverageComplete,false);
 assert.equal(r.captureScopeComplete,true);
 assert.equal(r.sourceScope,"verified_selected_events");
 assert.equal(r.source,"The Odds API");
 assert.equal(r.rankedProps[0].provider,"The Odds API");
 assert.equal(r.rankedProps[0].originalFantasyPlatformAuthenticated,false);
 assert.equal(r.rankedProps[0].originalPlatformTierVerified,false);
});
test("unverified PrizePicks alternate tiers are excluded instead of being guessed from flat prices",()=>{
 const backup={...board,provider:"The Odds API",
  sourceScope:"verified_selected_events",completePagination:true,
  rows:[{...row,side:"Higher",tier:"Unverified alternate",projectionId:"oddsapi-alt"}]};
 const r=buildFreeNhlResearch(backup,projections,now);
 assert.equal(r.rankedProps.length,0);
 assert.equal(r.excluded.unavailable_side,1);
});

test("fixed-as-of NHL board keeps genuinely active old line-change offers for pregame picks",()=>{
 const historicalChange={...row,observedAt:"2026-10-27T19:55:00Z"};
 const freshAsOf={...board,provider:"prizepicksapi.com",
  sourceStatus:"fresh",snapshotMode:"immutable_as_of",
  boardAsOfAt:"2026-11-01T19:58:50Z",rows:[historicalChange]};
 const v=buildFreeNhlResearch(freshAsOf,projections,now);
 assert.equal(v.boardFresh,true);
 assert.equal(v.matchedRows,1);
 assert.equal(v.rankedProps[0].observedAt,historicalChange.observedAt);
 assert.equal(v.rankedProps[0].verifiedThirdPartyBoardMembershipAt,freshAsOf.boardAsOfAt);
 assert.equal(v.boardAsOfAt,freshAsOf.boardAsOfAt);
 assert.equal(v.rankedProps[0].originalFantasyPlatformAuthenticated,false);
 const partial=buildFreeNhlResearch({...freshAsOf,completePagination:false},projections,now);
 assert.equal(partial.matchedRows,0);
 assert.equal(partial.excluded.stale_or_invalid_capture,1);
 const expired=buildFreeNhlResearch({...freshAsOf,boardAsOfAt:"2026-11-01T18:00:00Z"},projections,now);
 assert.equal(expired.matchedRows,0);
});
