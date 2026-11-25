"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {verifySession}=require("../scripts/collect-pickfinder-browser.cjs");
const {audit}=require("../scripts/audit-pickfinder-private-pilot.cjs");
const {normalize}=require("../scripts/pickfinder-premium-archive.cjs");
test("restart launches and closes two independent persistent contexts",async()=>{
 const trace=[];const chromium={launchPersistentContext:async(profile)=>{trace.push("open");assert.equal(profile,"fixture");return {newPage:async()=>({goto:async()=>{},getByRole:()=>({waitFor:async()=>{}}),evaluate:async()=>({authenticated:true})}),close:async()=>{trace.push("close");}};}};
 const result=await verifySession(chromium,"fixture");assert.deepEqual(trace,["open","close","open","close"]);assert.equal(result.authenticatedAfterRestart,true);assert.equal(result.scheduledCaptureVerified,false);
});
test("second context expiry refuses authentication acceptance",async()=>{
 let count=0,closed=0;const chromium={launchPersistentContext:async()=>{const ok=++count===1;return {newPage:async()=>({goto:async()=>{},getByRole:()=>({waitFor:async()=>{}}),evaluate:async()=>({authenticated:ok})}),close:async()=>{closed++;}};}};
 await assert.rejects(verifySession(chromium,"fixture"),/premium_session_unavailable/);assert.equal(closed,2);
});
test("historical name match remains candidate and does not qualify a frozen forecast",()=>{
 const at="2026-11-25T09:00:00Z",partitions=[];
 for(const sport of ["nba","nhl","nfl","cs2","valorant","dota2","lol","cod"])for(const book of ["prizepicks","underdog"]){
 const s={schema:"pickfinder-premium-export-v1",book,sport,localDay:"2026-11-25",slot:"manual",startedAt:at,endedAt:at,boardState:"populated",displayedPageCount:1,lastPageReached:true,pages:[{number:1,rows:[{sport,player:"Fixture Player",detailId:"fixture",market:"points",observedAt:at,apps:[{book,line:10.5,side:"Higher",tier:"Standard",displayedPrice:"-110"}]}]}]};
 partitions.push({source:s,normalized:normalize(s)});
 }
 const r=audit({partitions},[{player:"Fixture Player",playerId:1}],{rows:[]});assert.equal(r.offers,16);assert.equal(r.groups["nba|prizepicks"].nameCandidates.uniqueHistoricalName,1);assert.equal(r.playerIdentitiesVerified,0);assert.equal(r.forecastFreezeVerified,false);
});
