'use strict';
// Read-only research filters: only explicitly labeled, linked ARIA listboxes on research routes.
const {filterLabels}=require('./pickfinder-research-coverage.cjs');
const norm=x=>String(x??'').trim().toLowerCase().replace(/\s+/g,' ');
const safeRoute=url=>{try{const u=new URL(url);return u.origin==='https://www.pickfinder.app'&&(/^(?:\/props|\/games|\/popular|\/discrepancies)$/.test(u.pathname)||u.pathname.startsWith('/players/'));}catch{return false;}};
function readControls(){
 const visible=e=>e.getClientRects().length>0;
 return [...document.querySelectorAll('main [role=combobox][aria-controls],main button[aria-haspopup=listbox][aria-controls]')].filter(visible).map(e=>{
  const label=(e.getAttribute('aria-label')||(e.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.innerText||'').join(' ')).trim();
  return {label,id:e.getAttribute('aria-controls'),role:e.getAttribute('role')||'button',disabled:e.disabled||e.getAttribute('aria-disabled')==='true'};
 });
}
function readOptions(id){
 const p=document.getElementById(id);if(!p||p.getAttribute('role')!=='listbox'||!p.getClientRects().length)return null;
 return {multiple:p.getAttribute('aria-multiselectable')==='true',options:[...p.querySelectorAll('[role=option]')].filter(e=>e.getClientRects().length&&e.getAttribute('aria-disabled')!=='true').map(e=>({label:(e.getAttribute('aria-label')||e.innerText||'').trim(),selected:e.getAttribute('aria-selected')==='true'}))};
}
function approvedControls(rows){
 return rows.filter(x=>!x.disabled&&filterLabels.includes(norm(x.label))&&/^[\w:.-]{1,160}$/.test(x.id)&&rows.filter(y=>norm(y.label)===norm(x.label)).length===1&&rows.filter(y=>y.id===x.id).length===1);
}
async function traverseCustomFilters(page,{shouldContinue=()=>true,onState=async()=>{},maxMs=45000,read=()=>page.evaluate(readControls),open,options,choose,close}={}){
 if(!safeRoute(page.url()))throw Error('custom_filter_route');
 const alive=()=>shouldContinue()&&Date.now()-started<maxMs&&safeRoute(page.url());
 const started=Date.now(),initial=await read(),controls=approvedControls(initial),issues=new Set();let states=0,visited=0;
 const trigger=x=>page.locator('main [aria-controls="'+x.id+'"]');
 const openFn=open|| (async x=>{const t=trigger(x);if(await t.count()!==1||!await t.isVisible()||!await t.isEnabled())throw Error('trigger');if(await t.getAttribute('aria-expanded')!=='true')await t.click();});
 const closeFn=close|| (async x=>{const t=trigger(x);if(await t.count()===1&&await t.getAttribute('aria-expanded')==='true')await t.press('Escape');});
 const optionsFn=options|| (async x=>page.evaluate(readOptions,x.id));
 const chooseFn=choose|| (async(x,label)=>{const popup=page.locator('[role=listbox][id="'+x.id+'"]');const option=popup.getByRole('option',{name:label,exact:true});if(await option.count()!==1||!await option.isVisible()||!await option.isEnabled())throw Error('option');await option.click();});
 async function inspect(x){await openFn(x);const p=await optionsFn(x);if(!p||!p.options.length||p.multiple||p.options.some(y=>!y.label)||new Set(p.options.map(y=>y.label)).size!==p.options.length||p.options.filter(y=>y.selected).length!==1)throw Error('unsupported listbox');return p;}
 async function select(x,label){const p=await inspect(x);if(!p.options.some(y=>y.label===label))throw Error('missing option');if(!p.options.some(y=>y.label===label&&y.selected))await chooseFn(x,label);const after=await inspect(x);if(!after.options.some(y=>y.label===label&&y.selected))throw Error('selection not verified');await closeFn(x);}
 for(const x of controls){if(!alive()){issues.add('deadline');break;}
  let original=null;try{
   const p=await inspect(x);original=p.options.find(y=>y.selected).label;await closeFn(x);visited++;
   for(const o of p.options){if(!alive()){issues.add('deadline');break;}
    await select(x,o.label);
    await onState([{label:norm(x.label),display:o.label,kind:'aria_listbox'}]);states++;
   }
  }catch(e){if(e?.deepStage)throw e;issues.add('control_or_capture_unverified');}
  finally{if(original!==null&&safeRoute(page.url())){try{await select(x,original);}catch{issues.add('restore_unverified');}}else if(safeRoute(page.url())){try{await closeFn(x);}catch{issues.add('close_unverified');}}}
 }
 return {controlsObserved:initial.length,eligibleControls:controls.length,visitedControls:visited,statesObserved:states,issues:[...issues],allFilterCombinationsVerified:false,multiSelectSupported:false};
}
module.exports={safeRoute,approvedControls,traverseCustomFilters,readControls,readOptions};
