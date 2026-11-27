'use strict';
// Inspect only static schema, never account values or create, save, export, or submit anything.
const {verifiedNavigation}=require('./pickfinder-dashboard-research.cjs');
const routes={builder:['/pick-builder','/builder'],alerts:['/alerts','/line-alerts','/notifications','/settings/notifications','/settings/alerts','/account/notifications']};
const labels={builder:/^(?:pick builder|add pick|remove pick|payout|potential payout|correlation|higher|lower|over|under|platform|app|book|sport|market|clear|export|copy|flex|power|entry|lineup|picks|select picks|number of picks)$/i,alerts:/^(?:line alerts?|alerts?|notifications?|board drops?|create alert|new alert|target line|notifications?|threshold|sport|market|app|book|higher|lower|above|below|email|discord|frequency|line movement|price|direction|condition|player|save|cancel)$/i};
// Some capabilities live inside a board-side panel rather than a standalone route.
// Only an exact, visible, non-submit navigation button may be opened. Never click
// alert creation, export, Discord connection, or any form control.
async function navigationButton(page,names){
 if(typeof page.locator!=='function')return null; // missing browser capability: fail closed
 const landmarkSelector='header button,nav button,aside button,header [role=button],nav [role=button],aside [role=button],main button[aria-haspopup],main [role=button][aria-haspopup],nav [role=tab][aria-controls],aside [role=tab][aria-controls],main [role=tablist] [role=tab][aria-controls],[role=menu] [role=menuitem][aria-haspopup],[role=menu] button[aria-haspopup]';
 // Floating launchers can be mounted outside the navigation landmarks.
 // Outside those landmarks accept only an explicitly named Open action with popup semantics.
 const floatingSelector='button[aria-haspopup], [role=button][aria-haspopup]';
 const buttons=page.locator(landmarkSelector+','+floatingSelector);
 const indices=await buttons.evaluateAll((els,{names,landmarkSelector})=>els.flatMap((e,i)=>{
  const norm=x=>String(x||'').trim().replace(/\s+/g,' ').toLowerCase();
  const allowed=names.map(norm);
  const labelledBy=(e.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>e.ownerDocument.getElementById(id)?.textContent||'').join(' ');
  const candidates=[e.getAttribute('aria-label'),labelledBy,e.innerText,e.getAttribute('title'),e.querySelector('svg title')?.textContent].map(norm).filter(Boolean);
  if(!e.matches(landmarkSelector)){
   const intent=norm(e.getAttribute('aria-label'));
   const popup=norm(e.getAttribute('aria-haspopup'));
   if(!allowed.includes(intent)||!intent.startsWith('open ')||!['dialog','menu','true'].includes(popup)
     ||e.hasAttribute('aria-pressed')||e.hasAttribute('aria-checked'))return [];
  }
  return e.getClientRects().length&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&!e.closest('form')&&e.getAttribute('type')!=='submit'&&candidates.some(x=>allowed.includes(x))?[i]:[];
 }),{names,landmarkSelector});
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
  const counts={visibleNamedLinks:0,visibleNamedButtons:0,hiddenNamedControls:0,visibleNamedOther:0,visiblePopupButtons:0,visibleOpenLabelButtons:0};
  for(const e of document.querySelectorAll('a,button,[role=button],[role=tab],[title],[aria-label]')){
   if(![e.getAttribute('aria-label'),e.getAttribute('title'),e.innerText].some(t=>typeof t==='string'&&t.length<=80&&pattern.test(t)))continue;
   if(!e.getClientRects().length){counts.hiddenNamedControls++;continue;}
   if(e.tagName==='A')counts.visibleNamedLinks++;
   else if(e.tagName==='BUTTON'||e.getAttribute('role')==='button'){
    counts.visibleNamedButtons++;
    if(['true','dialog','menu'].includes(e.getAttribute('aria-haspopup')))counts.visiblePopupButtons++;
    if(/^open /i.test(e.getAttribute('aria-label')||''))counts.visibleOpenLabelButtons++;
   }
   else counts.visibleNamedOther++;
  }return counts;
 },{kind});}catch{return null;}
}
async function readToolSchema(page,kind,names,panel){
 return page.evaluate(({pattern,flags,names,panel})=>{
  const wanted=new RegExp(pattern,flags),visible=e=>e.getClientRects().length>0;
  const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
  const namesSet=new Set(names.map(norm));
  const roots=panel?[...document.querySelectorAll('[role=dialog],aside,[role=region],[role=tabpanel]')].filter(e=>visible(e)&&[e.getAttribute('aria-label'),document.getElementById(e.getAttribute('aria-labelledby')||'')?.innerText,...Array.from(e.querySelectorAll('h1,h2,h3,[role=heading],p')).map(h=>h.innerText)].some(t=>namesSet.has(norm(t)))):[...document.querySelectorAll('main')].filter(visible);
  if(roots.length!==1)return {verified:false,controls:[]};
  const controls=[...roots[0].querySelectorAll('button,label,[role=tab],h1,h2,h3,input,select,[role=switch],[role=checkbox]')].filter(visible).flatMap(e=>{
   const raw=(e.getAttribute('aria-label')||[...e.labels||[]].map(l=>l.innerText).join(' ')||e.innerText||e.getAttribute('title')||'').trim();
   if(!wanted.test(raw))return [];
   return [{label:raw,kind:e.tagName.toLowerCase(),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',inputType:e.tagName==='INPUT'?e.type:null}];
  });
  return {verified:true,controls};
 },{pattern:labels[kind].source,flags:labels[kind].flags,names,panel});
}

async function openBoardBuilder(page){
 if(typeof page.getByText!=='function'||typeof page.locator!=='function')return null;
 const hint=page.getByText(/Click on the star icon to add a/i);
 if(await hint.count()!==1||!await hint.isVisible())return null;
 const stars=page.locator('table tbody button[aria-haspopup="dialog"]:has(svg.lucide-star)');
 if(!await stars.count())return null;
 const star=stars.first();
 if(!await star.isVisible()||!await star.isEnabled())return null;
 await star.click({timeout:3000});
 const dialog=page.getByRole('dialog').filter({hasText:'Add to Pick Builder'});
 try{
  await dialog.waitFor({state:'visible',timeout:3500});
  const sides=[];
  for(const label of ['Over','Under']){
   const b=dialog.getByRole('button',{name:label,exact:true});
   if(await b.count()===1&&await b.isVisible())sides.push({label,kind:'button',disabled:!await b.isEnabled(),inputType:null});
  }
  return {state:sides.length?'read_only_schema_observed':'panel_only_observed',route:'/props',method:'prop_star_dialog',controls:sides,mutations:0,submissionVerified:false};
 }catch{return {state:'panel_or_route_unverified',method:'prop_star_dialog',mutations:0};}
 finally{await page.keyboard.press('Escape');}
}
async function inspectTool(page,kind,premium){
 if(!routes[kind])throw Error('unknown capability');
 const names=kind==='builder'?['Pick Builder','Open Pick Builder','Toggle Pick Builder','Show Pick Builder','Lineup Builder','Build Picks']:['Line Alerts','Alerts','Notifications','Open Alerts','Open Notifications','Open Line Alerts','Notification Settings','Board Drops','Board Drop Notifications'];
 const findLinks=async()=>{const links=[];for(const n of names){const href=await verifiedNavigation(page,n,routes[kind]);if(href)links.push(href);}return [...new Set(links)];};
 let distinct=await findLinks();
 if(distinct.length>1)return {state:'navigation_ambiguous',mutations:0};
 let method='visible_link',panel=false;
 if(distinct.length===1){
  await page.goto(distinct[0],{timeout:15000});
 }else{
  if(!await premium(page))return {state:'session_or_route_unverified',mutations:0};
  let button=await navigationButton(page,names);
  // Notifications may be reachable through the existing authenticated user menu.
  // Open only the exact navigation menu, never inspect or serialize its account values.
  // Follow a visible, allowlisted notification link or an explicit submenu opener.
  if(!button&&kind==='alerts'&&typeof page.getByRole==='function'){
   const menu=page.getByRole('button',{name:'Open user menu',exact:true});
   if(await menu.count()===1&&await menu.isVisible()&&await menu.isEnabled()){
    await menu.click({timeout:3000});
    distinct=await findLinks();
    if(distinct.length>1)return {state:'navigation_ambiguous',mutations:0};
    if(distinct.length===1){await page.goto(distinct[0],{timeout:15000});method='user_menu_link';}
    else {
     const item=page.getByRole('menuitem',{name:'Notifications',exact:true});
     if(await item.count()===1&&await item.isVisible()&&await item.isEnabled())button=item;
     else button=await navigationButton(page,names);
    }
   }
  }
  if(method!=='user_menu_link'){
  if(!button){
   // The documented Pick Builder can already be open in the board sidebar.
   // Inspect only an explicitly named panel; adding a selection changes account state.
   if(kind==='builder'&&page.url?.()==='https://www.pickfinder.app/props'){
    const schema=await readToolSchema(page,kind,['Pick Builder','Lineup Builder'],true);
    if(schema.verified){
     const controls=schema.controls;
     const actionable=controls.some(control=>['button','input','select'].includes(control.kind));
     return {state:actionable?'read_only_schema_observed':'panel_only_observed',route:'/props',method:'visible_panel',controls,mutations:0,submissionVerified:false};
    }
   }
   if(kind==='builder'&&page.url?.()==='https://www.pickfinder.app/props'){
    const observed=await openBoardBuilder(page);
    if(observed)return observed;
   }
   return {state:'navigation_not_verified',navigationHints:await featureNavigationHints(page,kind),mutations:0};
  }
  // Opening the named navigation control is read-only. Do not submit or change settings.
  await button.click({timeout:3000});method='navigation_button';
  try{await page.waitForFunction(({names,paths})=>{
   const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
   return paths.includes(location.pathname)||[...document.querySelectorAll('[role=dialog],aside,[role=region],[role=tabpanel]')].some(e=>e.getClientRects().length&&[e.getAttribute('aria-label'),document.getElementById(e.getAttribute('aria-labelledby')||'')?.innerText,...Array.from(e.querySelectorAll('h1,h2,h3,[role=heading],p')).map(h=>h.innerText)].some(t=>names.map(norm).includes(norm(t))));
  },{names,paths:routes[kind]},{timeout:5000});}catch{return {state:'panel_or_route_unverified',method,mutations:0};}
  }
 }
 const url=new URL(page.url());
 if(url.origin!=='https://www.pickfinder.app'||!await premium(page))return {state:'session_or_route_unverified',mutations:0};
 if(!routes[kind].includes(url.pathname)){
  if(method!=='navigation_button'||url.pathname!=='/props')return {state:'session_or_route_unverified',mutations:0};
  panel=true;
 }
 const schema=await readToolSchema(page,kind,names,panel);
 if(!schema.verified)return {state:'panel_or_route_unverified',method,mutations:0};
 return {state:schema.controls.length?'read_only_schema_observed':panel?'panel_only_observed':'route_only_observed',route:url.pathname,method,controls:schema.controls,mutations:0,submissionVerified:false};
}
module.exports={inspectTool,routes,navigationButton,featureNavigationHints,openBoardBuilder};
