"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseCsv,parseMoneyPuckSeason,extractNextData,normalizeFaceoffGoalies,normalizeFaceoffLines}=
 require("../src/nhl-approved-source-adapters.cjs");
const at="2026-11-02T20:00:00Z",start="2026-11-03T02:00:00Z";
const headers=["playerId","season","name","team","position","situation","games_played","icetime",
 "I_F_xGoals","I_F_xOnGoal","I_F_shotsOnGoal","I_F_shotAttempts","I_F_highDangerShots",
 ...Array.from({length:8},(_,i)=>"extra"+i)].join(",");
const one="123,2026,\"Example, Player\",BOS,C,all,12,12000,4,33,29,60,8,"+Array(8).fill(0).join(",");
const two="123,2026,\"Example, Player\",BOS,C,5on5,12,9900,3,25,20,50,6,"+Array(8).fill(0).join(",");
const csv=headers+"\n"+one+"\n"+two+"\n";
const roster={BOS:{forwards:[{id:123,firstName:{default:"Example"},lastName:{default:"Player"}}],
 goalies:[{id:44,firstName:{default:"Saved"},lastName:{default:"Goalie"}}],defensemen:[]},
 NYR:{forwards:[],goalies:[{id:55,firstName:{default:"Other"},lastName:{default:"Goalie"}}],defensemen:[]}};
const schedule={games:[{id:2026020100,home:"BOS",away:"NYR",startTimeUTC:start}]};
test("CSV quoted comma parser and MoneyPuck all situation only",()=>{
 assert.equal(parseCsv(csv).rows.length,2);
 const r=parseMoneyPuckSeason(csv,"skaters",at);
 assert.equal(r.matchedRows,1);
 assert.equal(r.rows["123"].xGoalsPer60,1.2);
 assert.equal(r.rows["123"].xOnGoalPer60,9.9);
 assert.equal(r.rows["123"].gamesPlayed,12);
 assert.equal(r.notHistoricalPregameForEarlierGames,true);
});
test("bad quotes and duplicate player IDs are refused",()=>{
 assert.throws(()=>parseCsv(headers+"\n\"bad"),/Unterminated/);
 assert.throws(()=>parseMoneyPuckSeason(headers+"\n"+one+"\n"+one+"\n","skaters",at),/Conflicting/);
});
test("Daily Faceoff structured HTML extraction uses NextData",()=>{
 const html="x".repeat(1100)+'<script id="__NEXT_DATA__" type="application/json">'+
  JSON.stringify({props:{pageProps:{date:"2026-11-02",data:[]}}})+"</script>";
 assert.equal(extractNextData(html).date,"2026-11-02");
 assert.throws(()=>extractNextData("x".repeat(1100)),/Missing/);
});
test("Daily Faceoff goalies match official NHL game/team/roster; dated source is secondary",()=>{
 const source={data:[{homeTeamAbbreviation:"BOS",awayTeamAbbreviation:"NYR",dateGmt:start,
  homeGoalieName:"Saved Goalie",homeNewsStrengthName:"Confirmed",homeNewsCreatedAt:at,
  homeNewsSourceName:"Beat reporter",homeNewsSourceUrl:"https://example.org/source",
  awayGoalieName:"Other Goalie",awayNewsStrengthName:"Unconfirmed"}]};
 const r=normalizeFaceoffGoalies(source,roster,schedule,at);
 assert.equal(r.games.length,1);assert.equal(r.reportedConfirmed,1);
 assert.equal(r.games[0].goalies[0].status,"reported_confirmed");
 assert.equal(r.games[0].goalies[1].status,"unconfirmed");
 assert.equal(r.originalClubStarterVerified,false);
 const swapped={data:[{...source.data[0],homeTeamAbbreviation:"NYR",awayTeamAbbreviation:"BOS"}]};
 assert.equal(normalizeFaceoffGoalies(swapped,roster,schedule,at).games.length,0);
 const contaminated={data:[{...source.data[0],homeNewsCreatedAt:"2026-11-04T00:00:00Z"}]};
 assert.equal(normalizeFaceoffGoalies(contaminated,roster,schedule,at).reportedConfirmed,0);
});
test("Daily Faceoff assignments are projected, source-aged, NHL player matched",()=>{
 const row={combinations:{teamAbbreviation:"BOS",updatedAt:"2026-11-02T18:30:00Z",sourceName:"Reporter",
  players:[{name:"Example Player",groupIdentifier:"f1",groupName:"First line",
   categoryIdentifier:"F",categoryName:"Forwards",injuryStatus:"",gameTimeDecision:false},
   {name:"Unknown Person",groupIdentifier:"p1"}]}};
 const r=normalizeFaceoffLines(row,roster,at);
 assert.equal(r.players.length,1);assert.equal(r.players[0].playerId,123);
 assert.equal(r.players[0].projectedOnly,true);assert.equal(r.unmatchedPlayers,1);
 assert.equal(r.clubLineupsConfirmed,false);
 const mixed={combinations:{...row.combinations,players:[
  row.combinations.players[0],
  {...row.combinations.players[0],categoryIdentifier:"PP",categoryName:"Power Play",
   groupIdentifier:"PP1",groupName:"First Power Play"}]}};
 const two=normalizeFaceoffLines(mixed,roster,at);
 assert.equal(two.players.length,1);
 assert.equal(two.players[0].roles.length,2);
 const conflict={combinations:{...row.combinations,players:[
  row.combinations.players[0],{...row.combinations.players[0],groupIdentifier:"f2",groupName:"Second Line"}]}};
 const bad=normalizeFaceoffLines(conflict,roster,at);
 assert.equal(bad.players.length,0);
 assert.equal(bad.ambiguousRolePlayers,1);
 assert.throws(()=>normalizeFaceoffLines({combinations:{...row.combinations,updatedAt:"2026-10-01T00:00:00Z"}},roster,at),/stale/);
});
