"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fetchAsOfBoard,requestAsOfPage,PAGE_LIMIT}=require("../scripts/collect-prizepicks-asof-nhl.cjs");
const asOf="2026-11-06T23:46:00.000Z";
const full=(id)=>({id,observed_at:"2026-11-06T23:44:00.000Z"});
function page(data,next,metaAt="2026-11-06T23:44:00.000Z",cost=2){
 return {document:{data,meta:{mode:"live",source_status:"fresh",as_of:asOf,
  observed_at:metaAt,next_cursor:next}},
  usage:{unit:"credits",creditsCost:cost,creditsRemaining:200}};
}
test("as-of pagination pins one timestamp, even if live head advances",async()=>{
 let calls=0;
 const result=await fetchAsOfBoard("test-key",{at:asOf,clock:()=>Date.parse(asOf),fetchPage:async(key,request)=>{
  assert.equal(key,"test-key");assert.equal(request.asOf,asOf);
  assert.equal(request.limit,200);calls++;
  if(calls===1){assert.equal(request.cursor,null);return page([full("pp_a")],"pp_a");}
  assert.equal(request.cursor,"pp_a");
  // Meta latest collection advances, but /board?as_of is a stable replay.
  return page([full("pp_b")],null,"2026-11-06T23:45:00.000Z");
 }});
 assert.equal(calls,2);
 assert.equal(result.offers.length,2);
 assert.equal(result.asOf,asOf);
 assert.equal(result.completePagination,true);
});
test("historical point-in-time board URL holds as_of/cursor constant",async()=>{
 const urls=[];
 const result=await requestAsOfPage("test-key",{asOf,cursor:"pp_abc",page:2,
  client:async(url,options)=>{
   urls.push(url);
   assert.equal(options.headers.Authorization,"Bearer test-key");
   return {ok:true,json:async()=>page([full("pp_2")],null).document,
    headers:{get:k=>({"x-usage-unit":"credits","x-credits-cost":"2",
      "x-credits-remaining":"300"})[k]??null}};
  }});
 assert.equal(result.usage.creditsCost,2);
 assert.equal(urls[0].pathname,"/api/v1/board");
 assert.equal(urls[0].searchParams.get("as_of"),asOf);
 assert.equal(urls[0].searchParams.get("cursor"),"pp_abc");
 assert.equal(urls[0].searchParams.get("limit"),String(PAGE_LIMIT));
});
test("inconsistent row identity and board health reject archive",async()=>{
 await assert.rejects(fetchAsOfBoard("key",{at:asOf,clock:()=>Date.parse(asOf),fetchPage:async()=>{
  return page([full("pp_a"),full("pp_a")],null);
 }}),/Duplicate/);
 await assert.rejects(fetchAsOfBoard("key",{at:asOf,clock:()=>Date.parse(asOf),fetchPage:async()=>{
  return page([full("pp_a")],null,"2026-11-06T22:00:00.000Z");
 }}),/not fresh/);
});
test("unverified credits and truncated pagination never complete as-of capture",async()=>{
 await assert.rejects(fetchAsOfBoard("key",{at:asOf,clock:()=>Date.parse(asOf),maxPages:1,fetchPage:async()=>{
  return page([full("pp_a")],"pp_a");
 }}),/exceeds bounded/);
 await assert.rejects(fetchAsOfBoard("key",{at:asOf,clock:()=>Date.parse(asOf),fetchPage:async()=>{
  return page([full("pp_a")],null,asOf,10);
 }}),/Unverified board credits/);
});

test("bounded retry on HTTP 503 only, without copying any unstable page",async()=>{
 let attempts=0,waits=0;
 const out=await requestAsOfPage("test-key",{asOf,wait:async()=>{waits++;},
  client:async()=>{
   attempts++;
   if(attempts<3)return {ok:false,status:503,json:async()=>({error:{code:"service_unavailable"}})};
   return {ok:true,json:async()=>page([full("pp_a")],null).document,
    headers:{get:k=>({"x-usage-unit":"credits","x-credits-cost":"2",
      "x-credits-remaining":"300"})[k]??null}};
  }});
 assert.equal(attempts,3);assert.equal(waits,2);
 assert.equal(out.document.data.length,1);
 let badCalls=0;
 await assert.rejects(requestAsOfPage("test-key",{asOf,wait:async()=>{throw Error("must not retry");},
  client:async()=>{badCalls++;return {ok:false,status:400,json:async()=>({error:{code:"invalid_query"}})};}}),/HTTP 400/);
 assert.equal(badCalls,1);
});

test("live head refresh after immutable pin is not a future historical offer",async()=>{
 let calls=0,now=Date.parse(asOf);
 const r=await fetchAsOfBoard("key",{at:asOf,clock:()=>now,fetchPage:async()=>{
  calls++;
  if(calls===1)return page([full("pp_a")],"pp_a");
  now+=120000;
  return page([full("pp_b")],null,"2026-11-06T23:47:30.000Z");
 }});
 assert.equal(r.completePagination,true);
 assert.equal(r.offers.length,2);
});
test("wrong replay pin and plan truncation fail closed",async()=>{
 for(const bad of [{as_of:"2026-11-06T23:45:00Z"},{plan_limit:{omitted:1}}]){
  await assert.rejects(fetchAsOfBoard("key",{at:asOf,clock:()=>Date.parse(asOf),fetchPage:async()=>{
   const p=page([full("pp_a")],null);Object.assign(p.document.meta,bad);return p;
  }}),/pin mismatch or plan truncation/);
 }
});
test("future historical row remains rejected even with fresh rolling metadata",async()=>{
 await assert.rejects(fetchAsOfBoard("key",{at:asOf,clock:()=>Date.parse(asOf)+120000,fetchPage:async()=>{
  return page([{id:"pp_a",observed_at:"2026-11-06T23:47:30.000Z"}],null,"2026-11-06T23:47:30.000Z");
 }}),/future NHL offer/);
});
