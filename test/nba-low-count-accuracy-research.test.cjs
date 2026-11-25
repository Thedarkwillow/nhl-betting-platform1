'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {forecast,evaluate}=require('../scripts/nba-low-count-accuracy-research.cjs');
test('low count model handles zeros and rejects unknown or non half-point thresholds',()=>{
 const rows=Array.from({length:20},()=>({values:{blocks:0},exposure:20}));
 const p=forecast(rows,'blocks',.5);assert(p.hurdle>0&&p.hurdle<.1);assert(p.workloadPoisson>0&&p.workloadPoisson<.01);
 assert.equal(forecast(rows,'blocks',1),null);assert.equal(forecast(rows,'points',.5),null);
 assert.equal(forecast(rows.slice(0,5),'blocks',.5),null);
});
test('same-day future rows cannot influence forecast evaluation',()=>{
 const rows=Array.from({length:30},(_,i)=>({sport:'NBA',player:'fixture',scope:'full_game',event:String(i),date:'2025-08-'+String(i+1).padStart(2,'0'),start:i,end:i,known:i,exposure:25,values:{blocks:i%3,threePointersMade:i%4}}));
 const a=evaluate(rows);assert.equal(a.groups.blocks.n,18);assert.equal(a.modelPromoted,false);
});
