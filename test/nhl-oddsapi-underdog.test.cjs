"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {club,matchEvent,normalizeUnderdogEvent}=require("../src/nhl-oddsapi-underdog.cjs");
const game={id:2026020301,home:"BOS",away:"NYR",startTimeUTC:"2026-11-04T01:00:00Z"};
const schedule={complete:true,games:[game]};
const at="2026-11-03T23:00:00Z";
const players={players:{
 "111":{playerId:111,name:"Example Skater",team:"BOS",type:"skater"},
 "222":{playerId:222,name:"Example Goalie",team:"NYR",type:"goalie"}}};
const event={id:"book-1",home_team:"Boston Bruins",away_team:"New York Rangers",commence_time:game.startTimeUTC,
 bookmakers:[{key:"underdog",markets:[
 {key:"player_shots_on_goal",last_update:"2026-11-03T22:56:00Z",outcomes:[
 {name:"Over",description:"Example Skater",point:2.5,price:-110},
 {name:"Under",description:"Example Skater",point:2.5,price:-110}]},
 {key:"player_total_saves",last_update:"2026-11-03T22:57:00Z",outcomes:[
 {name:"Over",description:"Example Goalie",point:26.5,price:-115}]}]}]};
test("NHL club and event team/home/start identity checks",()=>{
 assert.equal(club("St. Louis Blues"),"STL");
 assert.equal(matchEvent(event,schedule,at).id,game.id);
 assert.equal(matchEvent({...event,home_team:"New York Rangers"},schedule,at),null);
 assert.equal(matchEvent({...event,commence_time:"2026-11-04T04:00:00Z"},schedule,at),null);
});
test("Odds API Underdog DFS standard shots and saves are source-labeled",()=>{
 const r=normalizeUnderdogEvent(event,schedule,players,at);
 assert.equal(r.rows.length,2);
 assert.equal(r.rows[0].higherAvailable,true);
 assert.equal(r.rows[0].tier,"Unverified");
 assert.equal(r.rows[0].originalTierVerified,false);
 assert.equal(r.rows[0].marketVariant,"source_regular_market_not_original_tier");
 assert.equal(r.rows[0].lowerAvailable,true);
 assert.equal(r.rows[1].market,"Goalie Saves");
 assert.equal(r.rows[1].lowerAvailable,false);
 assert.equal(r.rows[1].originalUnderdogPlatformVerified,false);
 assert.equal(r.rows[1].period,"Full game");
});
test("unmatched official roster, stale source, absent bookmaker fail closed",()=>{
 assert.equal(normalizeUnderdogEvent({...event,bookmakers:[]},schedule,players,at).rows.length,0);
 assert.equal(normalizeUnderdogEvent(event,schedule,{players:{}},at).rows.length,0);
 const stale={...event,bookmakers:[{key:"underdog",markets:[
  {...event.bookmakers[0].markets[0],last_update:"2026-11-03T21:00:00Z"}]}]};
 assert.equal(normalizeUnderdogEvent(stale,schedule,players,at).rows.length,0);
});

test("source-code pushes never invoke metered Underdog odds pilot",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const workflow=fs.readFileSync(path.join(__dirname,"../.github/workflows/collect-nhl-underdog-pilot.yml"),"utf8");
 assert.match(workflow,/if: github\.event_name == 'workflow_dispatch' && env\.ODDS_API_KEY != ''/);
 assert.ok(workflow.includes("Verify fail-closed quota and game mapping unit tests"));
 assert.ok(workflow.includes("push:"));
});
