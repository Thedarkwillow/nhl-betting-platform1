"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {build}=require("./publish-safe-research-progress.cjs");
const {model}=require("../assets/roadmap-evidence-desk.js");
const now="2026-11-15T13:30:00Z";
const source={kind:"private_source_completion_readiness_v1",generatedAt:"2026-11-15T13:00:00Z",modelPromoted:false,wagersPlaced:0,periodCoverage:{accountedDays:60,pendingDays:201,calendarDays:261},prospective:{nhl:{firstObserved:1873,matchedCalibrationRows:0}},odds:{strictPlatformMatches:0,archivedConditionalMatches:12,rows:[{player:"Private test player",price:-120}]},paper:{authenticatedSettledEntries:0},lineupSlateEvidence:{NHL:{distinctSlatesAcrossFormats:1}},confidential:"INTERNAL_TEST"};
test("strict public aggregate allowlist and unknown inputs",()=>{
 const d=build(source,{now});assert.equal(d.periodHistory.accountedDays,60);assert.equal(d.evidence.nfl.firstObserved,null);assert.equal(d.sportsbook.strictMatched,0);assert.equal(d.proprietaryRowsPublished,0);assert.equal(d.paper.verifiedROI,null);
 assert.ok(!JSON.stringify(d).includes("Private test player"));assert.ok(!JSON.stringify(d).includes("INTERNAL_TEST"));
 assert.equal(build({...source,modelPromoted:true},{now}),null);
 assert.equal(build({...source,generatedAt:"2026-11-16T00:00:00Z"},{now}),null);
});
test("display explicit aged evidence without live claims",()=>{
 const d=build(source,{now}),v=model({progress:d},Date.parse(now));
 assert.equal(v.rows.find(r=>r.label==="NHL historical periods").value,"60 / 261 dates accounted; 201 pending");
 assert.match(v.rows.find(r=>r.label==="Sportsbook benchmark evidence").value,/live availability unverified/);
 assert.equal(model({progress:{...d,calibrationApproved:true}},Date.parse(now)).rows.some(x=>x.label==="NHL historical periods"),false);
});
