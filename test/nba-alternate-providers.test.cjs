"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalizeGames,requestHistory,normalizeHistory,bdlSchedule,dunkHistoryEstimate,dunkHistory,main}=require("../scripts/collect-nba-alternate-providers.cjs");
const at="2026-11-24T18:30:00Z",date="2026-11-24";
const g={id:15907925,date,datetime:"2026-11-25T00:00:00Z",status_state:"scheduled",home_team:{id:4,abbreviation:"ORL"},visitor_team:{id:6,abbreviation:"DET"}};
const q=requestHistory({playerId:"3112335",market:"player_points",from:"2026-11-01",to:"2026-11-23"});
const raw={data:{player_id:"3112335",player_name:"Example Player",market:"player_points",count:1,games:[{game_id:"401544336",game_date:"2026-11-10",line:25.5,open_line:26.5,over_odds:-125,under_odds:-104,books:6,actual:30,result:"over"}]}};
test("free BDL schedule keeps provider IDs and refuses incomplete pagination",()=>{
 const d=normalizeGames({data:[g],meta:{}},date,at);assert.equal(d.rows[0].gameIdNamespace,"balldontlie:nba");assert.equal(d.rows[0].providerGameId,"15907925");assert.equal(d.officialNBAIdentityCrosswalkVerified,false);
 assert.throws(()=>normalizeGames({data:[g],meta:{next_cursor:2}},date,at));
 assert.throws(()=>normalizeGames({data:[g,g],meta:{}},date,at));
});
test("historical DunkAPI result and namespace must reconcile; no fake platform offers",()=>{
 const d=normalizeHistory(raw,q,at);assert.equal(d.rows[0].actual,30);assert.equal(d.rows[0].gameIdNamespace,"dunkapi:nba");assert.equal(d.originalPrizePicksOfferVerified,false);
 assert.throws(()=>normalizeHistory({...raw,data:{...raw.data,games:[{...raw.data.games[0],result:"under"}]}},q,at));
 assert.throws(()=>requestHistory({playerId:"3112335",market:"player_points",from:"2026-01-01",to:"2026-11-01"}));
});
test("estimate-only response must explicitly identify a noncharging price",async()=>{
 const x=await dunkHistoryEstimate("test",q,async(u,o)=>{assert.equal(JSON.parse(o.body).estimate_only,true);assert.equal(o.redirect,"error");return {ok:true,json:async()=>({data:{tool:"get_prop_history",estimate_only:true,credits:10}})};});
 assert.deepEqual(x,{credits:10,estimateOnly:true});
 await assert.rejects(dunkHistoryEstimate("test",q,async()=>({ok:true,json:async()=>raw})));
});
test("no metered request without bounded verified reservation",async()=>{
 const client=()=>{throw Error("unexpected call");};
 await assert.rejects(dunkHistory("test",q,{estimate:{estimateOnly:true,credits:10},client}),/no verified bounded reservation/);
 await assert.rejects(dunkHistory("test",q,{estimate:{estimateOnly:true,credits:11},reservation:{committed:true,maxCredits:10,request:q},client}),/no verified bounded reservation/);
});
test("missing credentials fail closed without source activity",async()=>{
 const a=await main({NBA_BDL_FREE_SOURCE_ENABLED:"1",NBA_DUNK_ESTIMATE_ENABLED:"1",SPORTSGAMEODDS_API_KEY:"unrelated"});
 assert.equal(a.bdl,"missing_key_or_disabled");assert.equal(a.dunkAPI,"missing_key_or_disabled");assert.equal(a.dunkChargedRequests,0);
});
