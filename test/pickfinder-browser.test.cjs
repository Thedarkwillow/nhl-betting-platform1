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

test('stale page with a changing price is not accepted as page progress',async()=>{
 const old={...row,apps:row.apps.map(a=>({...a,displayedPrice:'-115'}))};
 const input=await collect(session([active,{...active,number:1,total:2,rows:[row]},{...active,number:2,total:2,rows:[old]},{...active,number:2,total:2,rows:[{...row,detailId:'new'}]}]),{book:'prizepicks',code:'NHL'});
 assert.equal(input.pages[1].rows[0].detailId,'new');assert.equal(input.lastPageReached,true);
});

test('quote threshold requires an isolated sportsbook and its own visible description',()=>{
 const {readBoard}=require('../scripts/pickfinder-browser.cjs');
 const prior=global.document;
 const attr=(attrs={})=>k=>attrs[k]??null;
 const tooltip={innerText:'DraftKings Line 6.5',getAttribute:attr({role:'tooltip'}),getClientRects:()=>[{}]};
 const icon={alt:'DraftKings'},other={alt:'FanDuel'};
 const group={innerText:'Over −110; Under +105',getAttribute:attr({'aria-describedby':'quote'}),querySelectorAll:s=>s==='img[alt]'?[icon]:[]};
 const cell={querySelectorAll:s=>s==='img[alt]'?[icon]:[],innerText:'Over −110; Under +105'};
 icon.parentElement=group;group.parentElement=cell;
 const a={href:'https://www.pickfinder.app/players/nba/fixture?prop=x:points:e:5.5',innerText:'Fixture',querySelector:()=>({innerText:'Fixture'})};
 const tr={querySelector:()=>a,querySelectorAll:()=>[],cells:[cell]};
 const table={querySelectorAll:s=>s==='th'?[{innerText:'Apps'}]:s==='tbody tr'?[tr]:[],innerText:''};
 const args={book:'prizepicks',code:'NBA',sport:'nba',observedAt:'2026-11-26T20:00:00Z'};
 try{
  global.document={body:{innerText:'Premium'},querySelector:s=>s==='table'?table:s==='button[aria-label="Open user menu"]'?{}:null,getElementById:()=>tooltip};
  const read=()=>readBoard(args).rows[0].sportsbookEvidence.find(e=>e.book==='draftkings').prices;
  assert.deepEqual(read(),[{side:'Higher',price:'-110',quoteLine:6.5},{side:'Lower',price:'+105',quoteLine:6.5}]);
  tooltip.getClientRects=()=>[];assert.ok(read().every(p=>p.quoteLine===null));
  tooltip.getClientRects=()=>[{}];tooltip.innerText='FanDuel Line 6.5';assert.ok(read().every(p=>p.quoteLine===null));
  const quoteTime='2026-11-26T19:58:00Z',gameTime='2026-11-26T21:00:00Z';
  const qtime={getAttribute:attr({'aria-label':'Sportsbook Quote Time',datetime:quoteTime}),getClientRects:()=>[{}],closest:()=>cell};
  const gtime={getAttribute:attr({'aria-label':'Game Start',datetime:gameTime}),closest:()=>null};
  tr.querySelectorAll=()=>[qtime,gtime];
  group.querySelectorAll=s=>s==='img[alt]'?[icon]:s==='time[datetime]'?[qtime]:[];
  group.innerText='Over 6.5 −110; Under 6.5 +105';
  assert.ok(read().every(p=>p.sourceQuoteDateTime===quoteTime&&p.sourceQuoteTimeBasis==='provider_quote_time_element'));
  assert.equal(readBoard(args).rows[0].startAt,gameTime);
  group.innerText='Line 6.5; Over −110; Under +105';
  assert.ok(read().every(p=>p.quoteLine===6.5&&p.sourceQuoteDateTime===quoteTime));
  // A tooltip-only line or a clock merely labeling an update can't bind both prices.
  group.innerText='Over −110; Under +105';tooltip.innerText='DraftKings Line 6.5';
  assert.ok(read().every(p=>p.quoteLine===6.5&&!p.sourceQuoteDateTime));
  group.innerText='Over 6.5 −110; Under 6.5 +105';
  qtime.getAttribute=attr({'aria-label':'Updated',datetime:quoteTime});
  assert.ok(read().every(p=>!p.sourceQuoteDateTime));
  // When a badge sits in a multi-book cell with no separate quote group, do not reuse its price text.
  icon.parentElement=cell;other.parentElement=cell;cell.querySelectorAll=s=>s==='img[alt]'?[icon,other]:[];
  assert.deepEqual(read(),[]);
 }finally{if(prior===undefined)delete global.document;else global.document=prior;}
});

test('archive retains the visible prop matchup and local clock without inventing an event timestamp',()=>{
 const {readBoard}=require('../scripts/pickfinder-browser.cjs');
 const {cleanBoard,splitBoard}=require('../scripts/pickfinder-public-runner.cjs');
 const old=global.document,observedAt='2026-11-27T06:50:00Z',label='PHI @ IND • Fri @ 4:30PM';
 const a={href:'https://www.pickfinder.app/players/nba/edgecombe?prop=fixture:player_assists:event:4',
   innerText:'VJ Edgecombe',querySelector:()=>({innerText:'VJ Edgecombe'})};
 const gameCell={innerText:label.replace(' • ',' •\n')};
 const tr={querySelector:()=>a,querySelectorAll:()=>[],cells:[gameCell]};
 const table={innerText:'',querySelectorAll:s=>s==='tbody tr'?[tr]:[]};
 try{
  global.document={body:{innerText:'Premium'},querySelector:s=>s==='table'?table:null};
  const read=()=>readBoard({book:'prizepicks',code:'NBA',sport:'nba',observedAt}).rows[0];
  const row=read();
  const {parts}=splitBoard(cleanBoard({schema:'pickfinder-premium-export-v1',boardState:'partial',
    localDay:'2026-11-26',slot:'manual',book:'prizepicks',sport:'nba',startedAt:observedAt,endedAt:observedAt,pages:[{number:1,rows:[row]}]}));
  const fields=parts.find(p=>p.field==='researchObservations').rows;
  const saved=fields.find(f=>f.metric==='Displayed Matchup and Time');
  assert.equal(saved.value,label);assert.equal(saved.startAt,null);assert.equal(saved.eventId,'event');
  assert.match(saved.detailId,/player_assists:event:4/);
  assert.equal(fields.find(f=>f.metric==='Opponent').value,'IND');
  a.innerText+='\nPHI @ IND • Sat @ 4:30PM';
  assert.ok(read().research.every(f=>f.metric!=='Displayed Matchup and Time'));
 }finally{if(old===undefined)delete global.document;else global.document=old;}
});

test('compact prop card binds the line below the offer to one exact board link',()=>{
 const {readCompactBoardClocks}=require('../scripts/pickfinder-browser.cjs');
 const oldDoc=global.document,oldLoc=global.location,sport='nba',observedAt='2026-11-27T08:30:00Z';
 const a={href:'https://www.pickfinder.app/players/nba/edgecombe?prop=fixture:player_assists:event:4',innerText:'VJ Edgecombe (SG)',getClientRects:()=>[1],querySelectorAll:()=>[]};
 const card={innerText:'VJ Edgecombe (SG)\nO/U 4 Assists\nPHI @ IND •\nFri @ 4:30PM\nDefense\n#15',getClientRects:()=>[1],querySelectorAll:()=>[a]};
 a.parentElement=card;
 try{
  global.location={origin:'https://www.pickfinder.app',pathname:'/props'};
  global.document={body:{innerText:'Premium'},querySelector:()=>null,querySelectorAll:s=>s.includes('password')?[]:[a]};
  assert.equal(readCompactBoardClocks({sport,observedAt}).records.length,0);
  const read=()=>readCompactBoardClocks({sport,observedAt,authenticatedContextVerified:true});
  const r=read().records[0];assert.equal(r.player,'VJ Edgecombe');assert.equal(r.market,'player_assists');assert.equal(r.threshold,4);
  assert.equal(r.eventId,'event');assert.equal(r.displayedMatchupLabel,'PHI @ IND • Fri @ 4:30PM');
  assert.equal(r.startAt,null);assert.equal(r.sourceBook,null);
  card.innerText=card.innerText.replace('4 Assists','4.5 Assists');assert.equal(read().records.length,0);
  card.innerText=card.innerText.replace('4.5 Assists','4 Assists');
  card.querySelectorAll=()=>[a,{...a,href:a.href.replace('event:4','event:5')}];assert.equal(read().records.length,0);
  global.location.pathname='/players/nba/edgecombe';assert.equal(read().records.length,0);
 }finally{
  if(oldDoc===undefined)delete global.document;else global.document=oldDoc;
  if(oldLoc===undefined)delete global.location;else global.location=oldLoc;
 }
});

test('bounded recovery walks past stable badge-less pages without attributing those offers',async()=>{
 const gap={...row,detailId:'gap',apps:[],appEvidence:[]};
 const page=session([active,{...active,number:1,total:3,rows:[row]},
  ...Array.from({length:8},()=>({...active,number:2,total:3,rows:[gap]})),
  {...active,number:3,total:3,rows:[{...row,detailId:'last'}]}]);
 const base=page.getByRole;
 page.getByRole=(kind,opts)=>opts?.name==='Apps prizepicks'?{waitFor:async()=>{},count:async()=>1,isVisible:async()=>true}:base(kind,opts);
 const seen=[];
 const batch=await collect(page,{book:'prizepicks',code:'NHL',auditTraversal:true,onPage:s=>seen.push([s.page.number,s.accepted])});
 assert.deepEqual(seen,[[1,true],[2,false],[3,true]]);
 assert.equal(batch.lastPageReached,true);
 assert.equal(batch.boardState,'partial');
 assert.equal(batch.traversalAudit.lastPageTraversalVerified,true);
 assert.deepEqual(batch.traversalAudit.bookGapPages,[2]);
 assert.equal(normalize(batch).pageTraversalComplete,false);
 assert.equal(normalize(batch).offers.length,2);
});
test('recovery retains first page and actionable diagnostics on a failed pager action',async()=>{
 const page=session([active,{...active,number:1,total:3,rows:[row]}]),base=page.getByRole;
 page.getByRole=(kind,opts)=>opts?.name==='Apps prizepicks'?{waitFor:async()=>{},count:async()=>1,isVisible:async()=>true}:
  opts?.name==='Next page'?{click:async()=>{throw Error('detached pager')}}:base(kind,opts);
 const batch=await collect(page,{book:'prizepicks',code:'NHL',auditTraversal:true});
 assert.equal(batch.failure,'next_page_click_failed');
 assert.equal(batch.pageFailureDiagnostics.expectedPage,2);
 assert.equal(batch.pages.length,1);
 assert.equal(batch.traversalAudit.lastPageTraversalVerified,false);
 const n=require('../scripts/pickfinder-public-runner.cjs').cleanBoard(batch);
 assert.equal(n.recoveryTraversal.stopReason,'next_page_click_failed');
 assert.equal(n.recoveryTraversal.pageFailure.observedPage,1);
 assert.equal(n.rawHtmlPublished,false);
});
test('recovery refuses even an apparently empty pager if the selected-book state was lost',async()=>{
 const page=session([active,...Array.from({length:4},()=>({...active,empty:true,rows:[]}))]),base=page.getByRole;
 page.getByRole=(kind,opts)=>opts?.name==='Apps prizepicks'?{waitFor:async()=>{},count:async()=>1,isVisible:async()=>false}:base(kind,opts);
 const batch=await collect(page,{book:'prizepicks',code:'NHL',auditTraversal:true});
 assert.equal(batch.failure,'selected_book_control_not_confirmed');assert.equal(batch.boardState,'partial');
 assert.equal(batch.explicitEmpty,undefined);
});
test('recovery selects only the visible pager bound to the current markers',async()=>{
 const {advanceBoundPager}=require('../scripts/pickfinder-browser.cjs');
 const checked=[],clicked=[];
 const page={locator:s=>{
  assert.equal(s,'button[aria-label="Next page"]:visible');
  return {evaluateAll:async()=>[{page:1,total:4,disabled:false},{page:1,total:5,disabled:false}],nth:i=>{
   checked.push(i);
   return {elementHandle:async()=>({evaluate:async()=>[{page:1,total:5,disabled:false}],isVisible:async()=>true,isEnabled:async()=>true,click:async()=>{clicked.push(i)},dispose:async()=>{}})};
  }};
 }};
 const r=await advanceBoundPager(page,1,5);
 assert.equal(r.ok,true);assert.deepEqual(checked,[1]);assert.deepEqual(clicked,[1]);
 assert.equal((await advanceBoundPager(page,2,5)).reason,'no_bound_visible_pager');
});
test('recovery does not click a disabled, ambiguous or changed pager',async()=>{
 const {advanceBoundPager}=require('../scripts/pickfinder-browser.cjs');let probes=[{page:1,total:5,disabled:true}],calls=0;
 const q={evaluateAll:async()=>calls?[{page:2,total:5,disabled:false}]:probes,nth:()=>{calls++;return {elementHandle:async()=>({isVisible:async()=>true,click:async()=>assert.fail('changed pager clicked'),dispose:async()=>{}})};}};
 const page={locator:()=>q};
 assert.equal((await advanceBoundPager(page,1,5)).reason,'bound_pager_disabled');
 probes=[{page:1,total:5,disabled:false},{page:1,total:5,disabled:false}];
 assert.equal((await advanceBoundPager(page,1,5)).reason,'ambiguous_bound_pager');
 assert.equal(calls,0);
 probes=probes.slice(0,1);
 assert.equal((await advanceBoundPager(page,1,5)).reason,'bound_pager_marker_changed');
});
test('visible pager accepts an unambiguous counter in its nearest surrounding group',()=>{
 const {inspectPagerControls}=require('../scripts/pickfinder-browser.cjs');
 const prev=global.document,body={};global.document={body};
 try{
  const next={disabled:false,hidden:false,getClientRects:()=>[{}],getAttribute:()=>null};
  const group=(text,parent,buttons=[next])=>({innerText:text,parentElement:parent,querySelector:()=>null,querySelectorAll:()=>buttons});
  const footer=group('Page 1 / 5',body);
  next.parentElement=group('',footer);
  assert.deepEqual(inspectPagerControls([next]),[{page:1,total:5,markerLevel:1,disabled:false}]);
  footer.innerText='Page 1 / 5 Page 1 / 6';
  assert.equal(inspectPagerControls([next])[0].page,null);
 }finally{global.document=prev;}
});

test('recovery tolerates unrelated inventory changes but never clicks a swapped or disabled node',async()=>{
 const {advanceBoundPager}=require('../scripts/pickfinder-browser.cjs');
 let pinned={page:1,total:5,disabled:false},enabled=true,visible=true,reads=0,clicks=0,disposals=0;
 const q={evaluateAll:async()=>++reads%2?[pinned.page===1?pinned:{page:1,total:5,disabled:false}]:[{page:4,total:7,disabled:false},{page:1,total:5,disabled:false}],
  nth:()=>({elementHandle:async()=>({evaluate:async()=>[pinned],isVisible:async()=>visible,isEnabled:async()=>enabled,click:async()=>{clicks++},dispose:async()=>{disposals++}})})};
 const page={locator:()=>q};
 assert.equal((await advanceBoundPager(page,1,5)).reason,'bound_pager_clicked');
 enabled=false;
 assert.equal((await advanceBoundPager(page,1,5)).reason,'bound_pager_effectively_disabled');
 enabled=true;pinned={page:4,total:7,disabled:false};
 assert.equal((await advanceBoundPager(page,1,5)).reason,'bound_pager_marker_changed');
 visible=false;
 assert.equal((await advanceBoundPager(page,1,5)).reason,'bound_pager_lost_visibility');
 assert.equal(clicks,1);
 assert.equal(disposals,4);
});
