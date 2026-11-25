'use strict';
// Inspect only static schema, never account values or create, save, export, or submit anything.
const {verifiedNavigation}=require('./pickfinder-dashboard-research.cjs');
const routes={builder:['/pick-builder','/builder'],alerts:['/alerts','/line-alerts']};
const labels={builder:/^(?:pick builder|add pick|remove pick|payout|potential payout|correlation|higher|lower|over|under|platform|app|book|sport|market|clear|export|copy|flex|power|entry|lineup|picks|select picks|number of picks)$/i,alerts:/^(?:line alerts?|alerts?|create alert|new alert|target line|notification|threshold|sport|market|app|book|higher|lower|above|below|email|discord|frequency|line movement|price|direction|condition|player|save|cancel)$/i};
async function inspectTool(page,kind,premium){
 if(!routes[kind])throw Error('unknown capability');
 const names=kind==='builder'?['Pick Builder']:['Line Alerts','Alerts'];
 const links=[];for(const n of names){const href=await verifiedNavigation(page,n,routes[kind]);if(href)links.push(href);}
 const distinct=[...new Set(links)];if(distinct.length!==1)return {state:'navigation_not_verified',mutations:0};
 await page.goto(distinct[0],{timeout:15000});
 const url=new URL(page.url());if(url.origin!=='https://www.pickfinder.app'||!routes[kind].includes(url.pathname)||!await premium(page))return {state:'session_or_route_unverified',mutations:0};
 const controls=await page.evaluate(({pattern,flags})=>{
  const wanted=new RegExp(pattern,flags),visible=e=>e.getClientRects().length>0;
  return [...document.querySelectorAll('main button,main label,main [role=tab],main h1,main h2,main input,main select')].filter(visible).flatMap(e=>{
   const raw=(e.getAttribute('aria-label')||[...e.labels||[]].map(l=>l.innerText).join(' ')||e.innerText||'').trim();
   if(!wanted.test(raw))return [];
   return [{label:raw,kind:e.tagName.toLowerCase(),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',inputType:e.tagName==='INPUT'?e.type:null}];
  });
 },{pattern:labels[kind].source,flags:labels[kind].flags});
 return {state:controls.length?'read_only_schema_observed':'route_only_observed',route:url.pathname,controls,mutations:0,submissionVerified:false};
}
module.exports={inspectTool,routes};
