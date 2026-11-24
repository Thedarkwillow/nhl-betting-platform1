"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createShadow,verifyShadow,decision}=require("../src/nfl-prospective-shadow.cjs");
const original="2026-11-10T13:02:10Z",firstGit="2026-11-10T13:02:11Z",
 shadowAt="2026-11-10T13:05:10.250Z",shadowGit="2026-11-10T13:05:10Z",
 kickoff="2026-11-12T23:00:00Z";
const selection=(id,line,projection,last5,selectedSide)=>({
 id,market:"receiving_yards",historicalPlayerId:"P"+id,sourceGameId:"G3",
 eventStartsAt:kickoff,team:"WAS",opponent:"NYG",tier:"Standard",
 line,historicalProjection:projection,last5Baseline:last5,
 selectedSide,offeredSide:selectedSide,autoPickEligible:false,
 probability:null,priorRecordedGames:12});
const snapshot={kind:"nfl_independent_partner_standard_directional_original_research_v1",
 createdAt:original,sourceBoardAsOfAt:"2026-11-10T13:00:10Z",
 selections:[selection("a",40.5,45.2,42,"Higher"),
  selection("b",42.5,43.1,41,"Higher"),
  selection("c",40.5,30,33,"Lower"),
  selection("d",40.5,50,36,"Higher")]};
test("future 10pct shadow abstains rather than reversing original precommitted direction",()=>{
 const s=createShadow(snapshot,{sourceFirstGitCommittedAt:firstGit,now:shadowAt});
 assert.equal(s.selected.length,4);
 const z=Object.fromEntries(s.selected.map(p=>[p.id,p.policyDecisions]));
 assert.deepEqual(z.a,{relativeMargin10:"include",baselineAgreementAndMargin10:"include"});
 assert.deepEqual(z.b,{relativeMargin10:"abstain",baselineAgreementAndMargin10:"abstain"});
 assert.deepEqual(z.c,{relativeMargin10:"include",baselineAgreementAndMargin10:"include"});
 assert.deepEqual(z.d,{relativeMargin10:"include",baselineAgreementAndMargin10:"abstain"});
 assert.equal(s.selected.every(p=>p.selectedSide===p.offeredSide),true);
 assert.equal(s.expectedValue,null);
 assert.equal(verifyShadow(s,shadowGit).verified,true);
});
test("stale sources, late Git commits, edited decisions and started games never become pregame proof",()=>{
 assert.throws(()=>createShadow(snapshot,{sourceFirstGitCommittedAt:firstGit,
  now:"2026-11-10T14:00:00Z"}),/Refusing/);
 assert.throws(()=>createShadow({...snapshot,selectedSide:"Higher"},{
  sourceFirstGitCommittedAt:"2026-11-12T23:00:00Z",now:shadowAt}),/Refusing/);
 const s=createShadow(snapshot,{sourceFirstGitCommittedAt:firstGit,now:shadowAt});
 assert.equal(verifyShadow(s,"2026-11-12T22:50:00Z").verified,false);
 assert.equal(verifyShadow({...s,selected:[{...s.selected[0],policyDecisions:{
  relativeMargin10:"abstain",baselineAgreementAndMargin10:"include"}}]},shadowGit).verified,false);
 assert.equal(verifyShadow({...s,selected:s.selected.concat(s.selected[0])},shadowGit).verified,false);
});
test("future snapshots with no remaining pregame selected lines abstain",()=>{
 const s={...snapshot,selections:snapshot.selections.map(p=>({
  ...p,eventStartsAt:"2026-11-10T13:18:00Z"}))};
 assert.throws(()=>createShadow(s,{sourceFirstGitCommittedAt:firstGit,now:shadowAt}),/No pregame eligible/);
 assert.equal(decision(selection("x",10,9.5,9,"Lower")).relativeMargin10,"abstain");
});
