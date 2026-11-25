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

test("scoped research preserves N/A, period and mode without leaking raw fields in summaries",()=>{
 const x=input(),r=x.pages[0].rows[0];r.mapRange="maps 1-2";r.gameMode="HP";
 r.research=[{origin:"profile",tab:"Player Stats",metric:"kills",scope:"player",mapRange:"maps 1-2",gameMode:"HP",window:"L10",observedAt,value:"N/A"},{origin:"board",tab:"Implied",metric:"Higher implied percentage",scope:"market",observedAt,value:55,unit:"percent"}];
 const y=normalize(x,{now});assert.equal(y.offers[0].mapRange,"maps 1-2");assert.equal(y.offers[0].gameMode,"HP");assert.equal(y.researchObservations[0].value,null);assert.equal(y.researchObservations[0].missingReason,"displayed_na");assert.equal(y.researchObservations[1].value,55);assert.equal(y.researchObservations[1].modelInputsApproved,false);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pickfinder-research-"));const old=process.env.RESTRICTED_DESTINATION_VERIFIED;
 try{fs.mkdirSync(path.join(dir,".git"));process.env.RESTRICTED_DESTINATION_VERIFIED="1";const summary=archive(x,dir,"scoped",{now});assert.equal(summary.researchObservations,undefined);assert.equal(summary.health.researchFields,2);}
 finally{if(old===undefined)delete process.env.RESTRICTED_DESTINATION_VERIFIED;else process.env.RESTRICTED_DESTINATION_VERIFIED=old;fs.rmSync(dir,{recursive:true,force:true});}
 r.research[0].observedAt="2026-11-25T14:01:00Z";assert.throws(()=>normalize(x,{now}));
});
test("map ranges and game modes cannot collapse to one offer",()=>{
 const x=input(),r=row();x.pages[0].rows[0].gameMode="HP";r.gameMode="S&D";x.pages[0].rows.push(r);
 assert.equal(normalize(x,{now}).offers.length,2);
});

test("unpriced tier, absent badge and mixed-book groups remain unresolved with separate counters",()=>{
 const x=input(),r=row();r.apps=[];r.appEvidence=[{book:"prizepicks",icons:["prizepicks","goblin"],tier:"goblin",line:28.5}];x.pages[0].rows=[r,{...r,detailId:"b",appEvidence:[]},{...r,detailId:"c",appEvidence:[{book:"prizepicks",icons:["prizepicks","underdog"],line:28.5}]}];
 const y=normalize(x,{now});assert.equal(y.offers.length,0);assert.equal(y.health.unresolvedEvidence.tierWithoutExplicitPrice,1);assert.equal(y.health.unresolvedEvidence.bookBadgeMissing,1);assert.equal(y.health.unresolvedEvidence.ambiguousBookGroup,1);
});

test("profile history retains market and event scope without certifying platform or timestamp",()=>{
 const x=input(),r=x.pages[0].rows[0];r.research=[{origin:"line_movement",tab:"Line Movement",metric:"movement time",scope:"movement row 1",observedAt,value:'{"value":"11/25 1:05AM","labels":[]}'},{origin:"prop_history",tab:"Prop History",metric:"historical result",scope:"displayed history",window:"past 3 months, main lines",observedAt,value:"Line: 4.5 Actual: 6"}];
 const y=normalize(x,{now});assert.equal(y.researchObservations[0].market,"kills");assert.equal(y.researchObservations[0].eventId,"event");assert.equal(y.researchObservations[0].boardBook,"prizepicks");assert.equal(y.researchObservations[0].value,r.research[0].value);assert.equal(y.researchObservations[1].window,"past 3 months, main lines");assert.equal(y.researchObservations[0].modelInputsApproved,false);
});
test("player history reader recognizes displayed three-month main-line window",()=>{
 const {readSections}=require("../scripts/pickfinder-player-research.cjs");
 const old=global.document;
 try{global.document={querySelectorAll:()=>[{innerText:"Lines from the past 3 months. Only main lines are shown (no goblins or demons).",nextElementSibling:{children:[{innerText:"11/23 Line: 4.5 Actual: 6",querySelectorAll:()=>[]}]}}]};const fields=readSections({tab:"Prop History",origin:"prop_history",observedAt,context:{}});assert.equal(fields.length,1);assert.equal(fields[0].window,"past 3 months, main lines");assert.match(fields[0].value,/4.5/);}
 finally{global.document=old;}
});

test("tier-only line is separate from actionable offers and public summary",()=>{const x=input(),r=x.pages[0].rows[0];r.apps=[];r.appEvidence=[{book:"prizepicks",icons:["prizepicks","goblin"],tier:"goblin",line:28.5}];const y=normalize(x,{now});assert.equal(y.offers.length,0);assert.equal(y.unpricedTierObservations.length,1);assert.equal(y.unpricedTierObservations[0].side,null);assert.equal(y.unpricedTierObservations[0].displayedPrice,null);assert.equal(y.unpricedTierObservations[0].eligibleForLockedModel,false);assert.equal(y.health.unresolvedRows,1);});
