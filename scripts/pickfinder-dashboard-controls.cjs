'use strict';
// Explicit controls observed in the signed-in Premium desktop UI on 2026-11-27.
// No unrestricted page text, account details, selections, or raw offers are archived here.
const {createHash}=require('node:crypto');
const {dashboardRoutes,captureDashboard,dashboardState}=require('./pickfinder-dashboard-research.cjs');
const origin='https://www.pickfinder.app';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const uniqueKeys=x=>x.length>0&&new Set(x).size===x.length;
const route=(page,paths)=>{try{const u=new URL(page.url());return u.origin===origin&&paths.includes(u.pathname);}catch{return false;}};
const exact=(page,role,name)=>page.getByRole(role,{name,exact:typeof name==='string'});
const usable=async el=>await el.count()===1&&await el.isVisible()&&await el.isEnabled();
async function click(el){if(!await usable(el))return false;await el.click({timeout:2500});return true;}
async function until(read,accept,alive,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 for(let n=0;n<16&&alive();n++){
  const x=await read();if(accept(x))return x;
  if(n+1<16&&alive())await pause(350);
 }
 return null;
}
function snapshotIds(name,s){
 if(name==='Games')return (s.gameCards||[]).flatMap(x=>(x.matchups||[]).map(m=>JSON.stringify([x.sport,m])));
 return (s.cards||[]).map(x=>JSON.stringify([x.path,x.prop]));
}
function proof(x){return {count:x.length,orderSha256:hash(x),membersSha256:hash([...x].sort())};}
function readPropsPager(){
 const visible=e=>e.getClientRects().length>0;
 const next=[...document.querySelectorAll('button[aria-label="Next page"]')].filter(visible);
 const previous=[...document.querySelectorAll('button[aria-label="Previous page"]')].filter(visible);
 const table=[...document.querySelectorAll('table')].filter(e=>visible(e)&&e.querySelector('tbody a[href*="/players/"][href*="prop="]'));
 const footer=next.length===1&&previous.length===1&&next[0].parentElement?.contains(previous[0])?next[0].parentElement:null;
 const marker=footer?.innerText.match(/\bPage\s+(\d+)\s*\/\s*(\d+)\b/i);
 const rows=table.length===1?[...table[0].querySelectorAll('tbody tr')].filter(visible):[];
 const keys=rows.flatMap(tr=>{
  const links=[...tr.querySelectorAll('a[href*="/players/"][href*="prop="]')].filter(visible);
  if(links.length!==1)return [];
  const u=new URL(links[0].href);
  const prop=u.searchParams.getAll('prop');
  return u.origin===location.origin&&prop.length===1&&prop[0].split(':').length===4?[JSON.stringify([u.pathname,prop[0]])]:[];
 });
 return {page:marker?Number(marker[1]):null,total:marker?Number(marker[2]):null,rows:rows.length,keys};
}
function qualifiesPage(x,expected,total,x0=null){
 return x?.page===expected&&Number.isSafeInteger(x.total)&&x.total>=expected&&(total===null||x.total===total)&&
  x.rows===x.keys?.length&&uniqueKeys(x.keys)&&(!x0||x.keys.some(k=>!x0.keys.includes(k)));
}
async function observePropsPager(page,alive,{read=()=>page.evaluate(readPropsPager),pause}={}){
 if(!route(page,['/props']))return {state:'route_unverified'};
 const stays=()=>alive()&&route(page,['/props']);
 const p1=await until(read,x=>qualifiesPage(x,1,null)&&x.total>1,stays,pause);
 if(!p1||!stays()||!await click(exact(page,'button','Next page')))return {state:'next_unavailable'};
 let p2,back;
 try{p2=await until(read,x=>qualifiesPage(x,2,p1.total,p1)&&proof(x.keys).membersSha256!==proof(p1.keys).membersSha256,stays,pause);}
 finally{
  if(route(page,['/props'])&&await click(exact(page,'button','Previous page')))
   back=await until(read,x=>qualifiesPage(x,1,p1.total)&&proof(x.keys).membersSha256===proof(p1.keys).membersSha256,stays,pause);
 }
 const frame=(x)=>({page:x.page,total:x.total,...proof(x.keys)});
 return p2?{state:'verified_bounded_transition',before:frame(p1),after:frame(p2),returnToFirstVerified:!!back,
  fullTraversalVerified:false}:{state:'next_results_unverified',returnToFirstVerified:!!back};
}
async function observeNamedControl(page,name,alive,{read=()=>captureDashboard(page,name),pause}={}){
 const stays=()=>alive()&&route(page,dashboardRoutes(name));
 const readState=async()=>{const s=await read(),ids=snapshotIds(name,s);return {s,ids,state:dashboardState(s)};};
 const selected=(n)=>exact(page,'button',n);
 const sport=n=>click(selected(n));
 const choose=async (trigger,choice)=>{
  const t=selected(trigger);if(!await usable(t))return false;
  if(await t.getAttribute('aria-expanded')!=='true'&&!await click(t))return false;
  return click(exact(page,'option',choice));
 };
 if(!stays())return {state:'route_unverified'};
 if(name==='Games'){
  if(!await sport('NHL'))return {state:'known_control_unavailable'};
  const nhl=x=>x.state==='data_observed'&&uniqueKeys(x.ids)&&x.s.gameCards.every(g=>g.sport.toLowerCase()==='nhl');
  if(!await usable(selected('Start time')))return {state:'initial_sort_unverified'};
  const a=await until(readState,nhl,stays,pause);
  if(!a||!stays()||!await choose('Start time',/^Biggest favorites Highest win chance first$/i))return {state:'sort_control_unverified'};
  let b,c;
  try{if(await usable(selected('Biggest favorites')))b=await until(readState,x=>nhl(x)&&hash(x.ids)!==hash(a.ids),stays,pause);}
  finally{
   if(route(page,dashboardRoutes(name))&&await choose('Biggest favorites',/^Start time Soonest first$/i))
    c=await until(readState,x=>nhl(x)&&hash(x.ids)===hash(a.ids),stays,pause);
  }
  return b&&c?{state:'verified_sort_with_reversal',scope:'nhl',from:'Start time',to:'Biggest favorites',
   before:proof(a.ids),after:proof(b.ids),restored:proof(c.ids)}:{state:'sort_effect_or_restore_unverified'};
 }
 if(name==='Popular'){
  const a=await until(readState,x=>x.state==='data_observed'&&uniqueKeys(x.ids),stays,pause);
  if(!a||!stays()||!await choose('Modifier',/^goblin Goblin$/i))return {state:'filter_control_unverified'};
  let b,c;
  try{
   if(await usable(selected('Modifier goblin')))b=await until(readState,x=>x.state==='data_observed'&&uniqueKeys(x.ids)&&hash([...x.ids].sort())!==hash([...a.ids].sort()),stays,pause);
  }finally{
   if(route(page,dashboardRoutes(name))&&await choose('Modifier goblin',/^goblin Goblin$/i)){
    await page.keyboard.press('Escape');
    c=await until(readState,x=>x.state==='data_observed'&&hash(x.ids)===hash(a.ids),stays,pause);
   }
  }
  return b?{state:'verified_filter_result_change',filter:'Modifier',value:'Goblin',before:proof(a.ids),after:proof(b.ids),
   restoredResultsVerified:!!c}:{state:'filter_effect_unverified',restoredResultsVerified:!!c};
 }
 if(name==='Discrepancies'){
  if(!await sport('NBA'))return {state:'known_control_unavailable'};
  const a=await until(readState,x=>x.state==='data_observed'&&uniqueKeys(x.ids)&&x.s.cards.every(k=>k.path.startsWith('/players/nba/')),stays,pause);
  if(!a||!stays()||!await sport('NHL'))return {state:'filter_control_unverified'};
  let b,c;
  try{b=await until(readState,x=>x.state==='explicit_empty'||x.state==='data_observed'&&uniqueKeys(x.ids)&&x.s.cards.every(k=>k.path.startsWith('/players/nhl/')),stays,pause);}
  finally{if(route(page,dashboardRoutes(name))&&await sport('NBA'))c=await until(readState,x=>x.state==='data_observed'&&hash(x.ids)===hash(a.ids),stays,pause);}
  return b?{state:'verified_sport_filter',before:proof(a.ids),after:proof(b.ids),from:'nba',to:'nhl',result:b.state,
   restoredResultsVerified:!!c}:{state:'filter_effect_unverified',restoredResultsVerified:!!c};
 }
 return {state:'route_unverified'};
}
module.exports={observeNamedControl,observePropsPager,qualifiesPage,snapshotIds};
