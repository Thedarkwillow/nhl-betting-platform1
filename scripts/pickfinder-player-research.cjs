'use strict';
const {VERSION,tabs,coverage,traverseNativeFilters}=require('./pickfinder-research-coverage.cjs');
const {traverseCustomFilters}=require('./pickfinder-custom-filters.cjs');
// Read only visible sporting data. Never serialize navigation, account menus or HTML.
function readSections({tab,origin,observedAt,context}) {
  const fields=[];
  function add(metric,scope,value,window=null){
    const parts=String(value||'').match(/[\s\S]{1,460}/g)||[''];
    parts.forEach((part,i)=>fields.push({tab,origin,observedAt,...context,scope,
      metric:parts.length===1?metric:metric+' part '+(i+1),window,value:!part||part==='-'?null:part}));
  }
  if(origin==='prop_history'){
    const note=[...document.querySelectorAll('p')].find(p=>/past\s+\d+\s+(?:days|weeks|months|years)/i.test(p.innerText)&&/main lines/i.test(p.innerText));
    const window=note?.innerText.match(/past\s+\d+\s+(?:days|weeks|months|years)/i)?.[0]||null;
    for(const card of note?.nextElementSibling?.children||[]){
      const names=[...card.querySelectorAll('img[alt]')].map(img=>img.alt).join(', ');
      add('historical result',names||'displayed history',card.innerText,window?window+', main lines':null);
    }
    return fields;
  }
  for(const table of document.querySelectorAll('table')){
    if(!table.getClientRects().length)continue;
    // Only capture visible tables in the selected sporting profile; label the actual tab.
    const headers=[...table.querySelectorAll('thead th')].map(e=>e.innerText.trim());
    const header=headers.join(' | ');
    const isMovement=headers.includes('App')&&headers.includes('Time')&&headers.includes('Line');
    if(origin==='line_movement'&&!isMovement)continue;
    if(origin==='prop_history'&&!headers.some(h=>/line|result/i.test(h))||origin==='prop_history'&&isMovement)continue;
    if(origin==='profile'&&isMovement)continue;
    if(!header.trim())continue;
    let i=0;
    for(const tr of table.querySelectorAll('tbody tr')){
      const cells=[...tr.cells].map(c=>({value:c.innerText.trim()||null,labels:[...c.querySelectorAll('img[alt]')].map(e=>e.alt)}));
      const index=++i;
      if(origin==='line_movement'&&isMovement){
        // Keep the app label, quoted sides and source-displayed time together; never infer year/timezone or book.
        for(const name of ['Line','App','Time']){const at=headers.indexOf(name);const cell=cells[at];if(cell)add('movement '+name.toLowerCase(),'movement row '+index,JSON.stringify(cell));}
      }
      add('row '+index,header.slice(0,500),JSON.stringify(cells),headers.includes('Date')?document.body.innerText.match(/Gamelog - (Last \d+ Games)/i)?.[1]||null:null);
    }
  }
  if(origin==='profile'){
    for(const panel of document.querySelectorAll('[role=tabpanel]')){
      if(panel.getClientRects().length&&!panel.querySelector('[role=tabpanel]')&&panel.innerText.trim())
        add('displayed panel',tab,panel.innerText.trim());
    }
    for(const b of document.querySelectorAll('[role=tab]')){
      if(b.getClientRects().length&&b.innerText.includes('avg.'))add('supporting average',b.innerText.split('\n')[0],b.innerText);
    }
  }
  return fields;
}
async function traverseMixed(page,collect,shouldContinue){
 const start=Date.now(),issues=new Set();let states=0,customControls=0;const alive=()=>shouldContinue()&&Date.now()-start<45000;
 const capture=async selection=>{if(!alive()){issues.add('deadline');return;}await collect(selection);states++;};
 async function inner(native){if(!alive()){issues.add('deadline');return;}const a=await traverseCustomFilters(page,{shouldContinue:alive,maxMs:Math.max(1,45000-(Date.now()-start)),onState:s=>capture([...native,...s])});customControls+=a.eligibleControls;for(const i of a.issues)issues.add(i);if(!a.statesObserved)await capture(native);}
 const native=await traverseNativeFilters(page,{shouldContinue:alive,maxMs:45000,onState:inner});
 if(!native.statesObserved&&alive())await inner([]);
 for(const i of native.issues)issues.add(i);
 return {statesObserved:states,customControls,native,issues:[...issues],allFilterCombinationsVerified:false};
}
async function enrich(page,row,{navigate,maxFields=500,expanded=false,shouldContinue=()=>true}){
  if(!(maxFields===Infinity||Number.isInteger(maxFields)&&maxFields>=1&&maxFields<=2000))throw Error('invalid profile field budget');
  const url=new URL(row.detailId,'https://www.pickfinder.app');
  if(url.origin!=='https://www.pickfinder.app'||!url.pathname.startsWith('/players/'))throw Error('invalid profile');
  await navigate(url.href);
  await page.getByRole('button',{name:'Line Movement',exact:true}).waitFor({state:'visible'});
  const groups=[],tabAudit=[];let filterAudit=null,customFilterAudit=null,deadline=false;const tabFilterAudit=[];
  const update=()=>{const remaining=Math.max(0,maxFields-initial.length),nonempty=groups.filter(g=>g.length),limit=Math.floor(remaining/Math.max(1,nonempty.length));row.research=[...initial,...nonempty.flatMap(g=>g.slice(0,limit))];row.profileCollection={observationsAvailable:groups.reduce((n,g)=>n+g.length,0),panels:groups.length,tabAudit:[...tabAudit],truncated:groups.some(g=>g.length>limit)||tabAudit.some(t=>t.state==='failed')||deadline||(expanded&&(!!filterAudit?.issues?.length||!!customFilterAudit?.issues?.length||tabFilterAudit.some(t=>t.audit.issues.length))),...(expanded?{coverageVersion:VERSION,featureCoverage:coverage(row.sport,row.research),filterAudit,customFilterAudit,tabFilterAudit}: {})};};
  const initial=[...row.research];
  const context={period:row.period,mapRange:row.mapRange,gameMode:row.gameMode};
  const collect=async(tab,origin,selection=null)=>{const fields=await page.evaluate(readSections,{tab,origin,observedAt:new Date().toISOString(),context:{...context,...(selection?{filterSelection:selection}:{})}});groups.push(fields);tabAudit.push({tab,origin,fields:fields.length,state:fields.length?'observed':'empty'});update();};
  await collect('Player overview','profile');
  if(expanded&&shouldContinue())filterAudit=await traverseMixed(page,selection=>collect('Player overview','profile',selection),shouldContinue);
  for(const name of [...new Set(['Matchup','Defense','Shooting','Similar','Rankings','Injuries','Player Stats','Maps','Team Form',...(maxFields>500?['Depth Chart','Lineups','Home/Away','Splits','Season','Teammates','Modes','Agents','Champions','Heroes']:[]),...(expanded?tabs:[])])]){
    if(!shouldContinue()){deadline=true;break;}
    const candidate=page.getByRole('tab',{name,exact:true}).or(page.getByRole('button',{name,exact:true}));
    if(expanded&&await candidate.count()!==1){tabAudit.push({tab:name,origin:'profile',state:await candidate.count()?'ambiguous':'not_visible',fields:0});continue;}
    const target=candidate.first();
    if(await target.isVisible()){
      try{await target.click();await collect(name,'profile');if(expanded&&shouldContinue()){const audit=await traverseMixed(page,selection=>collect(name,'profile',selection),shouldContinue);tabFilterAudit.push({tab:name,audit});}}catch{tabAudit.push({tab:name,origin:'profile',state:'failed',fields:0});update();}
    }else tabAudit.push({tab:name,origin:'profile',state:'not_visible',fields:0});
  }
  for(const [name,origin] of [['Line Movement','line_movement'],['Prop History','prop_history']]){
    if(!shouldContinue()){deadline=true;break;}
    const target=page.getByRole('button',{name,exact:true});
    if(await target.isVisible()){try{await target.click();await collect(name,origin);}catch{tabAudit.push({tab:name,origin,state:'failed',fields:0});update();}}else tabAudit.push({tab:name,origin,state:'not_visible',fields:0});
  }
  update();
}
module.exports={enrich,readSections,traverseMixed};
