import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {pacificClock,chooseDispatch,dispatchTick,REPO,WORKFLOW} from "../src/index.mjs";
const token={GITHUB_DISPATCH_TOKEN:"fixture-do-not-log"};
const run=(at,{status="completed",conclusion="success",event="schedule"}={})=>({
 created_at:at,status,conclusion,event});
const client=(runs=[],calls=[],options={})=>async(url,init={})=>{
 calls.push({url,method:init.method||"GET",body:init.body||null});
 if(init.method==="POST")return {status:options.postStatus??204};
 return {ok:options.ok!==false,status:options.ok===false?503:200,
  json:async()=>({total_count:options.totalCount??runs.length,workflow_runs:runs})};
};
test("Cloudflare existing Worker cron covers Pacific DST/PST 6AM and 9AM while staying off peak",()=>{
 const config=JSON.parse(fs.readFileSync(new URL("../wrangler.jsonc",import.meta.url),"utf8"));
 assert.equal(config.name,"nhl-board-dispatcher");
 assert.deepEqual(config.triggers.crons,["5,15,25,35,45 13,14,16,17 * * *"]);
 assert.equal(pacificClock("2026-07-08T13:05:00Z").slot,"06:00");
 assert.equal(pacificClock("2026-07-08T16:05:00Z").slot,"09:00");
 assert.equal(pacificClock("2026-11-11T14:05:00Z").slot,"06:00");
 assert.equal(pacificClock("2026-11-11T17:05:00Z").slot,"09:00");
 assert.equal(pacificClock("2026-11-11T13:05:00Z").slot,null);
 assert.equal(pacificClock("2026-11-11T18:05:00Z").slot,null);
 assert.equal(REPO,"Thedarkwillow/nhl-betting-platform1");
 assert.equal(WORKFLOW,"public-private-nhl-nfl-0900.yml");
});
test("external 6AM POST always targets PUBLIC workflow with real-mode 06, never provider",async()=>{
 const calls=[],d=await dispatchTick({env:token,now:new Date("2026-11-11T14:05:00Z"),
  client:client([],calls)});
 assert.equal(d.decision,"dispatched");
 assert.equal(d.slot,"06:00");
 assert.equal(d.providerRequests,0);
 assert.equal(calls.length,2);
 assert.match(calls[0].url,/Thedarkwillow\/nhl-betting-platform1\/actions\/workflows\/public-private-nhl-nfl-0900\.yml\/runs/);
 assert.equal(calls[1].method,"POST");
 assert.deepEqual(JSON.parse(calls[1].body),{ref:"main",inputs:{mode:"capture_0600"}});
 assert.doesNotMatch(JSON.stringify(d),/fixture-do-not-log/);
});
test("9AM private-minute-exhausted workflows are never triggered",async()=>{
 const calls=[],d=await dispatchTick({env:token,now:"2026-11-11T17:05:00Z",
  client:client([],calls)});
 assert.equal(d.slot,"09:00");
 assert.deepEqual(JSON.parse(calls[1].body).inputs,{mode:"capture_0900"});
 assert.doesNotMatch(calls[1].url,/nhl-bounded-daily-pregame-freeze/);
});
test("skip duplicate still active capture, but an older stalled native queued schedule will NOT block independent dispatch",()=>{
 const opts={at:"2026-11-11T14:15:00Z",slot:"06:00",day:"2026-11-11"};
 assert.equal(chooseDispatch([run("2026-11-11T14:12:00Z",{status:"queued"})],opts).decision,"active_recent_dispatch");
 assert.equal(chooseDispatch([run("2026-11-11T14:05:00Z",{status:"queued"})],opts).decision,"dispatch");
 assert.equal(chooseDispatch([run("2026-11-11T14:05:00Z",{status:"in_progress"})],opts).decision,"already_capturing");
 assert.equal(chooseDispatch([run("2026-11-11T14:05:00Z",{status:"queued",event:"workflow_dispatch"})],opts).decision,"active_recent_dispatch");
});
test("green workflow is not verified app/source capture: bounded independent retry plus cooldown",()=>{
 const opts={at:"2026-11-11T14:35:00Z",slot:"06:00",day:"2026-11-11"};
 assert.equal(chooseDispatch([run("2026-11-11T14:05:00Z",{status:"completed",conclusion:"success",event:"workflow_dispatch"})],opts).decision,"dispatch");
 assert.equal(chooseDispatch([run("2026-11-11T14:30:00Z",{event:"workflow_dispatch"})],opts).decision,"retry_cooldown");
 const four=Array.from({length:4},(_,i)=>run("2026-11-11T14:"+String(i*10+5).padStart(2,"0")+":00Z",
   {event:"workflow_dispatch",conclusion:"failure"}));
 assert.equal(chooseDispatch(four,opts).decision,"bounded_attempt_limit");
});
test("Cloudflare outside actual 6/9 Pacific never accesses GitHub or provider",async()=>{
 const calls=[],d=await dispatchTick({env:token,now:"2026-11-11T22:05:00Z",
 client:client([],calls)});
 assert.equal(d.decision,"outside_original_morning_hour");
 assert.equal(calls.length,0);
});
test("missing Cloudflare secret, API failure, truncated run pagination, and 403 POST fail closed",async()=>{
 const at="2026-11-11T14:05:00Z";
 await assert.rejects(()=>dispatchTick({env:{},now:at,client:client()}),/not configured/);
 await assert.rejects(()=>dispatchTick({env:token,now:at,client:client([],[],{ok:false})}),/HTTP 503/);
 await assert.rejects(()=>dispatchTick({env:token,now:at,client:client([],[],{totalCount:101})}),/truncated/);
 await assert.rejects(()=>dispatchTick({env:token,now:at,client:client([],[],{postStatus:403})}),/HTTP 403/);
});
