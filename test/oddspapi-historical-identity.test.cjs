"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parsePlayers,marketField,findOfficialGame,auditHistoricalArchive}=require("../src/oddspapi-historical-identity.cjs");
test("player API map and array parse with strict IDs",()=>{
 assert.equal(parsePlayers({"12":"Doe, Jane"}).names["12"],"Doe, Jane");
 assert.equal(parsePlayers([{playerId:13,playerName:"Jane Doe"}]).names["13"],"Jane Doe");
 assert.equal(parsePlayers({players:{"4":{name:"A. Smith"}}}).names["4"],"A. Smith");
});
test("team-scoped OddsPapi roster resolves player identities without confusing team ids",()=>{
 const raw={participants:{"3675":{players:{"1650129":{playerName:"Doe, Jane"},"1088330":"John Smith"}},
 "3676":{players:[{playerId:30587,playerName:"R. Another"}]}}};
 const parsed=parsePlayers(raw);
 assert.equal(parsed.names["1650129"],"Doe, Jane");
 assert.equal(parsed.names["30587"],"R. Another");
 assert.equal(parsed.names["3675"],undefined);
});
test("full-game market names only and exact official NHL game identity",()=>{
 assert.equal(marketField("Over Under Player Shots On Goal (incl. overtime)"),"shotsOnGoal");
 assert.equal(marketField("Over Under Player Points Third Period"),null);
 const g={id:2025020001,away:"NJD",home:"SEA",startTimeUTC:"2026-01-15T00:00:00Z"};
 assert.equal(findOfficialGame({teams:["New Jersey Devils","Seattle Kraken"],eventStartsAt:g.startTimeUTC},[g]).id,g.id);
 assert.equal(findOfficialGame({teams:["New Jersey Devils","Seattle Kraken"],eventStartsAt:"2026-01-15T01:00:00Z"},[g]),null);
});
test("grades actual archived line without making up picks or tiers",()=>{
 const fixture={season:"2025-26",fixtureId:"a",teams:["New Jersey Devils","Seattle Kraken"],
  eventStartsAt:"2026-01-15T00:00:00Z",rows:[{sourceIsPrizePicks:true,tier:"unverified",line:2.5,
  activeAtLastObservation:true,lastObservedAt:"2026-01-14T23:00:00Z",firstObservedAt:"2026-01-14T12:00:00Z",
  stat:"Over Under Player Shots On Goal (incl. overtime)",playerId:"77"}]};
 const games=[{id:2025020100,away:"NJD",home:"SEA",startTimeUTC:fixture.eventStartsAt}];
 const history={players:{"100":{playerId:100,name:"Jane Doe",type:"skater",
  games:[{gameId:2025020100,gameDate:"2026-01-14",team:"NJD",shotsOnGoal:4}]}}};
 const r=auditHistoricalArchive({samples:[fixture]},{"77":"Doe, Jane"},history,games);
 assert.equal(r.matchedLines,1);assert.equal(r.lines[0].outcome,"Higher");
 assert.equal(r.lines[0].modelChosenSide,null);assert.equal(r.lines[0].tier,"unverified");
 assert.equal(r.bySeason["2025-26"].hitRate,null);
 const bad=auditHistoricalArchive({samples:[fixture]},{},history,games);
 assert.equal(bad.matchedLines,0);assert.equal(bad.issues.unresolved_provider_player_id,1);
});

test("never selects a favorable line from simultaneous unclassified alternate lines",()=>{
 const fixture={season:"2025-26",fixtureId:"a",teams:["New Jersey Devils","Seattle Kraken"],
 eventStartsAt:"2026-01-15T00:00:00Z",rows:[1.5,2.5].map(line=>({
 sourceIsPrizePicks:true,tier:"unverified",line,activeAtLastObservation:true,
 lastObservedAt:"2026-01-14T23:00:00Z",firstObservedAt:"2026-01-14T12:00:00Z",
 stat:"Over Under Player Shots On Goal (incl. overtime)",playerId:"77"}))};
 const games=[{id:2025020100,away:"NJD",home:"SEA",startTimeUTC:fixture.eventStartsAt}];
 const history={players:{"100":{playerId:100,name:"Jane Doe",type:"skater",
 games:[{gameId:2025020100,gameDate:"2026-01-14",team:"NJD",shotsOnGoal:4}]}}};
 const r=auditHistoricalArchive({samples:[fixture]},{"77":"Doe, Jane"},history,games);
 assert.equal(r.matchedLines,0);
 assert.equal(r.issues.ambiguous_simultaneous_line_variants,2);
});
