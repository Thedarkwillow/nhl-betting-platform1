"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {remainingToday}=require("../scripts/report-nhl-remaining-today.cjs");
const at="2026-11-07T20:20:00Z";
const base={provider:"prizepicksapi.com",independentProvider:true,
 sourceStatus:"fresh",completePagination:true,snapshotMode:"immutable_as_of",
 generatedAt:"2026-11-07T20:19:40Z",
 boardAsOfAt:"2026-11-07T20:19:30Z",
 sourceObservedAt:"2026-11-07T20:19:00Z"};
const row=(id,start,more={})=>({isLive:false,provider:"prizepicksapi.com",
 projectionId:id,player:"Example Player",market:"Shots on Goal",
 tier:"Standard",side:"Higher",line:2.5,eventStartsAt:start,...more});
test("only still-upcoming same-Pacific-day NHL offers survive",()=>{
 const board={...base,rows:[
  row("pp_1","2026-11-07T21:00:00Z"),
  row("pp_2","2026-11-08T05:00:00Z",{tier:"Demon"}),
  row("pp_3","2026-11-07T20:34:00Z"),
  row("pp_4","2026-11-07T19:00:00Z"),
  row("pp_5","2026-11-08T09:00:00Z"),
  row("pp_6","2026-11-07T21:00:00Z",{isLive:true}),
  row("pp_7","2026-11-07T21:00:00Z",{line:null})
 ]};
 const r=remainingToday(board,{now:at,datePacific:"2026-11-07"});
 assert.equal(r.remainingSelectionRows,2);
 assert.deepEqual(r.rows.map(x=>x.projectionId),["pp_1","pp_2"]);
 assert.equal(r.distinctListedStartTimes,2);
 assert.equal(r.originalPrizePicksAppAuthenticated,false);
 assert.equal(r.automaticHigherLowerPicksEnabled,false);
 assert.equal(r.optimizedLineupEligibilityEnabled,false);
 assert.equal(r.tierCounts.Standard,1);
 assert.equal(r.tierCounts.Demon,1);
});
test("stale or failed original board cannot be mislabeled as a fresh remaining pull",()=>{
 const good={...base,rows:[row("pp_1","2026-11-07T21:00:00Z")]};
 for(const override of [
  {sourceStatus:"stale"},{completePagination:false},
  {generatedAt:"2026-11-07T19:55:00Z"},
  {boardAsOfAt:"2026-11-07T20:25:00Z"},
  {sourceObservedAt:"2026-11-07T19:00:00Z"},
  {provider:"PrizePicks"}
 ]) assert.throws(()=>remainingToday({...good,...override},{now:at,datePacific:"2026-11-07"}));
 assert.throws(()=>remainingToday(good,{now:at,datePacific:"2026-11-06"}));
});
test("no qualifying games returns explicit empty research archive, not fabricated props",()=>{
 const r=remainingToday({...base,rows:[row("pp_1","2026-11-08T09:00:00Z")]},
  {now:at,datePacific:"2026-11-07"});
 assert.equal(r.remainingSelectionRows,0);
 assert.equal(r.status,"no_qualifying_unstarted_offers");
 assert.deepEqual(r.marketCounts,{});
});