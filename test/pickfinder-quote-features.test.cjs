'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{extractQuotes,comparator}=require('../scripts/pickfinder-quote-features.cjs'),{coverage}=require('../scripts/pickfinder-research-coverage.cjs');
test('individual prices preserve unknown threshold and reject incomplete or conflicting comparison',()=>{
const now='2026-11-25T12:30:00Z',row={sport:'nba',detailId:'/players/a',eventId:'event',market:'points',observedAt:now,sportsbookEvidence:[{book:'draftkings',displayedBookLabel:'DraftKings',prices:[{side:'Higher',price:'-110',quoteLine:5.5},{side:'Lower',price:'-110',quoteLine:5.5}]},{book:null,displayedBookLabel:'Other',prices:[{side:'Higher',price:'+120'}]}]};
const q=extractQuotes(row);assert.equal(q.length,3);assert.equal(q[2].quoteLine,null);
const offer={...row,line:5.5,gameStartAt:'2026-11-25T19:00:00Z',playerId:'p',gameId:'g'},crosswalk={independentReviewVerified:true,sourceDetailId:row.detailId,sourceEventId:'event',nativePlayerId:'p',nativeEventId:'g',verifiedAt:now};
const a={offer,quotes:q,crosswalk,forecastAt:now};assert.equal(comparator(a)[0].aggregatorNoVigHigher,.5);assert.equal(comparator({...a,crosswalk:null}).length,0);assert.equal(comparator({...a,offer:{...offer,line:6.5}}).length,0);assert.equal(comparator({...a,quotes:[...q,{...q[0],price:'-120'}]}).length,0);
});
test('sport checklist distinguishes missing and observed labels',()=>{const c=coverage('valorant',[{tab:'First Bloods',value:'5'}]);assert.equal(c.first_bloods.state,'observed_label_and_value');assert.equal(c.agents.state,'not_observed');});
