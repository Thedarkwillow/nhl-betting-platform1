"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {normalize,archive}=require("../scripts/pickfinder-premium-archive.cjs");
const now=new Date("2026-11-25T15:10:00Z"),observedAt="2026-11-25T14:20:00Z";
const row=()=>({sport:"cs2",detailId:"source-player-detail",player:"Fixture Player",eventId:"event",market:"kills",period:"maps 1-2",observedAt,startAt:"2026-11-25T19:00:00Z",teamMoneylinePercent:65,apps:[{book:"prizepicks",line:28.5,side:"Higher",tier:"Standard",displayedPrice:"1x"},{book:"underdog",line:27.5,side:"Lower"}]});
const input=()=>({schema:"pickfinder-premium-export-v1",book:"prizepicks",sport:"cs2",localDay:"2026-11-25",slot:"06:00",startedAt:"2026-11-25T14:07:00Z",endedAt:"2026-11-25T14:40:00Z",boardState:"populated",displayedPageCount:1,lastPageReached:true,pages:[{number:1,rows:[row()]}]});
test("matching Apps price not adjacent book; traversal not certification",()=>{
 const result=normalize(input(),{now});assert.equal(result.offers.length,1);assert.equal(result.offers[0].line,28.5);assert.equal(result.offers[0].teamMoneylinePercent,65);assert.equal(result.withinSlot,true);assert.equal(result.pageTraversalComplete,true);assert.equal(result.fullBoardCertified,false);assert.equal(result.offers[0].eligibleForLockedModel,false);
});
test("duplicate links and live changes remain explicit",()=>{
 const x=input(),r=row();r.apps[0].displayedPrice="2x";r.observedAt="2026-11-25T14:25:00Z";x.pages[0].rows.push(r);
 const y=normalize(x,{now});assert.equal(y.health.repeatOrUnresolvedLinks,1);assert.equal(y.health.priceConflictKeys,1);assert.equal(y.offers[0].displayedPrice,"2x");
});
test("delayed capture is never relabeled",()=>{
 const x=input();x.endedAt="2026-11-25T15:05:00Z";x.pages[0].rows[0].observedAt=x.endedAt;
 const y=normalize(x,{now});assert.equal(y.withinSlot,false);assert.equal(y.health.crossHourRows,1);
});
test("wrong sport and absent book are excluded",()=>{
 const x=input();x.pages[0].rows[0].sport="nba";x.pages[0].rows.push({...row(),apps:[{book:"underdog",line:2,side:"Higher"}]});
 const y=normalize(x,{now});assert.equal(y.health.wrongSport,1);assert.equal(y.health.unresolvedRows,1);assert.equal(y.offers.length,0);
});
test("empty and disabled are not certified populated boards",()=>{
 for(const boardState of ["empty","disabled"]){const x={...input(),boardState,pages:[],displayedPageCount:0};const y=normalize(x,{now});assert.equal(y.boardState,boardState);assert.equal(y.fullBoardCertified,false);assert.equal(y.pageTraversalComplete,false);}
});
test("partial and duplicate page numbers cannot silently pass",()=>{
 const x=input();x.displayedPageCount=2;assert.equal(normalize(x,{now}).pageTraversalComplete,false);x.pages.push(x.pages[0]);assert.throws(()=>normalize(x,{now}));
});
test("private archive is append-only and prints no offer rows",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pickfinder-contract-"));const previous=process.env.RESTRICTED_DESTINATION_VERIFIED;
 try{fs.mkdirSync(path.join(dir,".git"));process.env.RESTRICTED_DESTINATION_VERIFIED="0";assert.throws(()=>archive(input(),dir,"a",{now}));process.env.RESTRICTED_DESTINATION_VERIFIED="1";const y=archive(input(),dir,"a",{now});assert.equal(y.rawRowsPublished,0);assert.equal(y.offers,undefined);assert.throws(()=>archive(input(),dir,"a",{now}));}
 finally{if(previous===undefined)delete process.env.RESTRICTED_DESTINATION_VERIFIED;else process.env.RESTRICTED_DESTINATION_VERIFIED=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
