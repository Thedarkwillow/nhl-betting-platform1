"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {slotTime,validLock,summarize}=require("../scripts/morning-private-archive-health.cjs");
const {pin,required}=require("../scripts/nba-esports-prepull-candidate-lock.cjs");
const day="2026-11-25",slot="06:00",at="2026-11-25T15:20:00Z";
const lock={first:"2026-11-25T13:30:00Z",doc:{kind:"nba_esports_pre_pull_research_candidate_lock_v1",candidateRevision:pin,pacificDate:day,slot,diagnosticOnly:false,candidateLockDoesNotFreezeForecasts:true,forecastFreezeVerified:false,generatedAt:"2026-11-25T13:15:00Z",sports:Object.fromEntries(required.map(s=>[s,{candidateLocked:true}]))}};
const base={day,slot,at,lock,boards:[],rankings:[],offers:[],frozen:[]};
test("Pacific hour matching includes DST and rejects neighboring slots",()=>{
 assert.equal(slotTime("2026-11-25T14:05:00Z",day,slot),true);
 assert.equal(slotTime("2026-07-25T13:05:00Z","2026-07-25",slot),true);
 assert.equal(slotTime("2026-11-25T15:00:00Z",day,slot),false);
});
test("lock must be correct slot, immutable first-commit time and revision",()=>{
 assert.equal(validLock(lock,day,slot),true);
 assert.equal(validLock({...lock,first:"2026-11-25T13:50:00Z"},day,slot),false);
 assert.equal(validLock({...lock,doc:{...lock.doc,diagnosticOnly:true}},day,slot),false);
 assert.equal(validLock(lock,day,"09:00"),false);
});
test("missing source is not a green forecast or inferred no-event slate",()=>{
 const r=summarize(base);
 assert.equal(r.lockVerified,true);assert.equal(r.allSlotForecastsCertified,false);
 assert.deepEqual(Object.keys(r.sports),required);
 assert.ok(Object.values(r.sports).every(x=>x.status==="no_observed_source_rows"));
 assert.equal(summarize({...base,lock:null}).sports.NBA.status,"lock_missing_or_invalid");
});
test("observed archives do not certify provenance; late data and wrong revision are excluded from counts",()=>{
 const capturedAt="2026-11-25T14:05:00Z",generatedAt="2026-11-25T14:15:00Z",first="2026-11-25T14:20:00Z";
 const boards=[{first,doc:{capturedAt,rows:[{}]}},{first:"2026-11-25T15:01:00Z",doc:{capturedAt,rows:[{}]}}];
 const rankings=[{first,doc:{kind:"nba_private_research_rankings_v1",generatedAt,boardCapturedAt:capturedAt,rows:[{researchOnly:true,gameStartAt:"2026-11-25T23:00:00Z",sourceObservedAt:capturedAt}]} }];
 const offers=[{first,doc:{kind:"authorized_esports_original_offer_export_v1",capturedAt,rows:[{title:"CS2",capturedAt}]} }];
 const frozen=[{first,doc:{kind:"esports_prospective_frozen_v2",generatedAt,modelRevision:pin,rows:[{offer:{title:"CS2",capturedAt,seriesStartAt:"2026-11-25T20:00:00Z"}}]}}];
 const r=summarize({...base,boards,rankings,offers,frozen});
 assert.equal(r.sports.NBA.observedSourceRows,1);
 assert.equal(r.sports.NBA.status,"model_revision_unconfirmed");
 assert.equal(r.sports.CS2.status,"slot_binding_not_verified");
 assert.equal(r.sports.CS2.slotForecastCertified,false);
});

test("receipt binds exact original ranking bytes and same immutable first commit to scheduled model",()=>{
 const {validRankingReceipt}=require("../scripts/morning-private-archive-health.cjs");
 const tree="a".repeat(40),l={...lock,doc:{...lock.doc,candidateTree:tree}};
 const f={first:"2026-11-25T14:40:00Z",commit:"b".repeat(40),rel:"outputs/nba/rankings/20261125T143600000Z.json",digest:"c".repeat(64),doc:{generatedAt:"2026-11-25T14:36:00Z"}};
 const receipt={first:f.first,commit:f.commit,doc:{kind:"nba_locked_ranking_receipt_v1",rankingPath:f.rel,rankingSha256:f.digest,generatedAt:"2026-11-25T14:37:00Z",pacificDate:day,slot,modelRevision:pin,candidateTree:tree,lockFirstGitAt:l.first,originalAppAvailabilityVerified:false,calibrationApproved:false,forecastFreezeVerified:false}};
 assert.equal(validRankingReceipt(f,receipt,l,day,slot,at),true);
 assert.equal(validRankingReceipt({...f,digest:"d".repeat(64)},receipt,l,day,slot,at),false);
 assert.equal(validRankingReceipt(f,{...receipt,commit:"e".repeat(40)},l,day,slot,at),false);
 assert.equal(validRankingReceipt(f,{...receipt,doc:{...receipt.doc,slot:"09:00"}},l,day,slot,at),false);
 assert.equal(validRankingReceipt(f,{...receipt,doc:{...receipt.doc,calibrationApproved:true}},l,day,slot,at),false);
});
