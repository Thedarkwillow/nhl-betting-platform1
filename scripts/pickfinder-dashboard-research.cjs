'use strict';
const {traverseNativeFilters,filterLabels}=require('./pickfinder-research-coverage.cjs');
const {traverseCustomFilters}=require('./pickfinder-custom-filters.cjs');
// Capture visible sporting tables and cards only, without account details or actions.
function dashboardRoutes(name){return name==='Games'?['/games','/game-lines']:['/'+name.toLowerCase()];}
async function captureDashboard(page,name){
 if(!['Games','Discrepancies','Popular'].includes(name))throw Error('dashboard scope');
 const url=new URL(page.url());if(url.origin!=='https://www.pickfinder.app'||!dashboardRoutes(name).includes(url.pathname))throw Error('route');
 const snapshot=await page.evaluate(name=>{
  const visible=e=>e.getClientRects().length>0;
  const cell=c=>({text:c.innerText.trim().slice(0,1000),labels:[...c.querySelectorAll('img[alt]')].map(i=>i.alt.slice(0,100))});
  const tables=[...document.querySelectorAll('main table')].filter(visible).map(t=>({headers:[...t.querySelectorAll('thead th')].map(cell),rows:[...t.querySelectorAll('tbody tr')].filter(visible).map(tr=>[...tr.cells].map(cell))}));
  const cards=[...document.querySelectorAll('a[href*="/players/"],main a[href*="/games/"]')].filter(visible).flatMap(a=>{
   const u=new URL(a.href);
   if(u.origin!==location.origin)return [];
   const scopedCard=['Popular','Discrepancies'].includes(name)&&u.searchParams.get('from')===name.toLowerCase()&&
    u.searchParams.get('prop')&&/^View .+ details$/i.test(a.getAttribute('aria-label')||'');
   if(!a.closest('main')&&!scopedCard)return [];
   // Popular and Discrepancies use a textless overlay link inside the sporting card.
   const parent=a.parentElement;
   const body=scopedCard&&parent?.querySelectorAll('a[href*="/players/"]').length===1&&
    parent.querySelectorAll('h1').length===1&&parent.querySelectorAll('h2').length===1?parent:a;
   const text=body.innerText.trim().slice(0,1000);
   if(scopedCard&&!text)return [];
   return [{path:u.pathname,prop:u.searchParams.get('prop'),text,displayedTimes:[...body.querySelectorAll('time[datetime]')].filter(visible).map(t=>({datetime:t.getAttribute('datetime'),label:t.innerText.trim().slice(0,100)}))}];
  });
  const clocks=[...document.querySelectorAll('main time[datetime]')].filter(visible).map(t=>({datetime:t.getAttribute('datetime'),label:t.innerText.trim().slice(0,100)}));
  const controls=[...document.querySelectorAll('main button,main [role=tab],main select')].filter(visible).map(e=>({label:(e.getAttribute('aria-label')||e.innerText||'').trim().slice(0,160),disabled:e.disabled===true||e.getAttribute('aria-disabled')==='true',selected:e.getAttribute('aria-selected')==='true'})).filter(x=>x.label);
  const pagination=[...document.querySelectorAll('main nav,main [aria-label="Pagination"],main [role=status]')].filter(visible).map(e=>e.innerText.trim().match(/\b(?:Page\s+)?(\d+)\s+(?:of|\/)\s+(\d+)\b/i)).filter(Boolean).map(m=>({page:Number(m[1]),total:Number(m[2])}));
  const gameCards=[...document.querySelectorAll('article[data-tour-sport]')].filter(visible).flatMap(a=>{const sport=a.getAttribute('data-tour-sport');if(!/^(nba|nhl|nfl|mlb|wnba|cbb|cfb|cs2|valorant|val|dota2|lol|cod|soccer|tennis)$/i.test(sport||''))return [];const buttons=[...a.querySelectorAll('button[aria-label]')].filter(visible).map(b=>b.getAttribute('aria-label')).filter(t=>/^Matchup details, [A-Za-z0-9 .&'’@/-]{1,100}$/.test(t));return buttons.length?[{sport,matchups:buttons.slice(0,100)}]:[];});
  const empty=[...document.querySelectorAll('main p,main [role=status],p')].filter(visible).some(e=>/^(?:No (?:games|props|results|discrepancies|popular props) (?:found|available)|No (?:games|props|results) to display)\.?$/i.test(e.innerText.trim())||name==='Discrepancies'&&e.innerText.trim()==='Nothing matches these filters. Try another sport or app.');
  const busy=[...document.querySelectorAll('main [aria-busy=true],main [role=progressbar]')].some(visible);
  return {tables,cards,clocks,controls,pagination,gameCards,empty,busy};
 },name);
 return {name,path:url.pathname,observedAt:new Date().toISOString(),...snapshot,originalOffersVerified:false,modelInputsApproved:false};
}

// A game ID appears in the URL only after opening its matchup dialog.
async function captureGameDialogs(page,sport,shouldContinue,onGame){
 const filter=page.getByRole('button',{name:sport,exact:true});
 if(await filter.count()!==1||!await filter.isEnabled())return;
 await filter.click();
 const buttons=page.locator('article[data-tour-sport="'+sport.toLowerCase()+'"]').getByRole('button',{name:/^Matchup details, /});
 try{await buttons.first().waitFor({state:'visible',timeout:2500});}catch{return;}
 const labels=await buttons.evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));
 for(const label of new Set(labels)){
  if(!shouldContinue())break;
  const button=buttons.and(page.getByRole('button',{name:label,exact:true}));
  if(await button.count()!==1)continue;
  await button.click();
  const title=label.slice('Matchup details, '.length);
  const dialog=page.getByRole('dialog',{name:title,exact:true});
  try{
   await dialog.waitFor({state:'visible',timeout:3500});
   const route=new URL(page.url()),ids=route.searchParams.getAll('game');
   if(route.origin!=='https://www.pickfinder.app'||!dashboardRoutes('Games').includes(route.pathname)||ids.length!==1||!/^[\w-]{1,80}$/.test(ids[0]))continue;
   const card=dialog.getByRole('article');
   const evidence=await card.evaluate(el=>{
    const clocks=el.innerText.split('\n').map(x=>x.trim()).filter(x=>/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}\/\d{1,2}, \d{1,2}:\d{2} [AP]M$/.test(x));
    const teams=[...el.querySelectorAll('img[alt]')].slice(0,2).map(i=>i.alt);
    return {teams,displayedClock:clocks.length===1?clocks[0]:null,browserTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
   });
   if(evidence.displayedClock)await onGame({sport,eventId:ids[0],sourceUrl:route.origin+route.pathname+'?game='+encodeURIComponent(ids[0]),matchup:title,...evidence,observedAt:new Date().toISOString()});
  }finally{
   const close=dialog.getByRole('article').getByRole('button',{name:'Close',exact:true});
   if(await close.count()===1)await close.click();else await page.keyboard.press('Escape');
   await dialog.waitFor({state:'hidden',timeout:3500});
  }
 }
}
const pageContent=x=>JSON.stringify([x.tables??[],x.cards??[],x.gameCards??[]]);
function pageMarker(x){
 const scopes=[...new Map((Array.isArray(x.pagination)?x.pagination:[]).map(p=>[p?.page+':'+p?.total,p])).values()];
 const p=scopes.length===1?scopes[0]:null;
 return Number.isSafeInteger(p?.page)&&Number.isSafeInteger(p?.total)&&p.page>0&&p.total>=p.page?p:null;
}
function dashboardState(x){
 const data=(Array.isArray(x.tables)&&x.tables.some(t=>Array.isArray(t?.rows)&&t.rows.length))||
  (Array.isArray(x.cards)&&x.cards.length)||(Array.isArray(x.gameCards)&&x.gameCards.length);
 return x.busy?'loading':data?'data_observed':x.empty===true?'explicit_empty':'unverified';
}
async function readyDashboard(page,name,shouldContinue,{attempts=6,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 let x;for(let i=0;i<attempts&&shouldContinue();i++){x=await captureDashboard(page,name);const state=dashboardState(x);if(state==='data_observed'||state==='explicit_empty')return {...x,dataState:state};if(i+1<attempts&&shouldContinue())await pause(1000);}
 return null;
}
async function traverseDashboard(page,name,{shouldContinue=()=>true,onSnapshot=async()=>{},filterSelection=null,verifySelection=null}={}){
 const seen=new Set(),seenContent=new Set();let pages=0,state='unverified_pagination',expectedPage=1,totalPages=null;
 while(shouldContinue()){
  if(verifySelection&&!await verifySelection()){state='filter_selection_changed';break;}
  const x=await readyDashboard(page,name,shouldContinue);if(!x){state='dashboard_data_unverified';break;}
  if(verifySelection&&!await verifySelection()){state='filter_selection_changed';break;}
  if(!shouldContinue()){state='deadline';break;}
  const p=pageMarker(x);
  const content=pageContent(x);
  const fingerprint=JSON.stringify([p,content]);
  if(seen.has(fingerprint)){state='repeated_page';break;}
  // A click or an updated page marker may arrive before its content. Require
  // distinct content on a continuous first-to-last sequence with a stable total.
  if(expectedPage>1&&(!p||p.page!==expectedPage||p.total!==totalPages)){
   state='pagination_changed_during_traversal';break;
  }
  if(expectedPage>1&&seenContent.has(content)){state='unchanged_page_content';break;}
  seen.add(fingerprint);seenContent.add(content);await onSnapshot({...x,filterSelection,...(verifySelection?{filterSelectionVerified:true}:{})});pages++;
  if(x.dataState==='explicit_empty'){state=expectedPage===1&&(!x.pagination?.length||p?.page===1&&p.total===1)?'explicit_empty_observed':'pagination_changed_during_traversal';break;}
  if(!p){state='pagination_not_explicit';break;}
  if(p.page!==expectedPage){state='first_page_not_observed';break;}
  totalPages=p.total;
  if(p.page===p.total){state='explicit_last_page_observed';break;}
  const next=page.getByRole('button',{name:'Next page',exact:true});
  if(await next.count()!==1||!await next.isVisible()||!await next.isEnabled()){state='next_control_unverified';break;}
  if(!shouldContinue()){state='deadline';break;}
  await next.click();
  // Do not certify a next page based on a click; the next iteration observes it.
  try{await page.waitForFunction(previous=>[...document.querySelectorAll('main nav,main [aria-label="Pagination"],main [role=status]')].some(e=>{const m=e.innerText.match(/\b(?:Page\s+)?(\d+)\s+(?:of|\/)\s+(\d+)\b/i);return m&&Number(m[1])===previous+1;}),p.page,{timeout:8000});}
  catch{state=shouldContinue()?'next_page_unconfirmed':'deadline';break;}
  expectedPage++;
 }
 return {pages,state,completePageSequenceVerified:state==='explicit_last_page_observed',filtersExhausted:false,allDashboardDataVerified:false};
}
// Diagnostic only: distinguish absent controls, portals outside main, and
// controls that lack a safe semantic link. Never publish account text or values.
async function dashboardControlDiagnostics(page,name){
 const u=new URL(page.url());
 if(u.origin!=='https://www.pickfinder.app'||!dashboardRoutes(name).includes(u.pathname))throw Error('dashboard diagnostics route');
 return page.evaluate(allowed=>{
  const norm=x=>String(x||'').trim().toLowerCase().replace(/\s+/g,' ');
  const visible=e=>e.getClientRects().length>0;
  const headers=document.querySelectorAll('main,[role=main]').length;
  const focusables=[...document.querySelectorAll('select,[role=combobox],button,[role=button],th[aria-sort],a[rel=next]')];
  const controls={visibleNativeSelects:0,visibleComboboxes:0,linkedListboxTriggers:0,unlinkedListboxTriggers:0,
   visibleAllowedLabels:0,allowedOutsideMain:0,visibleSortHeaders:0,visiblePagingActions:0};
  const found=new Set();
  for(const e of focusables.filter(visible)){
   const linked=(e.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.innerText||'').join(' ');
   const label=norm(e.getAttribute('aria-label')||linked.trim()||e.getAttribute('title')||e.innerText||'');
   const allowedLabel=allowed.includes(label)||/^(?:sort by|next|previous) (?:page|date|time|line|hit rate|odds)$/.test(label);
   if(e.tagName==='SELECT')controls.visibleNativeSelects++;
   const box=e.getAttribute('role')==='combobox'||e.getAttribute('aria-haspopup')==='listbox';
   if(e.getAttribute('role')==='combobox')controls.visibleComboboxes++;
   if(box)controls[e.getAttribute('aria-controls')?'linkedListboxTriggers':'unlinkedListboxTriggers']++;
   if(e.hasAttribute('aria-sort'))controls.visibleSortHeaders++;
   if(/^(?:next|previous) page$/.test(label)||e.getAttribute('rel')==='next')controls.visiblePagingActions++;
   if(allowedLabel){controls.visibleAllowedLabels++;found.add(label);if(!e.closest('main,[role=main]'))controls.allowedOutsideMain++;}
  }
  return {mainLandmarks:headers,controls,visibleAllowlistedLabels:[...found].sort()};
 },filterLabels);
}
// Read only capability labels; never capture account-specific form values or click submit.
async function inspectCapabilities(page){
 return page.evaluate(()=>{
  const visible=e=>e.getClientRects().length>0;
  const wanted=/^(?:pick builder|line alerts?|alerts?|add pick|remove pick|payout|correlation|create alert|new alert|target line|notification|threshold|sport|market|app|book|higher|lower)$/i;
  return [...document.querySelectorAll('main button,main a,main label,main [role=tab],nav a,nav button')].filter(visible).map(e=>(e.getAttribute('aria-label')||e.innerText||'').trim()).filter(x=>wanted.test(x)).filter((x,i,a)=>a.indexOf(x)===i);
 });
}
// Duplicate desktop/mobile anchors to the same visible destination are not ambiguous.
async function verifiedNavigation(page,name,allowed){
 const candidates=await page.evaluate(({name,allowed})=>{
  const key=s=>s.trim().replace(/\s+/g,' ').toLowerCase();
  return [...document.querySelectorAll('a[href]')].filter(a=>a.getClientRects().length>0).flatMap(a=>{
   const u=new URL(a.href);const label=key(a.getAttribute('aria-label')||a.innerText||'');
   return u.origin===location.origin&&allowed.includes(u.pathname)&&!u.search&&!u.hash&&label===key(name)?[u.href]:[];
  });
 },{name,allowed});
 const unique=[...new Set(candidates)].filter(s=>{try{const u=new URL(s);return u.origin==='https://www.pickfinder.app'&&allowed.includes(u.pathname)&&!u.search&&!u.hash;}catch{return false;}});
 return unique.length===1?unique[0]:null;
}
const dashboardSequenceSchema='pickfinder-public-dashboard-sequence-v1';
function dashboardFilterKind(selection){
 if(!Array.isArray(selection)||!selection.length||new Set(selection.map(x=>x?.label)).size!==selection.length)return null;
 const validChoice=x=>typeof x==='string'&&x.trim().length>0;
 const validChoices=x=>Array.isArray(x)&&x.every(validChoice)&&new Set(x).size===x.length;
 let native=false,custom=false;
 for(const x of selection){
  if(!x||!filterLabels.includes(x.label))return null;
  if(x.kind==='aria_listbox'||x.kind==='aria_multiselect'){
   if(!validChoices(x.values)||x.kind==='aria_listbox'&&(x.values.length!==1||x.display!==x.values[0]))return null;
   custom=true;
  }else if(!Object.hasOwn(x,'kind')&&(validChoice(x.value)||validChoices(x.value)))native=true;
  else return null;
 }
 return native&&custom?'mixed':native?'native':'custom';
}
function receiptTime(source){
 if(typeof source!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(source))return NaN;
 const t=Date.parse(source);
 return Number.isFinite(t)&&new Date(t).toISOString()===source.replace(/:\d\dZ$/,m=>m.slice(0,-1)+'.000Z')?t:NaN;
}
function verifyDashboardSequence(receipt,pages){
 if(receipt?.schema!==dashboardSequenceSchema||!['Games','Discrepancies','Popular'].includes(receipt.name)||
  !dashboardRoutes(receipt.name).includes(receipt.path)||!Object.hasOwn(receipt,'filterSelection')||
  receipt.filterSelection!==null&&!dashboardFilterKind(receipt.filterSelection)||
  receipt.allDashboardDataVerified!==false||receipt.filtersExhausted!==false||
  !Array.isArray(receipt.pageDigests)||receipt.pageDigests.length<1||
  new Set(receipt.pageDigests).size!==receipt.pageDigests.length)return false;
 const seen=new Set(),doneAt=receiptTime(receipt.observedAt);
 let firstAt=null,previousAt=null;
 return Number.isFinite(doneAt)&&receipt.pageDigests.every((digest,index)=>{
  if(!/^[a-f0-9]{64}$/.test(digest))return false;
  const page=pages.get(digest);
  if(page?.schema!=='pickfinder-public-dashboard-v1'||page.name!==receipt.name||page.path!==receipt.path||
   JSON.stringify(page.filterSelection)!==JSON.stringify(receipt.filterSelection)||
   receipt.filterSelection!==null&&page.filterSelectionVerified!==true||
   page.dataState!=='data_observed'||dashboardState(page)!=='data_observed')return false;
  const marker=pageMarker(page),at=receiptTime(page.observedAt),content=pageContent(page);
  if(index===0)firstAt=at;
  if(marker?.page!==index+1||marker?.total!==receipt.pageDigests.length||!Number.isFinite(at)||
   at>doneAt||index>0&&at<previousAt||at-firstAt>90000||seen.has(content))return false;
  previousAt=at;seen.add(content);return true;
 });
}
async function traverseDashboardFilters(page,name,{shouldContinue=()=>true,onSnapshot=async()=>{},onSequence=async()=>{}}={}){
 const traverse=async(filterSelection,verifySelection=null)=>{
  const path=new URL(page.url()).pathname,pageDigests=[];
  const result=await traverseDashboard(page,name,{shouldContinue,filterSelection,verifySelection,onSnapshot:async s=>{
   const digest=await onSnapshot(s);pageDigests.push(digest);
  }});
  if(result.completePageSequenceVerified&&pageDigests.length===result.pages&&pageDigests.every(d=>/^[a-f0-9]{64}$/.test(d)))
   await onSequence({schema:dashboardSequenceSchema,name,path,filterSelection,pageDigests,
    observedAt:new Date().toISOString(),filtersExhausted:false,allDashboardDataVerified:false});
  return result;
 };
 const defaultTraversal=await traverse(null);
 const started=Date.now(),issues=new Set();let maxEligibleControls=0;
 const timeLeft=()=>Math.max(0,60000-(Date.now()-started));
 const alive=()=>shouldContinue()&&timeLeft()>0;
 const selectionStats={mixedSnapshots:0,nativeSnapshots:0,customSnapshots:0,unverifiedSelections:0};
 const onState=async(native,custom,verifyNative,verifyCustom)=>{
  const combined=[...native,...custom];
  const kind=dashboardFilterKind(combined);
  if(!kind){issues.add('ambiguous_filter_scope');return;}
  const verify=async()=>await verifyNative()&&await verifyCustom()&&await verifyNative();
  const result=await traverse(combined,verify);
  if(result.pages)selectionStats[kind+'Snapshots']+=result.pages;
  if(!['explicit_last_page_observed','explicit_empty_observed'].includes(result.state)){
   selectionStats.unverifiedSelections++;issues.add(result.state);
  }
 };
 const inner=async(native=[],verifyNative=async()=>true)=>{
  if(!alive()){issues.add('deadline');return;}
  const a=await traverseCustomFilters(page,{shouldContinue:alive,maxMs:timeLeft(),onState:(custom,verifyCustom)=>onState(native,custom,verifyNative,verifyCustom)});
  for(const issue of a.issues)issues.add(issue);
  maxEligibleControls=Math.max(maxEligibleControls,a.eligibleControls);
  // Keep a native-only scope only when no supported custom control was present.
  if(native.length&&!a.eligibleControls)await onState(native,[],verifyNative,async()=>true);
 };
 const filterAudit=await traverseNativeFilters(page,{shouldContinue:alive,maxMs:timeLeft(),onState:inner});
 if(!filterAudit.eligibleControls)await inner();
 return {...defaultTraversal,filterAudit,customFilterAudit:{maxEligibleControls,issues:[...issues]},
  selectionStats,filtersExhausted:false,allDashboardDataVerified:false};
}
module.exports={dashboardRoutes,captureGameDialogs,captureDashboard,traverseDashboard,traverseDashboardFilters,dashboardControlDiagnostics,inspectCapabilities,verifiedNavigation,dashboardState,readyDashboard,pageMarker,verifyDashboardSequence,dashboardSequenceSchema,dashboardFilterKind};
