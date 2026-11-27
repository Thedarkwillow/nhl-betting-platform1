'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const {compare}=require('../scripts/pickfinder-pf26-cohort-audit.cjs');
const cutoff='2026-11-27T15:36:00Z', before='2026-11-26T15:00:00Z',h='9'.repeat(64);
const good={sport:'nhl',value:3,providerIdentityReviewed:true,modelApproved:false,collectionSkipAuthorized:false,
 availableAt:before,reviewDigest:h,nativeDigest:h,profileDigest:h};
test('PF-26 checks the original key, exact value, independent proof, and available-at cutoff',()=>{
 const original=new Map([['pass',good],['future',good],['different',good],['unreviewed',good],['missing',good]]);
 const latest={cache:new Map([['unreviewed',good]]),reviewedCache:new Map([['pass',good],
  ['future',{...good,availableAt:'2026-11-28T07:00:00Z'}],['different',{...good,value:4}],['not-original',good]])};
 const r=compare(original,latest,cutoff);
 a.deepEqual(r.bySport.nhl,{original:5,exactReviewed:1,currentUnreviewed:1,absent:1,conflicted:2});
 a.equal(r.qualifiedModelInputs,0);a.equal(r.modelApproved,false);a.equal(r.networkCalls,0);
});
