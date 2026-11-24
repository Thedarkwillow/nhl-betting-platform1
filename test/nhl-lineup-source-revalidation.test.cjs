"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {inspectPick,inspectLineupSource}=require("../src/nhl-lineup-source-revalidation.cjs");
const now="2026-11-06T23:00:00Z";
const sourceAt="2026-11-06T22:57:00Z";
const start="2026-11-07T03:00:00Z";
const p={playerId:1,player:"Example Skater",team:"NYR",opponent:"EDM",
 eventStartsAt:start,market:"shotsOnGoal",line:2.5,tier:"Standard",lean:"Higher"};
const goalie={...p,playerId:2,player:"Example Goalie",team:"EDM",opponent:"NYR",
 market:"saves",line:24.5,lean:"Lower"};
const row=(prop)=>({player:prop.player,team:prop.team,matchup:prop.opponent,
 eventStartsAt:prop.eventStartsAt,market:prop.market==="saves"?"Goalie Saves":"Shots On Goal",
 period:"Full game",line:prop.line,tier:prop.tier,side:prop.lean,isLive:false});
const board=(rows=[])=>({provider:"prizepicksapi.com",sourceStatus:"fresh",
 completePagination:true,generatedAt:sourceAt,rows});
test("verify exact current player/team/opponent/event, stat, period, tier, side and threshold",()=>{
 const v=inspectLineupSource([p,goalie],board([row(p),row(goalie)]),{now});
 assert.equal(v.status,"unchanged_in_fresh_independent_source_only");
 assert.equal(v.valid,2);
 assert.equal(v.moved,0);
 assert.equal(v.originalAppAvailabilityVerified,false);
 assert.equal(v.payoutRulesVerified,false);
 assert.equal(v.wagersPlaced,0);
});
test("moved line or unobserved side invalidates only the research lineup, not a fantasy app",()=>{
 const moved=inspectLineupSource([p,goalie],board([
  {...row(p),line:3.5},row(goalie)]),{now});
 assert.equal(moved.status,"research_lineup_requires_revalidation_or_reoptimization");
 assert.equal(moved.moved,1);
 assert.deepEqual(moved.picks[0].newObservedLines,[3.5]);
 const side=inspectPick(p,[{...row(p),side:"Lower"}]);
 assert.equal(side.status,"chosen_side_not_observed_on_refresh");
 const absent=inspectLineupSource([p,goalie],board([row(goalie)]),{now});
 assert.equal(absent.unseen,1);
 assert.equal(absent.picks[0].status,"not_seen_in_independent_feed_unverified_removal");
 assert.equal(absent.originalAppAvailabilityVerified,false);
});
test("misjoined opponent, game or period cannot create apparently valid lineup",()=>{
 for(const bad of [
  {...row(p),matchup:"TOR"},
  {...row(p),eventStartsAt:"2026-11-07T04:00:00Z"},
  {...row(p),period:"1st Period"},
  {...row(p),player:"Example Skater Jr."}
 ]){
  assert.equal(inspectPick(p,[bad]).status,"not_seen_in_independent_feed_unverified_removal");
 }
 const ambiguous=inspectPick(p,[row(p),{...row(p),projectionId:"other"}]);
 assert.equal(ambiguous.status,"ambiguous_duplicate_source_matches");
});
test("stale or partial provider data cannot confirm any lineup",()=>{
 const stale=inspectLineupSource([p,goalie],board([row(p),row(goalie)]),
  {now:"2026-11-07T00:00:00Z"});
 assert.equal(stale.status,"no_current_independent_source");
 const partial=inspectLineupSource([p,goalie],{
  ...board([row(p),row(goalie)]),completePagination:false},{now});
 assert.equal(partial.status,"no_current_independent_source");
 assert.equal(inspectLineupSource([p],board([row(p)]),{now}).status,"invalid_or_missing_lineup");
});
