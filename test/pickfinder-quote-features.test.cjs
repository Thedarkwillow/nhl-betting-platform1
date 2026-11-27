'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{extractQuotes,comparator,noVigHigher}=require('../scripts/pickfinder-quote-features.cjs'),{coverage}=require('../scripts/pickfinder-research-coverage.cjs');
test('individual prices preserve unknown threshold and reject incomplete or conflicting comparison',()=>{
const now='2026-11-25T12:30:00Z',row={sport:'nba',detailId:'/players/a',eventId:'event',market:'points',observedAt:now,sportsbookEvidence:[{book:'draftkings',displayedBookLabel:'DraftKings',prices:[{side:'Higher',price:'-110',quoteLine:5.5},{side:'Lower',price:'-110',quoteLine:5.5}]},{book:null,displayedBookLabel:'Other',prices:[{side:'Higher',price:'+120'}]}]};
const q=extractQuotes(row);assert.equal(q.length,3);assert.equal(q[2].quoteLine,null);
const offer={...row,line:5.5,gameStartAt:'2026-11-25T19:00:00Z',playerId:'p',gameId:'g'},crosswalk={independentReviewVerified:true,sourceDetailId:row.detailId,sourceEventId:'event',nativePlayerId:'p',nativeEventId:'g',verifiedAt:now};
const a={offer,quotes:q,crosswalk,forecastAt:now};assert.equal(comparator(a)[0].aggregatorNoVigHigher,.5);assert.equal(comparator({...a,crosswalk:null}).length,0);assert.equal(comparator({...a,offer:{...offer,line:6.5}}).length,0);assert.equal(comparator({...a,quotes:[...q,{...q[0],price:'-120'}]}).length,0);
});
test('no-vig requires valid explicit American prices on both sides',()=>{
 assert.equal(noVigHigher('-115','-115'),.5);
 assert.ok(Math.abs(noVigHigher('+120','-140')-60/137)<1e-10);
 for(const price of [-120,null,'100','EVEN','+99']) assert.equal(noVigHigher(price,'-120'),null);
});
test('sport checklist distinguishes missing and observed labels',()=>{const c=coverage('valorant',[{tab:'First Bloods',value:'5'}]);assert.equal(c.first_bloods.state,'observed_label_and_value');assert.equal(c.agents.state,'not_observed');});

test('public source-clock quote benchmark requires a synchronized, exact, nonconflicting sportsbook snapshot',()=>{
 const {sourceClockQuotes}=require('../scripts/pickfinder-public-evidence-audit.cjs');
 const cut='2026-11-27T20:05:00Z',observedAt='2026-11-27T20:04:00Z';
 const offer={sport:'nba',detailId:'/players/nba/a?prop=x:points:e:12.5',eventId:'e',market:'points',line:12.5};
 const base={...offer,quoteLine:12.5,book:'fanduel',observedAt,sourceQuoteTimeBasis:'provider_quote_time_element'};
 const h={...base,side:'Higher',price:'-120',sourceQuoteDateTime:'2026-11-27T12:03:00-08:00'};
 const l={...base,side:'Lower',price:'+110',sourceQuoteDateTime:'2026-11-27T20:03:00Z'};
 assert.deepEqual(sourceClockQuotes(offer,[h,l],cut),[{book:'fanduel',observedAt:'2026-11-27T20:04:00.000Z',sourceQuoteAt:'2026-11-27T20:03:00.000Z',
  higher:noVigHigher('-120','+110'),sourceClockVerified:true,originalPlatformVerified:false,modelInputsApproved:false}]);
 for(const change of [
  {observedAt:'2026-11-27T20:04:01Z'},{sourceQuoteDateTime:'2026-11-27T20:03:01Z'},
  {sourceQuoteDateTime:'2026-11-27T20:03:00'},{sourceQuoteDateTime:'2026-11-27T20:03:00-00:00'},
  {sourceQuoteDateTime:'2026-11-31T20:03:00Z'},{sourceQuoteDateTime:'2026-11-27T20:06:00Z'},
  {sourceQuoteTimeBasis:'browser_observation'},{sourceQuoteTimeBasis:null},{book:'prizepicks'},{book:'unknown'},
  {quoteLine:13.5},{gameMode:'rival'},{detailId:'/players/nba/who'},{eventId:'else'}
 ])assert.deepEqual(sourceClockQuotes(offer,[h,{...l,...change}],cut),[]);
 assert.deepEqual(sourceClockQuotes(offer,[h,l],cut,60000),[]);
 for(const observedAt of ['2026-11-27T20:04:00Z','2026-11-27T20:04:30Z']){
  const conflict={...h,price:'-160',observedAt};
  assert.deepEqual(sourceClockQuotes(offer,[h,l,conflict],cut),[]);
  assert.deepEqual(sourceClockQuotes(offer,[conflict,h,l],cut),[]);
 }
 const newerUnpaired={...h,sourceQuoteDateTime:'2026-11-27T20:03:30Z'};
 assert.deepEqual(sourceClockQuotes(offer,[h,l,newerUnpaired],cut),[]);
});

test('source clock provenance survives quote normalization only when explicit and no later than the capture',()=>{
 const t='2026-11-27T20:03:00Z',observedAt='2026-11-27T20:04:00Z';
 const h={side:'Higher',price:'-110',quoteLine:12.5,sourceQuoteDateTime:t,sourceQuoteTimeBasis:'provider_quote_time_element'};
 const row={sport:'nba',detailId:'/players/nba/a',eventId:'a',market:'points',observedAt,
  sportsbookEvidence:[{displayedBookLabel:'FanDuel',book:'fanduel',prices:[h,{...h,side:'Lower',sourceQuoteDateTime:'2026-11-27T20:06:00Z'}]}]};
 const [got,future]=extractQuotes(row);
 assert.equal(got.sourceQuoteDateTime,t);assert.equal(got.sourceQuoteTimeBasis,'provider_quote_time_element');
 assert.equal(future.sourceQuoteDateTime,undefined);
});
