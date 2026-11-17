"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {model,historyChart}=require("../assets/roadmap-evidence-desk.js");
test("freshness and status evidence must not confuse an expired capture or malformed tier",()=>{
 const now=Date.parse("2026-11-14T23:00:00Z");
 const d={kind:"public_nfl_derived_research_cards_v1",tier:"Standard",status:"fresh_derived_research_only",asOf:"2026-11-14T22:40:00Z",cards:[{}]};
 const r=model({standard:d,goblin:{...d,tier:"Standard"},demon:{...d,tier:"Demon",asOf:"2026-11-14T22:20:00Z"}},now);
 assert.equal(r.rows.find(x=>x.label==="NFL Standard").value,"1 fresh-source research cards");
 assert.equal(r.rows.find(x=>x.label==="NFL Goblin").value,"No fresh approved cards");
 assert.equal(r.rows.find(x=>x.label==="NFL Demon").value,"No fresh approved cards");
 assert.equal(r.quotaRemaining,null);
});
test("historical chart excludes future and duplicate days",()=>{
 const a=[{date:"2026-11-13",value:3},{date:"2026-11-14",value:4},{date:"2026-11-12",value:0}];
 assert.deepEqual(historyChart(a,"2026-11-14T20:00:00Z"),[a[2],a[0]]);
 assert.deepEqual(historyChart([...a,a[0]],"2026-11-14T20:00:00Z"),[]);
});

test("Underdog status is historical aggregate only and fails closed on raw rows",()=>{const now=Date.parse("2026-11-17T01:05:00Z"),platformStatus={kind:"public_platform_integration_status_v1",checkedAt:"2026-11-17T01:02:03Z",rawRowsPublished:0,underdog:{NHL:{connected:true,sampleRows:5,eligibleRows:0,completeBoardVerified:false,originalPlatformVerified:false}}};assert.match(model({platformStatus},now).rows.find(x=>x.label==="Underdog NHL integration").value,/no eligible sample/);assert.equal(model({platformStatus:{...platformStatus,rawRowsPublished:1}},now).rows.some(x=>x.label==="Underdog NHL integration"),false);assert.equal(model({platformStatus},now).quotaRemaining,null);});
