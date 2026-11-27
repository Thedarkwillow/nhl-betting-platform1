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

test('individual KDA requires a reviewed roster and exact ordered maps; mismatched halves cannot qualify',()=>{
 const {history}=require('../scripts/pickfinder-public-model-validation.cjs');
 const reviewed=require('../config/esports/pickfinder-series-review-2026-11-27.json');
 const player=require('../config/esports/pickfinder-dota-player-review-2026-11-27.json');
 const native=history(require('node:path').resolve(__dirname,'..'),'../pickfinder-public-identity-v1/dota-match-receipts');
 // A shallow CI checkout can lack the history used by the production replay; use independently immutable receipts
 // closest to the review in that case, with the fixture clock just before the review.
 const path=require('node:path'),fs=require('node:fs'),dir=path.resolve(__dirname,'../research/pickfinder-public-identity-v1/dota-match-receipts');
 const fallback=()=>fs.readdirSync(dir).filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).map(f=>{
  const raw=fs.readFileSync(path.join(dir,f)),digest=require('node:crypto').createHash('sha256').update(raw).digest('hex');
  a.equal(digest,f.slice(0,64));return {doc:JSON.parse(raw),digest,first:player.reviewedAt};
 })
  .filter(x=>Date.parse(x.doc.observedAt)<=Date.parse(player.reviewedAt));
 const input=native.some(r=>Date.parse(r.first)<=Date.parse(player.reviewedAt))?native:fallback();
 const clock=player.reviewedAt,r=reconcile(input,clock,reviewed,player);
 a.equal(r.summary.qualifiedHistoricalTeamStats,8);a.equal(r.playerFacts.length,160);a.equal(r.summary.distinctPlayers,20);
 a.deepEqual(r.summary.playerByMarket,{kills:40,deaths:40,assists:40,killsPlusAssists:40});
 const changed=structuredClone(player);changed.maps[0].sides[0][0].kda[0]++;
 const bad=reconcile(input,clock,reviewed,changed);
 a.equal(bad.summary.qualifiedHistoricalTeamStats,8);a.equal(bad.playerFacts.length,80);
 a.equal(reconcile(input,'2026-11-26T00:00:00Z',reviewed,player).playerFacts.length,0);
});
