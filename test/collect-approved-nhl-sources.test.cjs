"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fetchMoneyPuckOnceMore}=require("../scripts/collect-approved-nhl-sources.cjs");
const csv="https://moneypuck.com/moneypuck/playerData/seasonSummary/2026/regular/skaters.csv";
test("one transient MoneyPuck timeout retries once and succeeds",async()=>{
 let calls=0,waits=0;
 const value=await fetchMoneyPuckOnceMore(csv,{
  fetcher:async()=>{calls++;if(calls===1)throw Object.assign(new Error("timed out"),{name:"TimeoutError"});return {body:"ok"};},
  wait:async ms=>{assert.equal(ms,1500);waits++;}
 });
 assert.equal(value.body,"ok");assert.equal(calls,2);assert.equal(waits,1);
});
test("nontransient 403 is never retried",async()=>{
 let calls=0;
 await assert.rejects(fetchMoneyPuckOnceMore(csv,{
  fetcher:async()=>{calls++;throw Error("moneypuck.com HTTP 403");},wait:async()=>{throw Error("unexpected wait");}
 }),/HTTP 403/);
 assert.equal(calls,1);
});
test("second timeout fails and does not loop indefinitely",async()=>{
 let calls=0;
 await assert.rejects(fetchMoneyPuckOnceMore(csv,{
  fetcher:async()=>{calls++;throw Object.assign(new Error("timed out"),{name:"TimeoutError"});},
  wait:async()=>{}
 }),/timed out/);
 assert.equal(calls,2);
});

test("MoneyPuck timeout discards partial season summary but allows DFO path to continue",async()=>{
 const {collectMoneyPuckSeasons}=require("../scripts/collect-approved-nhl-sources.cjs");
 let calls=0;
 const x=await collectMoneyPuckSeasons({at:"2026-11-04T01:00:00Z",
  fetcher:async()=>{calls++;if(calls===2)throw Error("timeout");return {body:"csv",lastModified:null};},
  parser:(body,kind)=>({kind,matchedRows:1})
 });
 assert.equal(calls,2);
 assert.equal(x.complete,false);
 assert.deepEqual(x.data,{});
 assert.deepEqual(x.timestamps,{});
 assert.equal(x.errors[0].provider,"MoneyPuck");
});
test("MoneyPuck imports all three kinds only when every source validates",async()=>{
 const {collectMoneyPuckSeasons}=require("../scripts/collect-approved-nhl-sources.cjs");
 const x=await collectMoneyPuckSeasons({at:"2026-11-04T01:00:00Z",
  fetcher:async()=>({body:"ok",lastModified:null}),
  parser:(text,kind)=>({kind,matchedRows:2})
 });
 assert.equal(x.complete,true);
 assert.deepEqual(Object.keys(x.data),["skaters","goalies","teams"]);
 assert.equal(x.errors.length,0);
});
