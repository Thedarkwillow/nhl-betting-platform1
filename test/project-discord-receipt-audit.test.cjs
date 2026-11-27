'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{reconcile}=require('../scripts/audit-project-discord-receipts.cjs');
const clock=1795810761479,id='a'.repeat(64),missing='b'.repeat(64),pending='c'.repeat(64),past='d'.repeat(64),proof='e'.repeat(64);
const event={id,kind:'new_prop',sport:'nhl',books:['prizepicks']};
test('reconciles only exact confirmed board receipts at the logged decision clock, without leaking IDs',()=>{
 const ledger={[id]:{at:clock,state:'confirmed',proof},[missing]:{at:clock,state:'confirmed',proof},
  [pending]:{at:clock,state:'reserved'},[past]:{at:clock-1,state:'confirmed',proof}};
 const out=reconcile([event,event,{...event,id:missing,kind:'suggestion'},{...event,id:pending}],ledger,clock);
 assert.deepEqual(out,{confirmations:2,matched:1,unmatched:1,counts:{'prizepicks/nhl/new_prop':1}});
 assert.doesNotMatch(JSON.stringify(out),/[a-f0-9]{64}/);
});
test('withholds malformed receipts and does not credit arbitrary names or duplicate routes',()=>{
 assert.throws(()=>reconcile([],{[id]:{at:clock,state:'confirmed',proof:'invalid'}},clock),/ledger shape/);
 const ledger={[id]:{at:clock,state:'confirmed',proof}};
 assert.equal(reconcile([{...event,books:['prizepicks','prizepicks']},{...event,sport:'custom'}],ledger,clock).matched,0);
});
