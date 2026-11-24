"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalizePrizePicksOddsApiEvent}=
 require("../src/nhl-oddsapi-prizepicks-backup.cjs");
const {collect,MAX_CREDITS,RESERVE_CREDITS}=
 require("../scripts/collect-nhl-prizepicks-oddsapi-backup.cjs");
const now="2026-11-05T18:00:00Z",starts="2026-11-05T20:00:00Z";
const schedule={complete:true,games:[{id:2026020302,home:"BOS",away:"NYR",startTimeUTC:starts}]};
const projections={players:{
 "1":{playerId:1,name:"Example Skater",team:"BOS",type:"skater",
   projections:{shotsOnGoal:{ready:true,estimate:3,observations:8}}},
 "2":{playerId:2,name:"Example Goalie",team:"NYR",type:"goalie",
   projections:{saves:{ready:true,estimate:25,observations:9}}}}};
const event={id:"test-nhl-event",home_team:"Boston Bruins",away_team:"New York Rangers",
 commence_time:starts};
const market=(key,outcomes,last_update="2026-11-05T17:59:00Z")=>({key,last_update,outcomes});
const quotes={...event,bookmakers:[{key:"prizepicks",markets:[
 market("player_shots_on_goal",[
  {name:"Over",description:"Example Skater",point:2.5,price:-137},
  {name:"Under",description:"Example Skater",point:2.5,price:-137}
 ]),
 market("player_shots_on_goal_alternate",[
  {name:"Over",description:"Example Skater",point:3.5,price:100}
 ]),
 market("player_total_saves",[
  {name:"Over",description:"Example Goalie",point:23.5,price:-137}
 ])]}]};
test("NHL PrizePicks backup labels regular and alternate offers but never certifies Goblin or Demon tiers",()=>{
 const r=normalizePrizePicksOddsApiEvent(quotes,schedule,projections,now);
 assert.equal(r.rows.length,4);
 const standard=r.rows.find(x=>x.playerId===1&&x.tier==="Standard"&&x.side==="Higher");
 assert.equal(standard.gameId,2026020302);
 assert.equal(standard.matchup,"NYR");
 assert.equal(standard.line,2.5);
 assert.equal(standard.originalPrizePicksPlatformAuthenticated,false);
 assert.equal(standard.originalPrizePicksTierVerified,false);
 const alt=r.rows.find(x=>x.tier==="Unverified alternate");
 assert.equal(alt.side,"Higher");
 assert.equal(alt.alternateTierNeedsVerification,true);
 assert.equal(alt.originalPlatformPayoutVerified,false);
 assert.equal(r.rows.every(x=>x.sourceProvider==="The Odds API"),true);
});
test("stale markets and unavailable players fail closed instead of guessing identity",()=>{
 const a={...quotes,bookmakers:[{key:"prizepicks",markets:[
  market("player_shots_on_goal",[{name:"Over",description:"Someone Else",point:2.5}], "2026-11-05T17:59:00Z"),
  market("player_total_saves",[{name:"Over",description:"Example Goalie",point:28.5}],"2026-11-05T14:00:00Z")]}]};
 const r=normalizePrizePicksOddsApiEvent(a,schedule,projections,now);
 assert.equal(r.rows.length,0);
 assert.equal(r.issues.ambiguousPlayer,1);
 assert.equal(r.issues.staleMarket,1);
 const wrong={...quotes,home_team:"Toronto Maple Leafs"};
 assert.equal(normalizePrizePicksOddsApiEvent(wrong,schedule,projections,now).rows.length,0);
});
test("one-event backup uses no-paid quota and official fixture queries before bounded single event odds",async()=>{
 const paths=[],client=async url=>{
  const u=new URL(url);paths.push(u.pathname+u.search);
  const data=u.pathname.endsWith("/sports")?[]:
   u.pathname.endsWith("/events")?[event]:quotes;
  return {ok:true,status:200,json:async()=>data,
   headers:{get:key=>key==="x-requests-remaining"?"900":
    key==="x-requests-last"?"8":null}};
 };
 const r=await collect("fake-not-real-key",{now,schedule,projections,client,maxEvents:1});
 assert.equal(r.status,"partial_nhl_prizepicks_labelled_research");
 assert.equal(r.paidCalls,1);
 assert.equal(r.chargedCredits,8);
 assert.equal(r.rows.length,4);
 assert.equal(r.scopeComplete,true);
 assert.equal(r.fullLeagueCoverageVerified,false);
 assert.equal(paths.length,3);
 assert.match(paths[2],/bookmakers=prizepicks/);
 assert.match(paths[2],/regions=us_dfs/);
 assert.match(paths[2],/player_shots_on_goal_alternate/);
 assert.equal(MAX_CREDITS,16);
 assert.equal(RESERVE_CREDITS,350);
});
test("unknown or low quota skips all paid calls and cannot trigger retry",async()=>{
 const paths=[],client=async u=>{
  paths.push(new URL(u).pathname);
  return {ok:true,status:200,json:async()=>[],
   headers:{get:key=>key==="x-requests-remaining"?"300":null}};
 };
 const r=await collect("fake",{now,schedule,projections,client});
 assert.equal(r.status,"no_budget_verified");
 assert.equal(r.paidCalls,0);
 assert.deepEqual(paths,["/v4/sports"]);
});
test("provider returned excessive per-event charge stops before next event",async()=>{
 const client=async url=>{
  const u=new URL(url);return {ok:true,status:200,json:async()=>u.pathname.endsWith("/events")?
   [event]:u.pathname.endsWith("/sports")?[]:quotes,
   headers:{get:k=>k==="x-requests-remaining"?"900":
    k==="x-requests-last"?"25":null}};
 };
 await assert.rejects(collect("fake",{now,schedule,projections,client}),
  /Unexpected The Odds API PrizePicks per-event charge/);
});
