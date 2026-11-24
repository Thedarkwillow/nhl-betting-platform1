"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {probe,choose,extract}=require("../scripts/probe-the-odds-api-prizepicks-2025-26.cjs");
test("selects only a future game in the 2025-26 sample window",()=>{
 const events=[{id:"a".repeat(32),commence_time:"2025-11-21T00:00:00Z",home_team:"Boston Bruins",away_team:"Toronto Maple Leafs"}];
 assert.equal(choose(events,{date:"2025-11-20T21:00:00Z",team:"Toronto"}).id,"a".repeat(32));
 assert.equal(choose(events,{date:"2025-11-22T21:00:00Z",team:"Toronto"}),null);
});
test("saves historical quote records without inventing original tiers or payouts",()=>{
 const x=extract({data:{bookmakers:[{key:"prizepicks",markets:[{key:"player_shots_on_goal_alternate",outcomes:[
 {description:"Example Skater",name:"Over",point:2.5,price:-137},
 {description:"Example Skater",name:"Over",point:4.5,price:100}
 ]}]}]}});
 assert.equal(x.datedOfferRecords.length,2);
 assert.ok(x.datedOfferRecords.every(x=>x.originalTierVerified===false&&x.actualPrizePicksLineupPayoutVerified===false&&x.reportedStandardGoblinDemonTier===null));
});
test("without configured key it uses zero paid credits",async()=>{
 const a=await probe(null,()=>{throw Error("Unwanted request");});
 assert.equal(a.status,"missing_ODDS_API_KEY");
 assert.equal(a.creditsSpentObserved,0);
});
test("low balance stops after free quota check",async()=>{
 let calls=0;
 const fake=async()=>{calls++;return {ok:true,status:200,headers:{get:k=>k==="x-requests-remaining"?"50":null},json:async()=>[]};};
 const result=await probe("fake",fake);
 assert.equal(calls,1);
 assert.equal(result.status,"insufficient_or_unknown_quota");
});
