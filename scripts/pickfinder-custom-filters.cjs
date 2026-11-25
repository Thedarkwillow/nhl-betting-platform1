'use strict';
// Read-only research filters: only explicitly labeled, linked ARIA listboxes on research routes.
const {filterLabels}=require('./pickfinder-research-coverage.cjs');
const norm=x=>String(x??'').trim().toLowerCase().replace(/\s+/g,' ');
const safeRoute=url=>{try{const u=new URL(url);return u.origin==='https://www.pickfinder.app'&&(/^(?:\/props|\/games|\/game-lines|\/popular|\/discrepancies)$/.test(u.pathname)||u.pathname.startsWith('/players/'));}catch{return false;}};
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
 async function inspect(x){
  await openFn(x);const p=await optionsFn(x);
  if(!p||!p.options.length||p.options.some(y=>!y.label)||new Set(p.options.map(y=>y.label)).size!==p.options.length||(!p.multiple&&p.options.filter(y=>y.selected).length!==1))throw Error('unsupported listbox');
  return p;
 }
 const selected=p=>p.options.filter(y=>y.selected).map(y=>y.label).sort();
 const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
 async function select(x,wanted){
  let p=await inspect(x);if(wanted.some(y=>!p.options.some(o=>o.label===y))||(!p.multiple&&wanted.length!==1))throw Error('missing option');
  if(p.multiple){
   const before=selected(p);
   // Remove obsolete choices, add required choices, verify exact selected set.
   for(const label of [...before.filter(y=>!wanted.includes(y)),...wanted.filter(y=>!before.includes(y))]){
    p=await inspect(x);const o=p.options.find(y=>y.label===label);if(!o)throw Error('dynamic option');
    const expect=wanted.includes(label);if(o.selected!==expect)await chooseFn(x,label);
    p=await inspect(x);if(p.options.find(y=>y.label===label)?.selected!==expect)throw Error('toggle not verified');
   }
  }else if(!same(selected(p),wanted))await chooseFn(x,wanted[0]);
  p=await inspect(x);if(!same(selected(p),wanted))throw Error('selection not verified');await closeFn(x);
 }
 function* subsets(labels,i=0,prefix=[]){if(i===labels.length){yield prefix;return;}yield* subsets(labels,i+1,prefix);yield* subsets(labels,i+1,[...prefix,labels[i]]);}
 const visitedIds=new Set(),seen=new Set();let multi=0;
 async function walk(i,selection){
  if(!alive()){issues.add('deadline');return;}
  if(i===controls.length){
   const live=approvedControls(await read());
   if(live.some(x=>!controls.some(y=>norm(y.label)===norm(x.label))))issues.add('dynamic_control');
   // Re-read each selected control: an upstream filter may reset a downstream selection.
   for(const s of selection){const x=live.find(y=>norm(y.label)===s.label);if(!x){issues.add('selection_changed');return;}let p;try{p=await inspect(x);await closeFn(x);}catch{issues.add('selection_unverified');return;}if(!same(selected(p),s.values)){issues.add('selection_changed');return;}}
   const key=JSON.stringify(selection);if(seen.has(key))return;await onState(selection);seen.add(key);states++;return;
  }
  const originalControl=controls[i];const x=approvedControls(await read()).find(y=>norm(y.label)===norm(originalControl.label));
  if(!x){issues.add('dynamic_control');return;}
  let original=null;
  try{
   const p=await inspect(x);original=selected(p);await closeFn(x);visitedIds.add(norm(x.label));if(p.multiple)multi++;
   const choices=p.multiple?subsets(p.options.map(o=>o.label)):p.options.map(o=>[o.label]);
   for(const values of choices){
    if(!alive()){issues.add('deadline');break;}
    try{await select(x,values);await walk(i+1,[...selection,{label:norm(x.label),display:p.multiple?values:values[0],values:[...values].sort(),kind:p.multiple?'aria_multiselect':'aria_listbox'}]);}
    catch(e){if(e?.deepStage)throw e;issues.add('control_or_capture_unverified');}
   }
  }catch(e){if(e?.deepStage)throw e;issues.add('control_or_capture_unverified');}
  finally{if(original!==null&&safeRoute(page.url())){try{await select(x,original);}catch{issues.add('restore_unverified');}}else if(safeRoute(page.url())){try{await closeFn(x);}catch{issues.add('close_unverified');}}}
 }
 if(controls.length)await walk(0,[]);
 visited=visitedIds.size;
 return {controlsObserved:initial.length,eligibleControls:controls.length,visitedControls:visited,statesObserved:states,issues:[...issues],supportedCombinationsExhausted:controls.length>0&&issues.size===0,allFilterCombinationsVerified:false,multiSelectSupported:true,multiSelectVisits:multi};
}
module.exports={safeRoute,approvedControls,traverseCustomFilters,readControls,readOptions};
