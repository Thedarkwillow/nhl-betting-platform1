"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fetchCompleteBoard,PAGE_LIMIT,MAX_PAGES}=require("../scripts/collect-prizepicks-free-api.cjs");
const at="2026-11-03T20:00:00Z",observed="2026-11-03T19:59:00Z";
const response=(rows,next_cursor,overrides={})=>({
 document:{
  data:Array.from({length:rows},(_,i)=>({id:"pp_"+i})),
  meta:{mode:"live",source_status:"fresh",observed_at:observed,next_cursor,...overrides}
 },
 usage:{unit:"credits",creditsCost:10,creditsRemaining:500}
});
test("larger than 3000 NHL offers traverse compact 1000-row pages with four calls",async()=>{
 let n=0;
 const cursors=[null,"pp_1","pp_2","pp_3"];
 const out=await fetchCompleteBoard("unit-secret",{at,fetchPage:async(key,options)=>{
  assert.equal(key,"unit-secret");
  assert.equal(options.view,"compact");
  assert.equal(options.limit,1000);
  assert.equal(options.withUsage,true);
  assert.equal(options.page,n+1);
  assert.equal(options.cursor,cursors[n]);
  n++;
  return response(n===4?500:1000,n===4?null:"pp_"+n);
 }});
 assert.equal(out.offers.length,3500);
 assert.equal(out.pagesFetched,4);
 assert.equal(out.completePagination,true);
 assert.equal(n,4);
});
test("quota caps at six pages and never marks unfinished board complete",async()=>{
 let n=0;
 await assert.rejects(fetchCompleteBoard("key",{at,fetchPage:async()=>{
  n++;return response(1000,"pp_"+n);
 }}),/Insufficient confirmed NHL API credits|exceeds 6000-offer/);
 assert.equal(n,MAX_PAGES);
 assert.equal(PAGE_LIMIT,1000);
});
test("source refresh during pagination aborts instead of mixing different board states",async()=>{
 let n=0;
 await assert.rejects(fetchCompleteBoard("key",{at,fetchPage:async()=>{
  n++;
  return response(1,n===1?"pp_1":null,
   n===2?{observed_at:"2026-11-03T19:59:04Z"}:{});
 }}),/refreshed/);
 assert.equal(n,2);
});
test("board pagination refresh returns safe aggregate diagnostic without exposing raw offers",async()=>{
 let n=0,caught;
 try{
  await fetchCompleteBoard("not-a-real-provider-token",{at,
   fetchPage:async()=>{n++;return response(1,n===1?"pp_1":null,
    n===2?{observed_at:"2026-11-03T19:59:05Z"}:{});}
  });
 }catch(e){caught=e;}
 assert.ok(caught);
 assert.equal(caught.captureDiagnostics.kind,"nhl_inconsistent_provider_board_pagination");
 assert.equal(caught.captureDiagnostics.failedPage,2);
 assert.equal(caught.captureDiagnostics.previousPages,1);
 assert.equal(caught.captureDiagnostics.chargedCreditsKnownToCollector,20);
 assert.equal(caught.captureDiagnostics.priorPageRows,1);
 assert.equal(JSON.stringify(caught.captureDiagnostics).includes("not-a-real-provider-token"),false);
 assert.equal(n,2);
});
test("repeated cursors and stale source reject with no retries",async()=>{
 let n=0;
 await assert.rejects(fetchCompleteBoard("key",{at,fetchPage:async()=>{
  n++;return response(1,"pp_same");
 }}),/repeated/);
 assert.equal(n,2);
 n=0;
 await assert.rejects(fetchCompleteBoard("key",{at,fetchPage:async()=>{
  n++;return response(1,null,{source_status:"stale"});
 }}),/live and fresh/);
 assert.equal(n,1);
});
test("key missing fails before calling provider",async()=>{
 let n=0;
 await assert.rejects(fetchCompleteBoard("",{at,fetchPage:async()=>{
  n++;return response(1,null);
 }}),/Missing PRIZEPICKSAPI_KEY/);
 assert.equal(n,0);
});

test("halt before spending the next page when provider monthly credits are low",async()=>{
 let calls=0;
 await assert.rejects(fetchCompleteBoard("key",{at,fetchPage:async()=>{
  calls++;
  return {document:response(1000,"pp_"+calls).document,
   usage:{unit:"credits",creditsCost:10,creditsRemaining:25}};
 }}),/Insufficient confirmed NHL API credits/);
 assert.equal(calls,1);
});
test("abort on missing credit headers before another page",async()=>{
 let calls=0;
 await assert.rejects(fetchCompleteBoard("key",{at,fetchPage:async()=>{
  calls++;return {document:response(1000,"pp_"+calls).document,
   usage:{unit:"credits",creditsCost:null,creditsRemaining:null}};
 }}),/Missing or invalid credit cost/);
 assert.equal(calls,1);
});
test("older request-metered accounts can use confirmed request remainder",async()=>{
 let calls=0;
 const result=await fetchCompleteBoard("key",{at,fetchPage:async()=>{
  calls++;
  return {document:response(10,calls===1?"pp_next":null).document,
   usage:{unit:"requests",requestsRemaining:25}};
 }});
 assert.equal(calls,2);
 assert.equal(result.quotaUnit,"requests");
 assert.equal(result.chargedCredits,0);
});

test("zero-credit coverage preflight verifies 60-credit ceiling plus 20-credit reserve",async()=>{
 const {preflightNhlQuota}=require("../scripts/collect-prizepicks-free-api.cjs");
 const getUsage=remaining=>async(url,options)=>{
  assert.equal(url,"https://prizepicksapi.com/api/v1/coverage");
  assert.equal(options.headers.Authorization,"Bearer test-key");
  assert.ok(options.headers["X-User-Request"].length>=3);
  return {ok:true,headers:{get:field=>({
   "x-usage-unit":"credits","x-credits-remaining":String(remaining),
   "x-credits-cost":"0","x-ratelimit-remaining":"300"
  })[field]||null}};
 };
 const ready=await preflightNhlQuota("test-key",{client:getUsage(100)});
 assert.equal(ready.creditsRemaining,100);
 await assert.rejects(preflightNhlQuota("test-key",{client:getUsage(79)}),/insufficient confirmed/);
 await assert.rejects(preflightNhlQuota("test-key",{client:async()=>({
  ok:true,headers:{get:()=>null}
 })}),/quota contract/);
});

test("quota preflight retries only free 503 and never a billed projection request",async()=>{
 const {preflightNhlQuota}=require("../scripts/collect-prizepicks-free-api.cjs");
 let calls=0,waits=0;
 const outcome=await preflightNhlQuota("test-key",{
  client:async()=>{
   calls++;
   if(calls<3)return {ok:false,status:503};
   return {ok:true,headers:{get:k=>({"x-usage-unit":"credits",
     "x-credits-remaining":"140","x-credits-cost":"0"})[k]||null}};
  },
  wait:async()=>{waits++;}
 });
 assert.equal(calls,3);assert.equal(waits,2);
 assert.equal(outcome.creditsRemaining,140);
 calls=0;
 await assert.rejects(preflightNhlQuota("test-key",{
  client:async()=>{calls++;return {ok:false,status:403};},
  wait:async()=>{throw Error("should not backoff");}
 }),/HTTP 403/);
 assert.equal(calls,1);
});

test("bounded daily pilot can proceed only on legacy requests above 100 remaining",async()=>{
 const {preflightNhlQuota}=require("../scripts/collect-prizepicks-free-api.cjs");
 const fake=(unit,remaining)=>async url=>{
  assert.equal(url,"https://prizepicksapi.com/api/v1/coverage",
   "daily gate never sends a metered projections request");
  return {ok:true,headers:{get:key=>({
   "x-usage-unit":unit,
   "x-ratelimit-remaining":unit==="requests"?String(remaining):"400",
   "x-credits-remaining":unit==="credits"?String(remaining):null,
   "x-credits-cost":"0"
  })[key]??null},json:async()=>({meta:{mode:"live"},data:[]})};
 };
 const ok=await preflightNhlQuota("test-secret",
  {client:fake("requests",150),legacyDailyOnly:true});
 assert.equal(ok.unit,"requests");assert.equal(ok.requestsRemaining,150);
 await assert.rejects(preflightNhlQuota("test-secret",
  {client:fake("requests",99),legacyDailyOnly:true}),/legacy request quota/);
 await assert.rejects(preflightNhlQuota("test-secret",
  {client:fake("credits",300),legacyDailyOnly:true}),/legacy request quota/);
});
