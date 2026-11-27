'use strict';
const t=require('node:test'),a=require('node:assert/strict'),{build}=require('../scripts/public-prizepicks-model-rankings.cjs');
const clock='2026-11-25T16:30:00Z',observedAt='2026-11-25T16:27:00Z',first='2026-11-25T16:28:00Z',forecastAt='2026-11-25T16:29:00Z',startAt='2026-11-25T22:00:00Z',h='a'.repeat(64),rev='b'.repeat(40);
const offer={sport:'nba',book:'prizepicks',player:'Fixture Player',eventId:'event',detailId:'detail',market:'player_points',line:20.5,side:'Higher',tier:'standard',observedAt,startAt};
const p={book:'prizepicks',playerId:1,gameId:2,sourceEventId:offer.eventId,sourceDetailId:offer.detailId,sourceManifestDigest:h,sourceObservedAt:observedAt,identityEvidenceSha256:h,reviewCommit:rev,modelRevision:rev,market:'points',line:20.5,offeredSide:'Higher',tier:'standard',gameStartAt:startAt,rawSelectedEstimate:.63,projection:22,researchOnly:true,modelApproved:false,originalPlatformVerified:false,probabilityConditionalOnDecided:true};
function fixture(o=offer,ps=[p],invalid=[]){
 const quotes=[{...o,book:'draftkings',quoteLine:20.5,price:'-110',side:'Higher'},{...o,book:'draftkings',quoteLine:20.5,price:'-110',side:'Lower'}];
 return {clock,archive:{invalid,latest:[{m:{book:'prizepicks',sport:'nba',authenticated:true,boardState:'populated',pageTraversalComplete:true,lastPageReached:true,health:{wrongSport:0,priceConflictKeys:0},firstObservedAt:observedAt,lastObservedAt:observedAt},digest:h,first,offers:[o],sportsbookQuotes:quotes}]},forecasts:[{digest:h,commit:rev,first:forecastAt,doc:{kind:'pickfinder_public_nba_shadow_forecasts_v1',generatedAt:forecastAt,rows:ps}}],grades:[]};
}
t('rank exact eligible frozen PrizePicks research separately by tier; two-sided quote is separate',()=>{const d=build(fixture());a.equal(d.rows.length,1);a.equal(d.rows[0].rawConditionalEstimate,.63);a.equal(d.rows[0].marketEstimate,null);a.equal(d.rows[0].marketBenchmarkSourceClockVerified,false);a.equal(d.rows[0].rankWithinTier,1);a.equal(d.rows[0].expectedValue,null);a.equal(d.modelApproved,false);});
t('withhold stale, changed, missing-clock, wrong-book and unreviewed observations',()=>{for(const x of [fixture({...offer,line:21.5}),fixture({...offer,startAt:null}),fixture({...offer,observedAt:'2026-11-25T15:00:00Z'}),fixture({...offer,book:'underdog'}),fixture(offer,[{...p,identityEvidenceSha256:null}]),fixture(offer,[{...p,book:'underdog'}]),fixture(offer,[p],[h]),fixture({...offer,period:'1Q'}),fixture(offer,[{...p,gameStartAt:'2026-11-25T16:35:00Z'}])])a.equal(build(x).rows.length,0);});
t('deduplicate same forecast and report missing sports rather than rank unavailable models',()=>{const d=build(fixture(offer,[p,p]));a.equal(d.rows.length,1);a.equal(d.excluded.duplicate_forecast,1);a.equal(d.bySport.nhl.rankedRows,0);a.equal(d.bySport.nhl.reason,'no_public_model_adapter_output');});

t('reject partial, wrong-sport, conflicted or out-of-window board evidence',()=>{
 for(const change of [{boardState:'partial'},{pageTraversalComplete:false},{authenticated:false},
  {lastPageReached:false},{health:{wrongSport:1,priceConflictKeys:0}},{health:{wrongSport:0,priceConflictKeys:1}},
  {lastObservedAt:'2026-11-25T16:29:00Z'}]){
  const f=fixture();Object.assign(f.archive.latest[0].m,change);
  const r=build(f);a.equal(r.rows.length,0);a.equal(r.bySport.nba.reason,'no_current_complete_partition');
 }
});
t('only a unique complete synchronized other-platform exact offer counts',()=>{
 const f=fixture(),b=f.archive.latest[0];
 const u={...b,m:{...b.m,book:'underdog'},offers:[{...offer,book:'underdog'}]};
 f.archive.latest.push(u);
 a.equal(build(f).rows[0].exactOtherPlatformObservations,1);
 u.offers[0].tier='goblin';a.equal(build(f).rows[0].exactOtherPlatformObservations,0);
 u.offers[0].tier='standard';u.offers.push(u.offers[0]);a.equal(build(f).rows[0].exactOtherPlatformObservations,0);
});
t('publish a no-vig number only when both prices have one qualifying source clock',()=>{
 const f=fixture(),quoteRows=f.archive.latest[0].sportsbookQuotes;
 for(const quote of quoteRows){
  quote.sourceQuoteTimeBasis='provider_quote_time_element';
  quote.sourceQuoteDateTime='2026-11-25T08:26:00-08:00';
 }
 let r=build(f).rows[0];
 a.equal(r.marketEstimate,.5);a.equal(r.marketBenchmarkSourceClockVerified,true);
 quoteRows[1].sourceQuoteDateTime='2026-11-25T08:26:01-08:00';
 r=build(f).rows[0];
 a.equal(r.marketEstimate,null);a.equal(r.marketBenchmarkSourceClockVerified,false);
});
