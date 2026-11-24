"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {SOURCES,sourceStatus}=require("../src/nfl-research-sources.cjs");
const {pacificClock,requireSlot,fetchComplete,summarize}=require("../scripts/collect-nfl-board.cjs");
const {compare}=require("../scripts/diff-nfl-morning-boards.cjs");
test("all requested NFL source research inputs listed with honest connection states",()=>{
 const ids=SOURCES.map(x=>x.id);
 for(const id of ["nflverse","rotowire","fantasylife","nextgenstats","profootballreference","prizepickshistory"])
  assert.ok(ids.includes(id),id);
 assert.equal(new Set(ids).size,ids.length);
 assert.ok(sourceStatus().every(x=>!x.connected&&!x.livePullVerified&&!x.commercialRightsVerified));
 assert.ok(SOURCES.filter(x=>x.id==="rotowire"||x.id==="fantasylife").every(x=>x.collector===null));
});
test("Pacific DST autumn transition and 60 minute authentic windows",()=>{
 // November 8 2026: PST (UTC-08)
 assert.deepEqual(pacificClock(new Date("2026-11-08T14:18:00Z")),{date:"2026-11-08",minutes:378});
 assert.deepEqual(pacificClock(new Date("2026-11-08T17:15:00Z")),{date:"2026-11-08",minutes:555});
 assert.doesNotThrow(()=>requireSlot("06:00",pacificClock(new Date("2026-11-08T14:18:00Z"))));
 assert.doesNotThrow(()=>requireSlot("09:00",pacificClock(new Date("2026-11-08T17:15:00Z"))));
 assert.throws(()=>requireSlot("06:00",pacificClock(new Date("2026-11-08T18:02:00Z"))));
 assert.throws(()=>requireSlot("09:00",pacificClock(new Date("2026-11-08T16:59:00Z"))));
 // July PDT (UTC-07)
 assert.equal(pacificClock(new Date("2026-07-12T13:01:00Z")).minutes,361);
});
test("NFL collector fails without credits before a single billable page",async()=>{
 let billed=0;
 await assert.rejects(fetchComplete("x",{at:"2026-11-08T14:00:00Z",
  requester:async(_key,endpoint)=>{
   if(endpoint==="/board")billed++;
   return {body:{},usage:{unit:"credits",creditsRemaining:180}};
  }}),/quota preflight/);
 assert.equal(billed,0);
});
test("NFL collector follows every cursor, checks metered pages and preserves as-of provenance",async()=>{
 let pages=0;
 const at="2026-11-08T14:05:00Z";
 const offer={id:"pp_1",league:"NFL",status:"active",observed_at:"2026-11-08T14:00:00Z",
   player:"Kicker One",team:"SF",stat:"FG Made",period:"full_game",
   starts_at:"2026-11-08T21:25:00Z",line:1.5,tier:"standard",sides:["more","less"]};
 const requester=async(_key,endpoint,p={})=>{
  if(endpoint==="/coverage")return {body:{},usage:{unit:"credits",creditsRemaining:500}};
  pages++;assert.equal(p.league,"NFL");assert.equal(p.view,"compact");assert.equal(p.as_of,at);
  return {body:{data:pages===1?[offer]:[{...offer,id:"pp_2"}],
    meta:{mode:"live",source_status:"fresh",observed_at:at,next_cursor:pages===1?"other-page":null}},
    usage:{unit:"credits",creditsRemaining:490-pages*10,creditsCost:10}};
 };
 const full=await fetchComplete("secret",{at,requester});
 assert.equal(pages,2);assert.equal(full.items.length,2);assert.equal(full.cost,20);
 const n=summarize(full.items,at);
 assert.equal(n.offers.length,2);assert.equal(n.invalidOffers,0);
 assert.equal(n.unmappedCount,0);
 assert.equal(n.offers[0].marketId,"fg_made");
 assert.deepEqual(n.offers[0].sides,[{side:"more",tier:"standard"},{side:"less",tier:"standard"}]);
});
test("NFL morning source movement tracks additions, changes and disappearances without first-party claims",()=>{
 const base={slotPacific:"06:00",datePacific:"2026-11-08",platform:"prizepicks",
   completePagination:true,offers:[{id:"1",line:1.5,sides:[{tier:"standard",side:"more"}]},
     {id:"2",line:3.5,sides:[]}]};
 const late={...base,slotPacific:"09:00",
  offers:[{id:"1",line:2.5,sides:[{tier:"standard",side:"more"}]},{id:"3",line:1,sides:[]}]};
 const d=compare(base,late);
 assert.deepEqual(d.counts,{morning:2,late:2,added:1,removedFromSource:1,changed:1,unchanged:0});
 assert.equal(d.firstPartyPrizePicksRemovalConfirmed,false);
 assert.throws(()=>compare(base,{...late,datePacific:"2026-11-09"}));
});
