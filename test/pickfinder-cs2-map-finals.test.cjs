'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),{reconcile}=require('../scripts/pickfinder-cs2-map-finals.cjs');
const real=require('../config/esports/pickfinder-cs2-player-review-2026-11-27.json'),now='2026-11-27T14:10:00Z';
test('CS2 official match-linked map scoreboards qualify reviewed first-two map facts only',()=>{
 const r=reconcile(now);a.equal(r.summary.qualifiedHistoricalMapStats,80);a.equal(r.summary.distinctPlayers,10);
 a.deepEqual(r.summary.byMarket,{kills:20,headshotKills:20,assists:20,deaths:20});
 a.equal(r.facts.find(x=>x.nativeMapId==='245055'&&x.market==='headshotKills'&&x.profileUrl.endsWith('/rain')).value,20);
 a.equal(r.summary.modelApproved,false);
});
test('CS2 abstains if map order, exact player ID, roster or headshots are inconsistent',()=>{
 for(const f of [s=>s.maps.reverse(),s=>s.maps[0].sides[0][0][0]=9999999,s=>s.maps[0].sides[0][0][2]=99,s=>s.maps[1].sides.reverse()]){
  const finals=structuredClone(real);f(finals.series[0]);a.equal(reconcile(now,{finals}).facts.length,0);
 }
});
