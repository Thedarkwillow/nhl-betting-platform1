"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {collect}=require("../scripts/collect-underdog-oddsapi-nhl-sample.cjs");
const start="2026-11-04T01:00:00Z",now="2026-11-03T23:00:00Z";
const schedule={complete:true,games:[{id:2026020301,home:"BOS",away:"NYR",startTimeUTC:start}]};
const players={players:{"111":{playerId:111,name:"Example Skater",type:"skater",team:"BOS"}}};
const book={id:"ev1",home_team:"Boston Bruins",away_team:"New York Rangers",commence_time:start,
 bookmakers:[{key:"underdog",markets:[{key:"player_shots_on_goal",last_update:"2026-11-03T22:58:00Z",
 outcomes:[{name:"Over",description:"Example Skater",point:2.5,price:-110}]}]}]};
function fake(remaining=700){
 const paths=[],client=async url=>{
  const u=new URL(url);paths.push(u.pathname+u.search);
  const data=u.pathname.endsWith("/sports")?[]:
   u.pathname.endsWith("/events")?[book]:book;
  return {ok:true,status:200,json:async()=>data,headers:{
   get:x=>x==="x-requests-remaining"?String(remaining):x==="x-requests-last"?"2":null}};
 };
 return {paths,client};
}
test("Underdog one-event two-market sample never retries or targets any other bookmaker",async()=>{
 const f=fake(),result=await collect("secret-placeholder",{client:f.client,now,schedule,players});
 assert.equal(result.requestedPaidEvents,1);
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].market,"Shots On Goal");
 assert.equal(f.paths.length,3);
 assert.match(f.paths[2],/bookmakers=underdog/);
 assert.match(f.paths[2],/regions=us_dfs/);
 assert.match(f.paths[2],/player_total_saves/);
});
test("no quota metadata or low balance prevents paid event calls",async()=>{
 const f=fake(349),result=await collect("secret",{client:f.client,now,schedule,players});
 assert.equal(result.status,"quota_guard_blocked");
 assert.equal(result.requestedPaidEvents,0);
 assert.equal(f.paths.length,1);
});
test("no NHL games close to now means zero paid requests",async()=>{
 const f=fake(),out=await collect("secret",{client:f.client,
  now:"2026-11-06T23:00:00Z",schedule,players});
 assert.equal(out.requestedPaidEvents,0);
 assert.equal(f.paths.length,2);
});
