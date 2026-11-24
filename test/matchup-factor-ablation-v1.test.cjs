"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),a=require("../src/matchup-factor-ablation-v1.cjs"),{kickoff}=require("../scripts/collect-nfl-nws-weather.cjs");
test("workload uses past observed opportunities and separates volume from conversion",()=>{
 const h=Array.from({length:10},(_,i)=>({value:i<5?4:8,opportunity:i<5?2:4}));
 const v=a.nflOpportunity(h,5);assert.equal(v.expectedOpportunities,3.65);assert.equal(v.projection,7.3);assert.equal(v.liveRoleVerified,false);
 assert.equal(a.nflOpportunity(h.slice(0,4),5),null);
});
test("independent factor training does not require H2H and cannot see holdout",()=>{
 const s=a.create();for(let i=0;i<100;i++)a.observe(s,{base:2,actual:4,gameId:i,train:true,candidates:{workload:4,headToHead:null}});
 a.observe(s,{base:2,actual:0,gameId:101,train:false,candidates:{workload:4,headToHead:null},lines:[1.5]});
 const r=a.summarize(s);assert.equal(r.workload.weight,1);assert.equal(r.workload.holdoutAppearances,1);assert.equal(r.headToHead,undefined);
 assert.throws(()=>a.observe(s,{base:2,actual:4,gameId:102,train:true,candidates:{workload:4}}),/Training after holdout/);
});
test("weather collector converts Eastern kickoff to an unambiguous UTC instant",()=>{
 assert.equal(kickoff({gameday:"2026-11-27",gametime:"15:00"}),"2026-11-27T20:00:00.000Z");
 assert.equal(kickoff({gameday:"2026-09-13",gametime:"13:00"}),"2026-09-13T17:00:00.000Z");
 assert.equal(kickoff({gameday:"2026-11-01",gametime:"01:30"}),null);
});
