'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {get}=require('../scripts/smoke-live-dashboard.cjs');
const url='https://example.com/dashboard.css?smoke=1';
function setup(statuses){
 const attempts=[],delays=[];
 return {attempts,delays,read:async path=>{attempts.push(path);return new Response('sample',{status:statuses.shift()});},wait:async ms=>{delays.push(ms);}};
}
test('temporary Pages failures retry the exact deployed URL with a bounded backoff',async()=>{
 const state=setup([503,502,200]);
 assert.equal(await (await get(url,state)).text(),'sample');
 assert.deepEqual(state.attempts,[url,url,url]);assert.deepEqual(state.delays,[1000,2000]);
});
test('page absence fails immediately and persistent outages still fail',async()=>{
 const missing=setup([404]);await assert.rejects(get(url,missing),/HTTP 404/);assert.equal(missing.attempts.length,1);
 const outage=setup([503,503,503]);await assert.rejects(get(url,outage),/HTTP 503/);assert.equal(outage.attempts.length,3);
});
