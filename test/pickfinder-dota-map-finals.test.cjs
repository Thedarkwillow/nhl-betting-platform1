'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),{reconcile}=require('../scripts/pickfinder-dota-map-finals.cjs');
test('Dota team counts require an exact ordered native series with two completed maps',()=>{
 const digest='a'.repeat(64),first='2026-11-27T12:00:00Z',game=(id,s,e)=>({provider:'opendota',title:'DOTA2',providerSeriesId:'500',providerGameId:id,
 startAt:s,endAt:e,teamIds:['20','21'],teamScores:[14,24],winnerTeamId:'21',providerReportedFinal:true});
 const doc={kind:'opendota_index_detail_reconciliation_v1',indexDigest:digest,observedAt:first,finals:[
  game('100','2026-11-26T10:00:00Z','2026-11-26T11:00:00Z'),game('101','2026-11-26T11:01:00Z','2026-11-26T12:00:00Z')
 ].map(game=>({game,playerCount:10,sourceDigest:digest,observedAt:first}))};
 const r={sport:'dota2',sourceEventId:'event',firstTwoValveMatchIds:['100','101']};
 const run=(patch=r,native=doc)=>reconcile([{doc:native,digest,first}],first,{reviewedAt:first,series:[patch]}).summary;
 a.equal(run().qualifiedHistoricalTeamStats,4);a.equal(run().joinedEvents,1);a.equal(run().playerStatsQualified,0);
 a.equal(run({...r,firstTwoValveMatchIds:['101','100']}).joinedEvents,0);
 a.equal(run(r,{...doc,finals:[doc.finals[0],{...doc.finals[1],game:{...doc.finals[1].game,teamIds:['20','23'],winnerTeamId:'23'}}]}).joinedEvents,0);
});
