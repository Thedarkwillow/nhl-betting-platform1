"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {COLUMNS}=require("../src/partner-prizepicks-board.cjs");
const {classify,summarize,auditCoverage}=require("../src/partner-direction-tier-evidence.cjs");
function archive(){
 const observed="2026-11-14T17:06:00Z";
 const row=(id,tier,offeredWagerTypes)=>COLUMNS.map(k=>({projectionId:id,tier,offeredWagerTypes,market:"Shots On Goal",status:"pre_game",eventStartsAt:"2026-11-14T23:00:00Z"}[k]??null));
 const sports=["NHL","NFL"].map(sport=>({sport,rawCount:3,normalizedCount:3,parts:1,sourceObservedAt:observed}));
 const manifest={schemaVersion:1,source:"partner-api.prizepicks.com",snapshotMode:"direct_live_board",completePagination:true,
 columns:COLUMNS,captureStartedUTC:"2026-11-14T17:05:00Z",captureFinishedUTC:observed,pacificDate:"2026-11-14",notSixOrNineAmSlot:true,captureSlotPacific:null,sports};
 const parts=Object.fromEntries(sports.map(({sport})=>[sport,[{sport,startIndex:0,observedAtUTC:observed,rows:[row("1","demon","under_or_over"),row("2","goblin","under"),row("3","standard",null)]}]]));
 return {id:"fixture",manifest,parts};
}
test("special direction evidence never invents a side tier or eligibility",()=>{
 assert.deepEqual(classify("demon","under_or_over").sourceReportedDirections,["Higher","Lower"]);
 assert.equal(classify("demon","under_or_over").status,"special_both_direction_tier_unresolved");
 assert.deepEqual(classify("goblin","under").sourceReportedDirections,["Lower"]);
 assert.equal(classify("goblin","under").directionTierAuthenticated,false);
 assert.equal(classify("goblin","under").noNewEligibleDirections,true);
 assert.deepEqual(classify("goblin",null).sourceReportedDirections,[]);
 assert.deepEqual(classify("goblin","constructor").sourceReportedDirections,[]);
});
test("archive counts, missing directions and market aggregates",()=>{
 const a=archive(),r=summarize(a.manifest,a.parts.NHL,"NHL");
 assert.equal(r.sourceOffers,3);assert.equal(r.pregameSourceOffers,3);
 assert.equal(r.specialBothDirectionsUnresolved,1);assert.equal(r.unknownDirectionOffers,1);
 assert.equal(r.projectionTierAndDirectionField["goblin|under"],1);
 assert.equal(r.pregameSpecialBothDirectionsByMarket["Shots On Goal"],1);
 assert.equal(r.newSelectionEligibleDirections,0);
});
test("reject duplicates or incomplete archive, never label manual as morning slot",()=>{
 const a=archive();assert.equal(auditCoverage([a]).days["2026-11-14"].bothMorningSlotsVerified,false);
 a.parts.NHL[0].rows.pop();assert.throws(()=>summarize(a.manifest,a.parts.NHL,"NHL"));
 assert.equal(auditCoverage([a]).acceptedArchives,0);
 const b=archive();b.parts.NHL[0].rows[1][0]="1";
 assert.throws(()=>summarize(b.manifest,b.parts.NHL,"NHL"),/Duplicate/);
});
