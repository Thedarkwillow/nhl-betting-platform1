'use strict';
// Inspect only static schema, never account values or create, save, export, or submit anything.
const {verifiedNavigation}=require('./pickfinder-dashboard-research.cjs');
const routes={builder:['/pick-builder','/builder'],alerts:['/alerts','/line-alerts']};
const labels={builder:/^(?:pick builder|add pick|remove pick|payout|potential payout|correlation|higher|lower|over|under|platform|app|book|sport|market|clear|export|copy|flex|power|entry|lineup|picks|select picks|number of picks)$/i,alerts:/^(?:line alerts?|alerts?|notifications?|board drops?|create alert|new alert|target line|notification|threshold|sport|market|app|book|higher|lower|above|below|email|discord|frequency|line movement|price|direction|condition|player|save|cancel)$/i};
// Some capabilities live inside a board-side panel rather than a standalone route.
// Only an exact, visible, non-submit navigation button may be opened. Never click
// a player star, create alert, export, connect Discord, or any form control.
async function navigationButton(page,names){
 if(typeof page.locator!=='function')return null; // missing browser capability: fail closed
 const selector='header button,nav button,aside button,header [role=button],nav [role=button],aside [role=button],main button[aria-haspopup],main [role=button][aria-haspopup]';
 const buttons=page.locator(selector);
 const indices=await buttons.evaluateAll((els,names)=>els.flatMap((e,i)=>{
  const norm=x=>String(x||'').trim().replace(/\s+/g,' ').toLowerCase();
  const allowed=names.map(norm);
  const candidates=[e.getAttribute('aria-label'),e.innerText,e.getAttribute('title'),e.querySelector('svg title')?.textContent].map(norm).filter(Boolean);
  return e.getClientRects().length&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&!e.closest('form')&&e.getAttribute('type')!=='submit'&&candidates.some(x=>allowed.includes(x))?[i]:[];
 }),names);
 if(indices.length!==1)return null;
 const b=buttons.nth(indices[0]);
 if(!await b.isVisible()||!await b.isEnabled())return null;
 return b;
}
// Only count allowlisted sporting capability names. Do not archive raw DOM,
// menu values, account text, links with queries, or undisclosed account routes.
async function featureNavigationHints(page,kind){
 try{return await page.evaluate(({kind})=>{
  const pattern=kind==='builder'?/\b(?:pick builder|build picks|lineup builder)\b/i:/\b(?:line alerts?|notifications?|board drops?)\b/i;
  const counts={visibleNamedLinks:0,visibleNamedButtons:0,hiddenNamedControls:0,visibleNamedOther:0};
  for(const e of document.querySelectorAll('a,button,[role=button],[role=tab],[title],[aria-label]')){
   if(![e.getAttribute('aria-label'),e.getAttribute('title'),e.innerText].some(t=>typeof t==='string'&&t.length<=80&&pattern.test(t)))continue;
   if(!e.getClientRects().length){counts.hiddenNamedControls++;continue;}
   if(e.tagName==='A')counts.visibleNamedLinks++;
   else if(e.tagName==='BUTTON'||e.getAttribute('role')==='button')counts.visibleNamedButtons++;
   else counts.visibleNamedOther++;
  }return counts;
 },{kind});}catch{return null;}
}
async function inspectTool(page,kind,premium){
 if(!routes[kind])throw Error('unknown capability');
 const names=kind==='builder'?['Pick Builder','Open Pick Builder','Toggle Pick Builder','Show Pick Builder']:['Line Alerts','Alerts','Notifications','Open Alerts','Open Notifications','Open Line Alerts','Notification Settings'];
 const links=[];for(const n of names){const href=await verifiedNavigation(page,n,routes[kind]);if(href)links.push(href);}
 const distinct=[...new Set(links)];
 if(distinct.length>1)return {state:'navigation_ambiguous',mutations:0};
 let method='visible_link',panel=false;
 if(distinct.length===1){
  await page.goto(distinct[0],{timeout:15000});
 }else{
  if(!await premium(page))return {state:'session_or_route_unverified',mutations:0};
  const button=await navigationButton(page,names);
  if(!button)return {state:'navigation_not_verified',navigationHints:await featureNavigationHints(page,kind),mutations:0};
  // Opening the named navigation control is read-only. Do not submit or change settings.
  await button.click({timeout:3000});method='navigation_button';
  try{await page.waitForFunction(({names,paths})=>{
   const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
   return paths.includes(location.pathname)||[...document.querySelectorAll('[role=dialog],aside,[role=region]')].some(e=>e.getClientRects().length&&[e.getAttribute('aria-label'),...Array.from(e.querySelectorAll('h1,h2,h3,[role=heading]')).map(h=>h.innerText)].some(t=>names.map(norm).includes(norm(t))));
  },{names,paths:routes[kind]},{timeout:5000});}catch{return {state:'panel_or_route_unverified',method,mutations:0};}
 }
 const url=new URL(page.url());
 if(url.origin!=='https://www.pickfinder.app'||!await premium(page))return {state:'session_or_route_unverified',mutations:0};
 if(!routes[kind].includes(url.pathname)){
  if(method!=='navigation_button'||url.pathname!=='/props')return {state:'session_or_route_unverified',mutations:0};
  panel=true;
 }
 const schema=await page.evaluate(({pattern,flags,names,panel})=>{
  const wanted=new RegExp(pattern,flags),visible=e=>e.getClientRects().length>0;
  const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
  const namesSet=new Set(names.map(norm));
  const roots=panel?[...document.querySelectorAll('[role=dialog],aside,[role=region]')].filter(e=>visible(e)&&[e.getAttribute('aria-label'),...Array.from(e.querySelectorAll('h1,h2,h3,[role=heading]')).map(h=>h.innerText)].some(t=>namesSet.has(norm(t)))):[...document.querySelectorAll('main')].filter(visible);
  if(roots.length!==1)return {verified:false,controls:[]};
  const controls=[...roots[0].querySelectorAll('button,label,[role=tab],h1,h2,h3,input,select,[role=switch]')].filter(visible).flatMap(e=>{
   const raw=(e.getAttribute('aria-label')||[...e.labels||[]].map(l=>l.innerText).join(' ')||e.innerText||e.getAttribute('title')||'').trim();
   if(!wanted.test(raw))return [];
   return [{label:raw,kind:e.tagName.toLowerCase(),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',inputType:e.tagName==='INPUT'?e.type:null}];
  });
  return {verified:true,controls};
 },{pattern:labels[kind].source,flags:labels[kind].flags,names,panel});
 if(!schema.verified)return {state:'panel_or_route_unverified',method,mutations:0};
 return {state:schema.controls.length?'read_only_schema_observed':panel?'panel_only_observed':'route_only_observed',route:url.pathname,method,controls:schema.controls,mutations:0,submissionVerified:false};
}
module.exports={inspectTool,routes,navigationButton,featureNavigationHints};
