"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {dateRange,eventsFromResponse,extractOffers,backfill,baseProgress,request}=
 require("../scripts/backfill-2025-26-fall-prizepicks-odds-api.cjs");
test("dates cover October-December 2025 without older seasons",()=>{
 assert.deepEqual(dateRange("2025-10-07","2025-10-09"),["2025-10-07","2025-10-08","2025-10-09"]);
});
test("archive only future events in window, dedupe IDs",()=>{
 const e={id:"a".repeat(32),commence_time:"2025-10-08T00:00:00Z",
  home_team:"Florida Panthers",away_team:"Chicago Blackhawks"};
 const events=eventsFromResponse([e,e,{...e,id:"b".repeat(32),commence_time:"2025-10-07T20:00:00Z"}],"2025-10-07");
 assert.equal(events.length,1);assert.equal(events[0].status,"pending");
});
test("source-labelled historical lines never invent tiers and original payouts",()=>{
 const e=extractOffers({timestamp:"2025-10-07T20:55:39Z",
  data:{bookmakers:[{key:"prizepicks",markets:[{key:"player_shots_on_goal_alternate",
   outcomes:[{description:"Example Skater",name:"Over",point:1.5,price:-137,multiplier:1.23},
   {description:"Example Skater",name:"Over",point:3.5,price:100}]}]}]}},
  {startAt:"2025-10-08T00:00:00Z"});
 assert.equal(e.quotes.length,2);
 assert.ok(e.quotes.every(x=>x.originalPrizePicksTier===null));
 assert.ok(e.quotes.every(x=>x.originalPayoutMultiplierVerified===false));
 assert.ok(e.quotes.every(x=>x.verifiedPregameProviderQuote===true));
 assert.equal(e.quotes[0].sourceProvidedMultiplier,1.23);
});
test("no API key makes zero requests and preserves archived credit totals",async()=>{
 const fs=require("node:fs"),path=require("node:path");
 const progressPath=path.resolve(__dirname,"../outputs/the-odds-api/nhl/2025-26-fall-backfill/progress.json");
 const before=fs.existsSync(progressPath)?JSON.parse(fs.readFileSync(progressPath,"utf8")).creditsSpentTotal:0;
 let calls=0;
 const a=await backfill(null,()=>{calls++;throw Error("No API call expected");});
 // A fully spent archived historical budget can supersede the no-key
 // status when summarize() recounts stored spending. Neither state permits
 // an API call, and neither may modify the historical credit ledger.
 assert.ok(["missing_ODDS_API_KEY","budget_exhausted"].includes(a.status));
 assert.equal(calls,0);
 // Historical paid credits stay in the ledger after subsequent no-key runs.
 assert.equal(a.creditsSpentTotal,before);
});
test("credit caps are conservative",()=>{
 const a=baseProgress();
 assert.equal(a.perRunCreditCap,160);
 assert.equal(a.totalCreditCap,1000);
 assert.equal(a.originalGoblinDemonTiersVerified,false);
});

test("historical requests use the v4 path, not the provider root",async()=>{
 let requested=null;
 const fake=async url=>{requested=url;return {ok:true,status:200,
  headers:{get:k=>k==="x-requests-remaining"?"20000":null},json:async()=>[]};};
 const response=await request("/sports","test-key",fake);
 assert.equal(response.ok,true);
 assert.equal(requested.pathname,"/v4/sports");
 assert.equal(requested.searchParams.get("apiKey"),"test-key");
});
