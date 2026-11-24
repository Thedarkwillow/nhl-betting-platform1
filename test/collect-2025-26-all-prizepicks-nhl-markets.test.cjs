"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {BASE_MARKETS,SCORER_MARKETS,ALL_MARKETS,discoverMarkets,normalizeQuotes,
 buildMatches,snapshotValid,request}=require("../scripts/collect-2025-26-all-prizepicks-nhl-markets.cjs");
const seed={id:"a".repeat(32)+"_20251021210000",eventId:"a".repeat(32),
 requestedAt:"2025-10-21T21:00:00Z",startAt:"2025-10-21T23:10:00Z",
 alternateObservedAt:"2025-10-21T20:55:39Z",altOffers:[]};
function q(market,player,side,point,price){return {market,player,side,point,
 indicativePrice:price,sourceSnapshotAt:seed.alternateObservedAt}}
test("all 9 NHL Standard/alternate pairs, including saves, and three scorer categories",()=>{
 assert.equal(BASE_MARKETS.length,9);
 assert.equal(SCORER_MARKETS.length,3);
 assert.equal(ALL_MARKETS.length,21);
 assert.ok(ALL_MARKETS.includes("player_total_saves"));
 assert.ok(ALL_MARKETS.includes("player_total_saves_alternate"));
 assert.ok(!ALL_MARKETS.includes("player_hits"));
 assert.ok(!ALL_MARKETS.includes("player_hits_alternate"));
});
test("historical market discovery ignores unsupported unverified hits",()=>{
 const x=discoverMarkets({data:{bookmakers:[{key:"prizepicks",markets:[
 {key:"player_total_saves"},{key:"player_total_saves_alternate"},{key:"player_hits"}
 ]},{key:"fanduel",markets:[{key:"player_points"}]}]}});
 assert.equal(x.bookmakerPresent,true);
 assert.deepEqual(x.keys,["player_total_saves","player_total_saves_alternate"]);
});
test("parse goalie market safely without fabricating missing multipliers",()=>{
 const x=normalizeQuotes({data:{bookmakers:[{key:"prizepicks",markets:[
 {key:"player_total_saves",outcomes:[
 {name:"Over",description:"Example Goalie",point:24.5,price:100},
 {name:"Under",description:"Example Goalie",point:24.5,price:100}]}]}]}},
 ["player_total_saves"],seed.alternateObservedAt);
 assert.equal(x.length,2);
 assert.equal(x[0].originalPrizePicksTierVerified,false);
 assert.equal(x[0].originalPrizePicksPayoutVerified,false);
});
test("matches goalie saves by event, player, market, side, and date",()=>{
 const e={quotes:[
 q("player_total_saves","Example Goalie","Over",24.5,100),
 q("player_total_saves_alternate","Example Goalie","Over",28.5,100),
 q("player_total_saves_alternate","Example Goalie","Over",19.5,-137),
 q("player_total_saves_alternate","Different Goalie","Over",20.5,-137),
 q("player_assists","Example Skater","Over",0.5,100),
 q("player_assists_alternate","Example Skater","Over",1.5,100),
 q("player_goal_scorer_anytime","Example Skater","Yes",null,120)
 ]};
 const out=buildMatches(seed,e);
 assert.equal(out.pairs.length,3);
 assert.deepEqual(out.pairs.filter(x=>x.market==="player_total_saves").map(x=>x.providerIndicatedTier),["Demon","Goblin"]);
 assert.equal(out.pairs.find(x=>x.market==="player_assists").providerIndicatedTier,"Demon");
 assert.equal(out.unmatched.length,1);
 assert.equal(out.standalone.length,1);
 assert.ok(out.pairs.every(x=>x.originalPrizePicksTierVerified===false&&x.actualPayoutVerified===false));
});
test("does not match ambiguous Standard lines or derive same-line Demon from +100",()=>{
 const e={quotes:[
 q("player_points","P Player","Over",0.5,100),
 q("player_points","P Player","Over",1.5,100),
 q("player_points_alternate","P Player","Over",2.5,100),
 q("player_assists","A Player","Over",1.5,100),
 q("player_assists_alternate","A Player","Over",1.5,100)
 ]};
 const out=buildMatches(seed,e);
 assert.equal(out.unmatched[0].reason,"ambiguous_standard_market");
 assert.equal(out.pairs[0].relativeToStandard,"same");
 assert.equal(out.pairs[0].providerIndicatedTier,null);
});
test("never join postgame or non-contemporaneous archived odds",()=>{
 assert.equal(snapshotValid("2025-10-22T00:00:00Z",seed),false);
 assert.equal(snapshotValid("2025-10-21T20:40:39Z",seed),false);
 assert.equal(snapshotValid("2025-10-21T20:55:39Z",seed),true);
});
test("requests preserve v4 base and do not expose secret into logs",async()=>{
 let url;
 const fake=async u=>{url=u;return {ok:true,status:200,headers:{
 get:k=>k==="x-requests-remaining"?"20000":k==="x-requests-last"?"0":null
 },json:async()=>[]}};
 const x=await request("/sports","mockkey",fake);
 assert.equal(x.ok,true);
 assert.equal(url.pathname,"/v4/sports");
 assert.equal(url.searchParams.get("apiKey"),"mockkey");
});
