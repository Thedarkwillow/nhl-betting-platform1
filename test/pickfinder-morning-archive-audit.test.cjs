'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{inspect,run}=require('../scripts/pickfinder-morning-archive-audit.cjs');
test('actual-hour archive verification rejects late commits, wrong slot and bad digests',()=>{
 const day='2026-11-25',slot='06:00',book='prizepicks',sport='nba',raw=Buffer.from(JSON.stringify({book,sport,localDay:day,slot}));
 const normalized={book,sport,localDay:day,slot,withinSlot:true,sourceDigest:crypto.createHash('sha256').update(raw).digest('hex'),firstObservedAt:'2026-11-25T14:07:00Z',lastObservedAt:'2026-11-25T14:20:00Z',boardState:'populated',pageTraversalComplete:true,health:{pages:5,distinctOfferKeys:9,unresolvedRows:0}};
 const a={raw,normalized,day,slot,book,sport,first:'2026-11-25T14:21:00Z'};assert.equal(inspect(a).offers,9);assert.equal(inspect({...a,first:'2026-11-25T17:21:00Z'}),null);assert.equal(inspect({...a,normalized:{...normalized,sourceDigest:'bad'}}),null);assert.equal(run('/not-used',day,slot,new Date('2026-11-25T12:30:00Z')).state,'slot_not_finished');
});
