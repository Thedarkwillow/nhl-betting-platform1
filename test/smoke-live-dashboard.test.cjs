'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {get}=require('../scripts/smoke-live-dashboard.cjs');
const url='https://example.test/assets/dashboard.css';
function mock(values){
 const waits=[],warnings=[],calls=[];
 return {waits,warnings,calls,opts:{client:async target=>{
  calls.push(target);const value=values.shift();if(value instanceof Error)throw value;
  return new Response('body',{status:value});
 },wait:async ms=>waits.push(ms),warn:msg=>warnings.push(msg)}};
}
test('live smoke retries the same deployed resource on transient Pages and transport failures',async()=>{
 const reset=new Error('network',{cause:{code:'ECONNRESET'}}),m=mock([503,reset,200]);
 assert.equal(await (await get(url,m.opts)).text(),'body');
 assert.deepEqual(m.calls,[url,url,url]);assert.deepEqual(m.waits,[1000,2000]);
 assert.match(m.warnings[0],/HTTP 503/);assert.match(m.warnings[1],/ECONNRESET/);
});
test('live smoke fails on persistent outages and does not retry missing resources',async()=>{
 const m=mock([503,503,503]);await assert.rejects(get(url,m.opts),/HTTP 503/);assert.equal(m.calls.length,3);
 const missing=mock([404]);await assert.rejects(get(url,missing.opts),/HTTP 404/);assert.equal(missing.calls.length,1);
});
