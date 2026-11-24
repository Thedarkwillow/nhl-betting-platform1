"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {probe,choose,extract}=require("../scripts/probe-the-odds-api-prizepicks-history.cjs");
test("selects actual future dated historical event",()=>{
 const sample={date:"2024-02-20T21:00:00Z",team:"Vancouver"};
 const events=[{id:"a".repeat(32),commence_time:"2024-02-21T00:00:00Z",home_team:"Boston Bruins",away_team:"New York Rangers"},
 {id:"b".repeat(32),commence_time:"2024-02-21T03:00:00Z",home_team:"Vancouver Canucks",away_team:"Dallas Stars"}];
 assert.equal(choose(events,sample).id,"b".repeat(32));
 assert.equal(choose(events,{...sample,date:"2024-02-22T00:00:00Z"}),null);
});
test("never infer Goblin Demon from Price +100 or alternate market",()=>{
 const doc={data:{bookmakers:[{key:"prizepicks",markets:[{key:"player_shots_on_goal_alternate",
 outcomes:[{name:"Over",description:"Player Name",point:3.5,price:100,multiplier:1.1}]}]}]}};
 const out=extract(doc);
 assert.equal(out.bookmakerPresent,true);
 assert.equal(out.sourceMultiplierCount,1);
 assert.equal(out.outcomeCount,1);
 assert.equal(out.datedOfferRecords.length,1);
 assert.equal(out.datedOfferRecords[0].originalTierVerified,false);
 assert.equal(out.datedOfferRecords[0].actualPrizePicksLineupPayoutVerified,false);
 assert.equal(out.examples[0].exactLineupPayoutVerified,false);
 assert.equal(out.examples[0].originalPrizePicksTierVerified,false);
});
test("no key does not call remote service",async()=>{
 const result=await probe(null,()=>{throw Error("invalid call")});
 assert.equal(result.status,"missing_ODDS_API_KEY");
 assert.equal(result.creditsSpentObserved,0);
});
test("reads free /sports quota only and halts safely with low balance",async()=>{
 let n=0;
 const fake=async()=>{n++;return{ok:true,status:200,headers:{get:k=>k==="x-requests-remaining"?"24":null},json:async()=>[]}};
 const result=await probe("test",fake);
 assert.equal(n,1);
 assert.equal(result.status,"insufficient_or_unknown_quota");
});
