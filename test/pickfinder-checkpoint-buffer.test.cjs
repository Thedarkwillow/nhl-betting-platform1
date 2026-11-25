'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{checkpointBuffer}=require('../scripts/pickfinder-checkpoint-buffer.cjs');
test('ten records share a verified remote checkpoint and progress is delayed until verification',async()=>{
 const writes=[],verified=[];const b=checkpointBuffer({write:async rows=>writes.push(rows.map(r=>r.id)),onVerified:r=>verified.push(r.id)});
 for(let id=0;id<9;id++)await b.add({id});assert.equal(verified.length,0);assert.equal(b.size(),9);
 await b.add({id:9});assert.equal(writes.length,1);assert.equal(verified.length,10);
 await b.add({id:10});await b.flush();assert.equal(writes.length,2);assert.equal(verified.length,11);
});
test('time and bytes trigger flush; failed remote write never advances counters',async()=>{
 let clock=0,n=0;const b=checkpointBuffer({clock:()=>clock,write:async()=>{},onVerified:()=>n++});await b.add({id:1});clock=30001;await b.add({id:2});assert.equal(n,1);await b.flush();assert.equal(n,2);
 const f=checkpointBuffer({write:async()=>{throw Error('push')},onVerified:()=>n++});await f.add({id:3});await assert.rejects(f.flush(),/push/);assert.equal(n,2);assert.equal(f.failed(),true);
});
