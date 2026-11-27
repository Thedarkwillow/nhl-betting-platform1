'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

test('forecast publishing rechecks every newly frozen event after a delayed push',()=>{
 const {canArchive}=require('../scripts/pickfinder-forecast-archive-gate.cjs');
 const at=Date.parse('2026-11-27T12:00:00Z');
 const frame={generatedAt:'2026-11-27T11:58:00Z',rows:[{gameStartAt:'2026-11-27T12:17:00Z'},{gameStartAt:'2026-11-27T13:00:00Z'}]};
 assert.equal(canArchive(frame,at),true);
 assert.equal(canArchive(frame,at+2*60_000),false);
 assert.equal(canArchive({...frame,generatedAt:'2026-11-27T12:00:01Z'},at),false);
 assert.equal(canArchive({...frame,rows:[{gameStartAt:''}]},at),false);
});
