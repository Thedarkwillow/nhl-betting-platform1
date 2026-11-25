'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {collect}=require('../scripts/pickfinder-browser.cjs');
const {normalize}=require('../scripts/pickfinder-premium-archive.cjs');
function session(snapshots){
  const control={click:async()=>{},isEnabled:async()=>true,waitFor:async()=>{},getByRole:()=>control};
  return {getByRole:()=>control,waitForFunction:async()=>{},evaluate:async(_fn,params)=>{
    const state=snapshots.shift();assert.ok(state,'unexpected board read');
    return {...state,rows:(state.rows||[]).map(row=>({...row,observedAt:params.observedAt}))};
  }};
}
const row={detailId:'a',player:'fixture',market:'points',sport:'nhl',
 apps:[{book:'underdog',line:2,side:'Higher',displayedPrice:'-200'},{book:'prizepicks',line:2,side:'Higher',displayedPrice:'-110'}]};
const active={authenticated:true};
test('missing paid session fails closed',async()=>{
 await assert.rejects(collect(session([{authenticated:false}]),{book:'underdog',code:'NHL'}),/premium_session_unavailable/);
});
test('expiry preserves observed page and partial status',async()=>{
 const input=await collect(session([active,{...active,number:1,total:2,rows:[row]},{authenticated:false}]),{book:'prizepicks',code:'NHL'});
 assert.equal(input.failure,'session_expired');assert.equal(input.lastPageReached,false);
 assert.equal(input.boardState,'partial');assert.equal(normalize(input).offers[0].displayedPrice,'-110');
});
test('duplicate across two pages is reconciled and manual observations never qualify for either hour',async()=>{
 const input=await collect(session([active,{...active,number:1,total:2,rows:[row]},
 {...active,number:2,total:2,rows:[{...row,detailId:'b'},row]}]),{book:'underdog',code:'NHL'});
 const r=normalize(input);assert.equal(r.offers.length,2);assert.equal(r.health.repeatOrUnresolvedLinks,1);
 assert.equal(r.withinSlot,false);assert.equal(r.fullBoardCertified,false);assert.equal(r.offers[0].displayedPrice,'-200');
});

test('stable authenticated explicit empty board with no pager is not a failure',async()=>{const input=await collect(session([active,...Array.from({length:4},()=>({...active,empty:true,rows:[]}))]),{book:'prizepicks',code:'NHL'});assert.equal(input.boardState,'empty');assert.equal(input.explicitEmpty,true);assert.equal(input.authenticated,true);assert.equal(normalize(input).health.appearances,0);});

test('full traversal goes beyond 500 pages and archives all pages',async()=>{
 const total=625,snapshots=[active,...Array.from({length:total},(_,i)=>({...active,number:i+1,total,rows:[{...row,detailId:'fixture-'+(i+1)}]}))];
 const input=await collect(session(snapshots),{book:'underdog',code:'NHL'});
 const output=normalize(input);
 assert.equal(input.pages.length,total);assert.equal(input.lastPageReached,true);assert.equal(output.pageTraversalComplete,true);assert.equal(output.offers.length,total);assert.equal(output.fullBoardCertified,false);
});
test('explicit sampling remains bounded and does not claim completeness',async()=>{
 const input=await collect(session([active,{...active,number:1,total:999,rows:[row]},{...active,number:2,total:999,rows:[{...row,detailId:'b'}]}]),{book:'underdog',code:'NHL',maxPages:2});
 assert.equal(input.pages.length,2);assert.equal(input.lastPageReached,false);assert.equal(normalize(input).pageTraversalComplete,false);
});

test('missing selected-book badge is retained as partial, never certified as offers',async()=>{const wrong={...row,apps:[],appEvidence:[]};const input=await collect(session([active,...Array.from({length:8},()=>({...active,number:1,total:2,rows:[wrong]}))]),{book:'prizepicks',code:'NHL'});assert.equal(input.failure,'selected_book_badge_absent');assert.equal(input.pages.length,1);assert.equal(input.boardState,'partial');assert.equal(normalize(input).offers.length,0);});
test('same first link with distinct page contents still advances',async()=>{const input=await collect(session([active,{...active,number:1,total:2,rows:[row,{...row,detailId:'b'}]},{...active,number:2,total:2,rows:[row,{...row,detailId:'c'}]}]),{book:'prizepicks',code:'NHL'});assert.equal(input.lastPageReached,true);assert.equal(input.pages.length,2);});
