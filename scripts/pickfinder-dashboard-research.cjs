'use strict';
const {traverseNativeFilters}=require('./pickfinder-research-coverage.cjs');
const {traverseCustomFilters}=require('./pickfinder-custom-filters.cjs');
// Capture visible sporting tables and cards only, without account details or actions.
async function captureDashboard(page,name){
 if(!['Games','Discrepancies','Popular'].includes(name))throw Error('dashboard scope');
 const url=new URL(page.url());if(url.origin!=='https://www.pickfinder.app'||url.pathname!=='/'+name.toLowerCase())throw Error('route');
 const observedAt=new Date().toISOString();
 const snapshot=await page.evaluate(()=>{
  const visible=e=>e.getClientRects().length>0;
  const cell=c=>({text:c.innerText.trim().slice(0,1000),labels:[...c.querySelectorAll('img[alt]')].map(i=>i.alt.slice(0,100))});
  const tables=[...document.querySelectorAll('main table')].filter(visible).map(t=>({headers:[...t.querySelectorAll('thead th')].map(cell),rows:[...t.querySelectorAll('tbody tr')].filter(visible).map(tr=>[...tr.cells].map(cell))}));
  const cards=[...document.querySelectorAll('main a[href*="/players/"],main a[href*="/games/"]')].filter(visible).flatMap(a=>{
   const u=new URL(a.href);if(u.origin!==location.origin)return [];
   return [{path:u.pathname,prop:u.searchParams.get('prop'),text:a.innerText.trim().slice(0,1000),displayedTimes:[...a.querySelectorAll('time[datetime]')].filter(visible).map(t=>({datetime:t.getAttribute('datetime'),label:t.innerText.trim().slice(0,100)}))}];
  });
  const clocks=[...document.querySelectorAll('main time[datetime]')].filter(visible).map(t=>({datetime:t.getAttribute('datetime'),label:t.innerText.trim().slice(0,100)}));
  const controls=[...document.querySelectorAll('main button,main [role=tab],main select')].filter(visible).map(e=>({label:(e.getAttribute('aria-label')||e.innerText||'').trim().slice(0,160),disabled:e.disabled===true||e.getAttribute('aria-disabled')==='true',selected:e.getAttribute('aria-selected')==='true'})).filter(x=>x.label);
  const pagination=[...document.querySelectorAll('main nav,main [aria-label="Pagination"],main [role=status]')].filter(visible).map(e=>e.innerText.trim().match(/\b(?:Page\s+)?(\d+)\s+(?:of|\/)\s+(\d+)\b/i)).filter(Boolean).map(m=>({page:Number(m[1]),total:Number(m[2])}));
  return {tables,cards,clocks,controls,pagination};
 });
 return {name,path:url.pathname,observedAt,...snapshot,originalOffersVerified:false,modelInputsApproved:false};
}

async function traverseDashboard(page,name,{shouldContinue=()=>true,onSnapshot=async()=>{},filterSelection=null}={}){
 const seen=new Set();let pages=0,state='unverified_pagination';
 while(shouldContinue()){
  const x=await captureDashboard(page,name),scopes=[...new Map(x.pagination.map(p=>[p.page+':'+p.total,p])).values()];
  const p=scopes.length===1?scopes[0]:null;
  const fingerprint=JSON.stringify([p,x.tables,x.cards,x.clocks]);
  if(seen.has(fingerprint)){state='repeated_page';break;}
  seen.add(fingerprint);await onSnapshot({...x,filterSelection});pages++;
  if(!p||!Number.isSafeInteger(p.page)||!Number.isSafeInteger(p.total)||p.page<1||p.total<p.page){state='pagination_not_explicit';break;}
  if(p.page===p.total){state='explicit_last_page_observed';break;}
  const next=page.getByRole('button',{name:'Next page',exact:true});
  if(await next.count()!==1||!await next.isVisible()||!await next.isEnabled()){state='next_control_unverified';break;}
  if(!shouldContinue()){state='deadline';break;}
  await next.click();
  // Do not certify a next page based on a click; the next iteration observes it.
  await page.waitForFunction(previous=>[...document.querySelectorAll('main nav,main [aria-label="Pagination"],main [role=status]')].some(e=>{const m=e.innerText.match(/\b(?:Page\s+)?(\d+)\s+(?:of|\/)\s+(\d+)\b/i);return m&&Number(m[1])===previous+1;}),p.page,{timeout:8000});
 }
 return {pages,state,filtersExhausted:false,allDashboardDataVerified:false};
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
async function traverseDashboardFilters(page,name,{shouldContinue=()=>true,onSnapshot=async()=>{}}={}){
 const defaultTraversal=await traverseDashboard(page,name,{shouldContinue,onSnapshot});
 const filterAudit=await traverseNativeFilters(page,{shouldContinue,maxMs:60000,onState:async selection=>{
  const x=await traverseDashboard(page,name,{shouldContinue,onSnapshot,filterSelection:selection});
  if(x.state!=='explicit_last_page_observed')throw Error('filter pagination incomplete');
 }});
 const customFilterAudit=await traverseCustomFilters(page,{shouldContinue,maxMs:60000,onState:async selection=>{const x=await traverseDashboard(page,name,{shouldContinue,onSnapshot,filterSelection:selection});if(x.state!=='explicit_last_page_observed')throw Error('filter pagination incomplete');}});
 return {...defaultTraversal,filterAudit,customFilterAudit,filtersExhausted:false,allDashboardDataVerified:false};
}
module.exports={captureDashboard,traverseDashboard,traverseDashboardFilters,inspectCapabilities,verifiedNavigation};
