"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {request}=require("../scripts/probe-oddspapi-prizepicks-nhl.cjs");
test("one bounded retry on provider 500; returns valid response",async()=>{
 const prev=global.fetch;let calls=0;
 global.fetch=async()=>{
  calls++;
  return calls===1?{ok:false,status:500,json:async()=>({error:{code:"INTERNAL_ERROR",message:"server"}})}:
   {ok:true,status:200,json:async()=>[{marketId:1}]};
 };
 try{const data=await request("secret-not-printed","markets",{}, {retryMs:0});
  assert.equal(calls,2);assert.equal(data.length,1);}
 finally{global.fetch=prev;}
});
test("never retries authorization failures or exhausted free quota",async()=>{
 const prev=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return {ok:false,status:403,json:async()=>({error:{code:"FORBIDDEN",message:"no access"}})};};
 try{await assert.rejects(request("key","fixtures",{}, {retryMs:0}),/HTTP 403/);assert.equal(calls,1);}
 finally{global.fetch=prev;}
});
test("never attempts a third request after repeated server failures",async()=>{
 const prev=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return {ok:false,status:500,json:async()=>({error:{code:"INTERNAL_ERROR",message:"temporary"}})};};
 try{await assert.rejects(request("key","fixtures",{}, {retryMs:0}),/HTTP 500/);assert.equal(calls,2);}
 finally{global.fetch=prev;}
});
