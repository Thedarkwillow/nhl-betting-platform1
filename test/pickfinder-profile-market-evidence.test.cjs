'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {profileMarketEvidence}=require('../scripts/pickfinder-profile-market-evidence.cjs');
const record={sport:'nba',player:'Example Player',eventId:'event',market:'points',status:'sampled',detailId:'/players/nba/id?prop=id:points:event:18'};
const time='2026-11-27T00:00:00Z',digest='e'.repeat(64);
const cell=(value,labels=[])=>({value,labels});
const movement={origin:'line_movement',tab:'Line Movement',metric:'row 1',scope:'Line | App | Time',observedAt:time};
const extract=(f,values,overrides={})=>profileMarketEvidence({...record,...overrides},{...f,value:JSON.stringify(values)},digest,time,time);
test('profile line history preserves the book-specific line, both displayed sides and the unconverted movement clock',()=>{
 const row=[cell('20.5'),cell('O-130\nU-125',['fanduel']),cell('11/25 4:06PM')];
 const [receipt]=extract(movement,row);
 assert.equal(receipt.quoteLine,20.5);assert.equal(receipt.higher,'-130');assert.equal(receipt.lower,'-125');
 assert.equal(receipt.movementAtUtc,null);assert.equal(receipt.displayedMovementClock,row[2].value);
 assert.equal(receipt.modelApproved,false);assert.equal(receipt.profileDigest,digest);
 for(const invalid of [[cell('20.5\n0.5'),...row.slice(1)],[row[0],cell('O-130\nU-125',['prizepicks']),row[2]],[row[0],cell('O-130\nO-125',['fanduel']),row[2]]])assert.deepEqual(extract(movement,invalid),[]);
 assert.deepEqual(extract(movement,row,{eventId:'other'}),[]);
 assert.deepEqual(extract({...movement,observedAt:'2026-12-01T00:00:00Z'},row),[]);
});
test('research workload and injury status require exact player and typed columns',()=>{
 const f={origin:'profile',scope:'Player | Passes | Potential Asts',metric:'row 1',tab:'Player overview',observedAt:time};
 const row=[cell('Example P.',['Example Player']),cell('40.5'),cell('6.3')];
 assert.deepEqual(extract(f,row).map(x=>x.value),[40.5,6.3]);
 assert.deepEqual(extract({...f,tab:'Injuries'},row),[]);
 assert.deepEqual(extract(f,row,{player:'Someone Else'}),[]);
 const injury={...f,tab:'Injuries',scope:'Player | Status'};
 assert.equal(extract(injury,[row[0],cell('Questionable')])[0].value,'questionable');
});
test('conflicting observations cannot certify a pair or combine isolated sides',()=>{
 const {summarize}=require('../scripts/pickfinder-profile-market-evidence.cjs');
 const values=[cell('20.5'),cell('O-130\nU-125',['fanduel']),cell('11/25 4:06PM')];
 const [r]=extract(movement,values);
 assert.equal(summarize([r,r]).distinctUnconflictedPairedGroups,1);
 assert.equal(summarize([r,{...r,higher:'-145'}]).conflictingMovementGroups,1);
 assert.equal(summarize([r,{...r,higher:'-145'}]).distinctUnconflictedPairedGroups,0);
 assert.equal(summarize([{...r,higher:null},{...r,lower:null}]).distinctUnconflictedPairedGroups,0);
});
