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

test('page callback is awaited before further navigation, including incomplete observations',async()=>{
 const seen=[];const input=await collect(session([active,{...active,number:1,total:2,rows:[row]},{...active,number:2,total:2,rows:[{...row,detailId:'b'}]}]),{book:'prizepicks',code:'NHL',onPage:async s=>{seen.push([s.page.number,s.accepted]);}});
 assert.deepEqual(seen,[[1,true],[2,true]]);assert.equal(input.lastPageReached,true);
 const wrong={...row,apps:[],appEvidence:[]};const a=await collect(session([active,...Array.from({length:8},()=>({...active,number:1,total:2,rows:[wrong]}))]),{book:'prizepicks',code:'NHL',onPage:async s=>seen.push([s.page.number,s.accepted])});
 assert.deepEqual(seen.at(-1),[1,false]);assert.equal(a.boardState,'partial');
});
test('remote page journal survives a concurrent private write and a later browser failure',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
 const {createJournal}=require('../scripts/pickfinder-page-journal.cjs');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-journal-')),remote=path.join(tmp,'remote.git'),local=path.join(tmp,'local'),other=path.join(tmp,'other');
 const git=(cwd,args)=>execFileSync('git',['-C',cwd,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid',...args],{stdio:['ignore','pipe','pipe']}).toString().trim();
 const prior=process.env.RESTRICTED_DESTINATION_VERIFIED;
 try{
  git(tmp,['init','--bare','--initial-branch=main',remote]);git(tmp,['clone',remote,local]);
  fs.writeFileSync(path.join(local,'README'),'fixture');git(local,['add','README']);git(local,['commit','-m','initial']);git(local,['push','origin','main']);git(tmp,['clone',remote,other]);
  process.env.RESTRICTED_DESTINATION_VERIFIED='1';
  const j=createJournal({root:local,day:'2026-11-25',slot:'manual',attempt:'fixture',book:'prizepicks',sport:'nhl',interval:2,log:()=>{}});
  const page=n=>({book:'prizepicks',sport:'nhl',startedAt:'2026-11-25T10:00:00Z',displayedPageCount:3,accepted:true,page:{number:n,rows:[{...row,detailId:'fixture-'+n}]}});
  await j.append(page(1));assert.equal(j.status().pending,1);
  fs.writeFileSync(path.join(other,'other'),'concurrent');git(other,['add','other']);git(other,['commit','-m','concurrent']);git(other,['push','origin','main']);
  await j.append(page(2));assert.equal(j.status().verified,2);
  await j.append(page(3));await j.flush();assert.equal(j.status().verified,3);
  const files=git(local,['ls-tree','-r','--name-only','FETCH_HEAD']).split('\n');
  assert.equal(files.filter(f=>f.startsWith('research/pickfinder-page-journal/')).length,3);assert.ok(files.includes('other'));assert.equal(git(local,['status','--porcelain']),'');
  await assert.rejects(j.append(page(3)),/scope/);
 }finally{if(prior===undefined)delete process.env.RESTRICTED_DESTINATION_VERIFIED;else process.env.RESTRICTED_DESTINATION_VERIFIED=prior;fs.rmSync(tmp,{recursive:true,force:true});}
});
