'use strict';
const {VERSION,tabs,coverage,traverseNativeFilters}=require('./pickfinder-research-coverage.cjs');
const {traverseCustomFilters}=require('./pickfinder-custom-filters.cjs');
// Read only visible sporting data. Never serialize navigation, account menus or HTML.
function readSections({tab,origin,observedAt,context,fullSportingHeaders=false}) {
  const fields=[];
  function add(metric,scope,value,window=null,headerLayout=null){
    const parts=String(value||'').match(/[\s\S]{1,460}/g)||[''];
    parts.forEach((part,i)=>fields.push({tab,origin,observedAt,...context,scope,
      metric:parts.length===1?metric:metric+' part '+(i+1),window,...(headerLayout?{headerLayout}:{}),value:!part||part==='-'?null:part}));
  }
  if(origin==='prop_history'){
    const note=[...document.querySelectorAll('p')].find(p=>/past\s+\d+\s+(?:days|weeks|months|years)/i.test(p.innerText)&&/main lines/i.test(p.innerText));
    const window=note?.innerText.match(/past\s+\d+\s+(?:days|weeks|months|years)/i)?.[0]||null;
    for(const card of note?.nextElementSibling?.children||[]){
      if(!card.getClientRects().length)continue;
      const names=[...card.querySelectorAll('img[alt]')].map(img=>img.alt).join(', ');
      add('historical result',names||'displayed history',card.innerText,window?window+', main lines':null);
    }
    // Some profile versions render a dated history table instead of cards.
    // Retain both evidence shapes without equating observations to settlements.
  }
  for(const table of document.querySelectorAll('table')){
    if(!table.getClientRects().length)continue;
    // Only capture visible tables in the selected sporting profile; label the actual tab.
    // Expand real HTML header spans, rather than flattening every th (which
    // adds phantom columns on multi-row NBA tables). Preserve non-generic
    // group labels so a period/map stat cannot masquerade as a full-game stat.
    const headerRows=[...table.querySelectorAll('thead tr')],grid=[];
    let layout=null,headers=[...table.querySelectorAll('thead th')].map(e=>e.innerText.trim());
    if(headerRows.length&&headerRows.length<=8){
      let ok=true;
      for(let ri=0;ri<headerRows.length&&ok;ri++){
        grid[ri]??=[];let ci=0;
        for(const th of headerRows[ri].cells){
          while(grid[ri][ci])ci++;
          const rs=th.rowSpan,cs=th.colSpan;
          if(th.tagName!=='TH'||!Number.isInteger(rs)||!Number.isInteger(cs)||rs<1||cs<1||ri+rs>headerRows.length||ci+cs>256){ok=false;break;}
          const entry={text:th.innerText.trim(),ri,ci,rs,cs};
          for(let y=ri;y<ri+rs;y++){grid[y]??=[];for(let x=ci;x<ci+cs;x++){if(grid[y][x])ok=false;grid[y][x]=entry;}}
          ci+=cs;
        }
      }
      const width=grid[0]?.length||0;
      if(ok&&width&&grid.length===headerRows.length&&grid.every(row=>row.length===width&&Array.from({length:width},(_,i)=>row[i]).every(Boolean))){
        const generic=/^(?:stats|statistics|player stats|game log|gamelog|game|traditional)$/i;
        const labels=Array.from({length:width},(_,i)=>{
          const entries=[...new Set(grid.map(row=>row[i]))],leaf=entries.at(-1);
          if(!leaf.text||leaf.cs!==1)return null;
          return [...entries.slice(0,-1).map(e=>e.text).filter(t=>t&&!generic.test(t)),leaf.text].join(' / ');
        });
        if(labels.every(Boolean)){headers=labels;layout='span-grid-v1';}
      }
    }
    const header=headers.join(' | ');
    const isMovement=headers.includes('App')&&headers.includes('Time')&&headers.includes('Line');
    if(origin==='line_movement'&&!isMovement)continue;
    if(origin==='prop_history'&&(isMovement||!headers.some(h=>/^(?:(?:prop|main|closing|opening|historical) )?(?:line|threshold)$/i.test(h))||!headers.some(h=>/^(?:result|outcome|actual|actual stat|stat result)$/i.test(h))||!headers.some(h=>/^(?:date|game date|time|app|book|sportsbook|platform)$/i.test(h))))continue;
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
      // Keep complete headers when they fit the public sporting-evidence limit.
      // Oversize headers stay explicitly unaligned, never positionally guessed.
      const limit=fullSportingHeaders?4000:500;
      const scope=header.length<=limit?header:header.slice(0,480)+' | [header truncated]';
      add('row '+index,scope,JSON.stringify(cells),headers.includes('Date')?document.body.innerText.match(/Gamelog - (Last \d+ Games)/i)?.[1]||null:null,layout);
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
async function enrich(page,row,{navigate,maxFields=500,expanded=false,fullSportingHeaders=false,shouldContinue=()=>true}){
  if(!(maxFields===Infinity||Number.isInteger(maxFields)&&maxFields>=1&&maxFields<=2000))throw Error('invalid profile field budget');
  const url=new URL(row.detailId,'https://www.pickfinder.app');
  if(url.origin!=='https://www.pickfinder.app'||!url.pathname.startsWith('/players/'))throw Error('invalid profile');
  await navigate(url.href);
  await page.getByRole('button',{name:'Line Movement',exact:true}).waitFor({state:'visible'});
  const groups=[],tabAudit=[];let filterAudit=null,customFilterAudit=null,deadline=false;const tabFilterAudit=[];
  const update=()=>{const remaining=Math.max(0,maxFields-initial.length),nonempty=groups.filter(g=>g.length),limit=Math.floor(remaining/Math.max(1,nonempty.length));row.research=[...initial,...nonempty.flatMap(g=>g.slice(0,limit))];row.profileCollection={observationsAvailable:groups.reduce((n,g)=>n+g.length,0),panels:groups.length,tabAudit:[...tabAudit],truncated:groups.some(g=>g.length>limit)||tabAudit.some(t=>t.state==='failed')||deadline||(expanded&&(!!filterAudit?.issues?.length||!!customFilterAudit?.issues?.length||tabFilterAudit.some(t=>t.audit.issues.length))),...(expanded?{coverageVersion:VERSION,featureCoverage:coverage(row.sport,row.research),filterAudit,customFilterAudit,tabFilterAudit}: {})};};
  const initial=[...row.research];
  const context={period:row.period,mapRange:row.mapRange,gameMode:row.gameMode};
  const collect=async(tab,origin,selection=null)=>{const fields=await page.evaluate(readSections,{tab,origin,fullSportingHeaders,observedAt:new Date().toISOString(),context:{...context,...(selection?{filterSelection:selection}:{})}});groups.push(fields);tabAudit.push({tab,origin,fields:fields.length,state:fields.length?'observed':'empty'});update();};
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
