"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {makeNhlRequest,cleanProviderError,requestNhlPage,USER_CONTEXT}=
 require("../src/prizepicksapi-nhl-request.cjs");
test("minimal 25-row NHL query matches approved curl example without extra status filter",()=>{
 const {url,options}=makeNhlRequest("test-secret",{limit:25});
 assert.equal(url.toString(),"https://prizepicksapi.com/api/v1/projections?league=NHL&limit=25");
 assert.equal(options.method,"GET");
 assert.equal(options.headers.Authorization,"Bearer test-secret");
 assert.equal(options.headers["X-User-Request"],"Explore live props in the workspace");
 assert.equal(options.headers.Accept,"application/json");
 assert.equal(url.toString().includes("test-secret"),false);
});
test("full board retains 200 limit with exactly one safe continuation cursor",()=>{
 const first=makeNhlRequest("secret");
 assert.equal(first.url.searchParams.get("limit"),"200");
 assert.equal(first.url.searchParams.has("status"),false);
 const next=makeNhlRequest("secret",{cursor:"pp_16258896"});
 assert.equal(next.url.searchParams.get("cursor"),"pp_16258896");
 assert.equal([...next.url.searchParams.keys()].length,3);
 // The provider says cursors are opaque; URLSearchParams prevents a cursor
 // containing '&' from turning into an injected second query parameter.
 const encoded=makeNhlRequest("secret",{cursor:"opaque/+=&after=123"});
 assert.equal(encoded.url.searchParams.get("cursor"),"opaque/+=&after=123");
 assert.equal(encoded.url.searchParams.has("after"),false);
 assert.throws(()=>makeNhlRequest("secret",{cursor:"foo\nbar"}),/cursor/);
 assert.throws(()=>makeNhlRequest("secret",{cursor:""}),/cursor/);
 assert.throws(()=>makeNhlRequest("secret",{limit:201}),/limit/);
});
test("HTTP 400 logs safe machine code and page, not API key or untrusted message",async()=>{
 const err=cleanProviderError(400,{error:{code:"invalid_query",
  message:"secret-key in URL: https://bad.example/?apiKey=secret-key"}},
  {page:2,hasCursor:true});
 assert.match(err.message,/invalid_query/);
 assert.match(err.message,/page=2/);
 assert.match(err.message,/invalid_query_or_cursor/);
 assert.equal(err.message.includes("secret-key"),false);
 const fake=async()=>({ok:false,status:400,
  json:async()=>({error:{code:"invalid_query",message:"Bearer secret-key"}})});
 await assert.rejects(requestNhlPage("secret-key",{client:fake}),e=>
  e.message.includes("HTTP 400")&&!e.message.includes("secret-key"));
});
test("valid paginated JSON response delivered without duplicate retry",async()=>{
 let called=0;
 const fake=async(url,options)=>{
  called++;
  assert.equal(url.searchParams.get("league"),"NHL");
  assert.equal(options.headers["X-User-Request"],USER_CONTEXT);
  return {ok:true,json:async()=>({data:[{id:"p1"}],
   meta:{mode:"live",source_status:"fresh",next_cursor:null}})};
 };
 const result=await requestNhlPage("secret",{client:fake,limit:25});
 assert.equal(called,1);
 assert.equal(result.data.length,1);
});

test("missing mandatory task context is surfaced as a distinct, safe HTTP 400 diagnosis",()=>{
 const e=cleanProviderError(400,{error:{code:"TASK_CONTEXT_REQUIRED",message:"Private details"}})
 assert.match(e.message,/TASK_CONTEXT_REQUIRED/);
 assert.match(e.message,/task_context_required/);
 assert.equal(e.message.includes("Private details"),false);
});

test("documented compact NHL board allows 1000 rows without changing the 25-row probe",()=>{
 const compact=makeNhlRequest("secret",{view:"compact",limit:1000});
 assert.equal(compact.url.searchParams.get("view"),"compact");
 assert.equal(compact.url.searchParams.get("limit"),"1000");
 assert.equal(compact.url.searchParams.get("league"),"NHL");
 assert.equal([...compact.url.searchParams.keys()].length,3);
 assert.throws(()=>makeNhlRequest("secret",{limit:1000}),/limit/);
 assert.throws(()=>makeNhlRequest("secret",{view:"compact",limit:1001}),/limit/);
 assert.throws(()=>makeNhlRequest("secret",{view:"full",limit:200}),/view/);
});

test("credit and legacy request headers are read safely without exposing keys",async()=>{
 const {providerUsage}=require("../src/prizepicksapi-nhl-request.cjs");
 const h=new Map([["x-usage-unit","credits"],["x-credits-cost","10"],
  ["x-credits-remaining","71"],["x-ratelimit-remaining","999"]]);
 assert.deepEqual(providerUsage({get:k=>h.get(k)||null}),
  {unit:"credits",creditsRemaining:71,creditsCost:10,requestsRemaining:999});
 const fake=async()=>({ok:true,headers:{get:k=>h.get(k)||null},
  json:async()=>({data:[],meta:{next_cursor:null}})});
 const page=await requestNhlPage("test-secret",{view:"compact",limit:1000,
   client:fake,withUsage:true});
 assert.equal(page.usage.creditsCost,10);
 assert.equal(page.document.data.length,0);
 assert.equal(JSON.stringify(page).includes("test-secret"),false);
});
