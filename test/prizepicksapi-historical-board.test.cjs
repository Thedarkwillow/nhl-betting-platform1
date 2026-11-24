"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {datesToArchive,prepareHistoricalBoard,getHistoricalBoard}=require("../scripts/backfill-prizepicksapi-nhl-history.cjs");
const asOf="2026-10-29T21:00:00.000Z",fetched="2026-11-02T05:00:00.000Z";
const p={id:"pp_demo",source:"prizepicks",league:"NHL",status:"active",is_demo:false,
 player:{id:"player1",name:"Example Skater",team:"BOS"},
 event:{starts_at:"2026-10-30T00:00:00Z",opponent:"TOR"},
 market:{stat:"Shots On Goal",period:"Full game"},line:2.5,
 observed_at:"2026-10-29T20:58:00.000Z",first_seen_at:"2026-10-29T19:00:00Z",
 selections:[{side:"more",tier:"standard",available:true,payout_multiplier:null},
 {side:"less",tier:"standard",available:true,payout_multiplier:null}],
 source_fields:{odds_type:"standard",adjusted_odds:true}};
test("records true retrieval date, not fabricated historical capture",()=>{
 const o=prepareHistoricalBoard([p],asOf,fetched);
 assert.equal(o.rows.length,2);
 assert.equal(o.rows[0].capturedAt,fetched);
 assert.equal(o.rows[0].boardAsOf,asOf);
 assert.equal(o.rows[0].observedAt,p.observed_at);
 assert.equal(o.rows[0].providerPlayerId,"player1");
 assert.equal(o.rows[0].verifiedProspectivePrediction,false);
 assert.equal(o.rows[0].sourceFields.adjustedOdds,true);
});
test("rejects post-asof observations, already-started and distant games",()=>{
 const o=prepareHistoricalBoard([p,
 {...p,id:"future",observed_at:"2026-10-29T21:02:00Z"},
 {...p,id:"started",event:{starts_at:"2026-10-29T20:00:00Z"}},
 {...p,id:"distant",event:{starts_at:"2026-11-04T00:00:00Z"}}],asOf,fetched);
 assert.equal(o.eligibleOffers,1);assert.equal(o.rows.length,2);
});
test("date restrictions guard source history and duplicate requests",()=>{
 assert.throws(()=>datesToArchive("2025-10-28"),/pre-archive/);
 assert.throws(()=>datesToArchive("2026-10-28,2026-10-28"),/distinct/);
});
test("paginates without accepting a partial board",async()=>{
 const visited=[],budget={calls:0};
 const fetchPage=async cursor=>{
  visited.push(cursor);
  return {data:[p],meta:{mode:"live",as_of:asOf,collection_started_at:"2026-10-28T00:00:00Z",
   next_cursor:cursor?null:"cursor2"}};
 };
 const r=await getHistoricalBoard(asOf,"test",{budget,pause:async()=>{},fetchPage});
 assert.equal(r.pages,2);assert.deepEqual(visited,[null,"cursor2"]);assert.equal(budget.calls,2);
 await assert.rejects(()=>getHistoricalBoard(asOf,"test",{budget:{calls:0},pause:async()=>{},
  fetchPage:async()=>({data:[],meta:{mode:"live",as_of:asOf,
   collection_started_at:"2026-10-28T00:00:00Z",next_cursor:"repeat"}})}),/repeated page cursor/);
});
test("rejects mismatched historical metadata",async()=>{
 await assert.rejects(()=>getHistoricalBoard(asOf,"test",{budget:{calls:0},
  fetchPage:async()=>({data:[],meta:{mode:"live",as_of:"2026-10-30T21:00:00Z",
   collection_started_at:"2026-10-28T00:00:00Z",next_cursor:null}})}),/metadata/);
});
