'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {samples,score,scopedFeatures}=require('../scripts/pickfinder-valorant-retrospective.cjs');

const observedAt='2026-11-26T08:00:00Z';
const clock='2026-11-27T12:00:00Z';
const eventId='20261126889E98FA';
const offer={
 sport:'valorant',book:'underdog',player:'zap',market:'1st_2_maps_player_kills',
 eventId,observedAt,mapRange:'1st_2_maps',line:24.5,
 detailId:'/players/val/2y5lrc9frzttg3v?prop=id%3A1st_2_maps_player_kills%3A'+eventId+'%3A24.5'
};
const board={offer,archiveFirst:observedAt,manifestDigest:'b'.repeat(64)};
const labels=['L5','L10'].map(metric=>({...offer,origin:'board',boardBook:offer.book,metric,value:'60%',mapRange:null}));
const raw={
 digest:'a'.repeat(64),first:'2026-11-27T01:00:00Z',
 doc:{kind:'pickfinder_independent_valorant_finals_v1',observedAt:'2026-11-27T01:00:00Z',
  series:[{sourceEventId:eventId,listedStartAt:'2026-11-26T18:00:00Z',
   resultUrl:'https://www.vlr.gg/792043/fluxo-w7m-vs-elevate-vct-2027-america-kickoff-brazil-qualifier-playoffs-ubqf',
   responseSha256:'c'.repeat(64),
   maps:[['297131','Lotus'],['297132','Corrode']].map(([mapId,name])=>({mapId,name,teamRounds:[13,10],
    players:Object.fromEntries(['3169','a','b','c','d','e','f','g','h','i'].map(id=>[id,{kills:13}]))}))
  }]
 }
};
const observations=new Map([[board.manifestDigest,labels]]);
const sample=(row=board,receipt=raw)=>samples(new Map([['test',row]]),[receipt],clock,observations);

test('hydrates only the exact scoped historical lookbacks',()=>{
 assert.deepEqual(scopedFeatures(offer,labels),{L5:.6,L10:.6});
 for(const conflict of [{player:'different'},{boardBook:'prizepicks'},{mapRange:'maps_3_4'},{observedAt:clock}]){
  assert.deepEqual(scopedFeatures(offer,labels.map(x=>({...x,...conflict}))),{});
 }
});
test('replays both mapped results with a prior board clock and fails closed on scope or time',()=>{
 const examples=sample().examples;
 assert.equal(examples.length,1);
 assert.equal(examples[0].outcome,1);
 assert.equal(score(examples,()=>.5).brier,.25);
 assert.equal(sample({...board,archiveFirst:'2026-11-26T18:01:00Z'}).skip.unprovedPregame,1);
 const wrongMap=structuredClone(raw);
 wrongMap.doc.series[0].maps[1].name='Bind';
 assert.equal(sample(board,wrongMap).skip.unprovedMapScope,1);
 const missingPlayer=structuredClone(raw);
 const players=missingPlayer.doc.series[0].maps[1].players;
 players['3168']=players['3169'];delete players['3169'];
 assert.equal(sample(board,missingPlayer).skip.unprovedPlayer,1);
});

test('a later finish does not silently turn the original-date offer into a rescheduled offer',()=>{
 const eventId='2026112600B7ED27';
 const fixture=require('../config/esports/pickfinder-series-review-2026-11-27.json').series.find(x=>x.sourceEventId===eventId);
 const player=fixture.roster[0];
 const moved='2026-11-28T22:00:00Z';
 const receipt=structuredClone(raw);
 receipt.doc.series[0].sourceEventId=eventId;
 receipt.doc.series[0].listedStartAt=moved;
 receipt.doc.series[0].resultUrl=fixture.seriesUrl;
 receipt.doc.observedAt=receipt.first='2026-11-29T01:00:00Z';
 const candidate={...offer,player:player.label,eventId,
   detailId:player.pickfinderProfilePath+'?prop=testing%3A'+offer.market+'%3A'+eventId+'%3A'+offer.line};
 const run=o=>samples(new Map([['test',{...board,offer:o}]]),[receipt],'2026-11-29T12:00:00Z',observations).skip;
 assert.equal(run(candidate).rescheduledOfferNotReissued,1);
 assert.equal(run({...candidate,startAt:'2026-11-26T22:00:00Z'}).rescheduledOfferNotReissued,1);
 assert.equal(run({...candidate,startAt:moved}).unprovedMapScope,1);
});
