'use strict';
// Read only visible sporting data. Never serialize navigation, account menus or HTML.
function readSections({tab,origin,observedAt,context}) {
  const fields=[];
  function add(metric,scope,value,window=null){
    const parts=String(value||'').match(/[\s\S]{1,460}/g)||[''];
    parts.forEach((part,i)=>fields.push({tab,origin,observedAt,...context,scope,
      metric:parts.length===1?metric:metric+' part '+(i+1),window,value:!part||part==='-'?null:part}));
  }
  if(origin==='prop_history'){
    const note=[...document.querySelectorAll('p')].find(p=>p.innerText.includes('past 6 months'));
    for(const card of note?.nextElementSibling?.children||[]){
      const names=[...card.querySelectorAll('img[alt]')].map(img=>img.alt).join(', ');
      add('historical result',names||'displayed history',card.innerText,'past 6 months, main lines');
    }
    return fields;
  }
  for(const table of document.querySelectorAll('table')){
    if(!table.getClientRects().length)continue;
    const headers=[...table.querySelectorAll('thead th')].map(e=>e.innerText.trim());
    const header=headers.join(' | ');
    const isMovement=headers.includes('App')&&headers.includes('Time')&&headers.includes('Line');
    if(origin==='line_movement'&&!isMovement)continue;
    if(origin==='prop_history'&&!headers.some(h=>/line|result/i.test(h))||origin==='prop_history'&&isMovement)continue;
    if(origin==='profile'&&(isMovement||tab!=='Player overview'))continue;
    if(!header.trim())continue;
    let i=0;
    for(const tr of table.querySelectorAll('tbody tr')){
      const cells=[...tr.cells].map(c=>({value:c.innerText.trim()||null,labels:[...c.querySelectorAll('img[alt]')].map(e=>e.alt)}));
      add('row '+(++i),header.slice(0,500),JSON.stringify(cells),headers.includes('Date')?document.body.innerText.match(/Gamelog - (Last \d+ Games)/i)?.[1]||null:null);
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
async function enrich(page,row,{navigate}){
  const url=new URL(row.detailId,'https://www.pickfinder.app');
  if(url.origin!=='https://www.pickfinder.app'||!url.pathname.startsWith('/players/'))throw Error('invalid profile');
  await navigate(url.href);
  await page.getByRole('button',{name:'Line Movement',exact:true}).waitFor({state:'visible'});
  const groups=[];
  const context={period:row.period,mapRange:row.mapRange,gameMode:row.gameMode};
  const collect=async(tab,origin)=>groups.push(await page.evaluate(readSections,{tab,origin,observedAt:new Date().toISOString(),context}));
  await collect('Player overview','profile');
  for(const name of ['Matchup','Rankings','Injuries','Player Stats','Maps','Team Form']){
    const target=page.getByRole('tab',{name,exact:true}).first();
    if(await target.isVisible()){
      await target.click();
      await collect(name,'profile');
    }
  }
  for(const [name,origin] of [['Line Movement','line_movement'],['Prop History','prop_history']]){
    const target=page.getByRole('button',{name,exact:true});
    if(await target.isVisible()){await target.click();await collect(name,origin);}
  }
  // Allocate across panels so a long game log cannot crowd out history or injury data.
  const remaining=500-row.research.length;
  const nonempty=groups.filter(g=>g.length);
  const limit=Math.floor(remaining/Math.max(1,nonempty.length));
  row.profileCollection={observationsAvailable:groups.reduce((n,g)=>n+g.length,0),panels:groups.length};
  for(const group of nonempty)row.research.push(...group.slice(0,limit));
}
module.exports={enrich,readSections};
