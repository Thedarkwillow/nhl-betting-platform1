'use strict';
const ORIGIN = 'https://www.pickfinder.app';
const aliases = {CFB:'college-football', CBB:'college-basketball', VAL:'valorant'};
function readBoard({book, code, sport, observedAt}) {
  const premium = document.body.innerText.split('\n').some(line => line.trim() === 'Premium');
  const authenticated = premium && !!document.querySelector('button[aria-label="Open user menu"]');
  const footer = document.querySelector('button[aria-label="Next page"]')?.parentElement;
  const pages = footer?.innerText.match(/Page\s*(\d+)\s*\/\s*(\d+)/);
  const table = document.querySelector('table');
  const headers = [...(table?.querySelectorAll('th') || [])].map(h => h.innerText.trim().split('\n')[0]);
  const rows = [];
  for (const tr of table?.querySelectorAll('tbody tr') || []) {
    const a = tr.querySelector('a[href*="/players/"]');
    if (!a) continue;
    const u = new URL(a.href);
    const parts = u.searchParams.get('prop')?.split(':') || [];
    const rawSport = u.pathname.split('/')[2];
    const market = parts[1];
    const line = parts[3] && Number(parts[3]);
    const apps = [], appEvidence=[];
    const cell = tr.cells[headers.indexOf('Apps')];
    const badges = [...(cell?.querySelectorAll('img[alt]')||[])].filter(i=>i.alt.toLowerCase()===book);
    for(const badge of badges){
      // Choose the largest local group before crossing into a different book or the entire cell.
      let group=badge.parentElement;
      while(group?.parentElement&&group.parentElement!==cell){
        const candidate=group.parentElement;
        const icons=[...candidate.querySelectorAll('img[alt]')].map(i=>i.alt.toLowerCase());
        if(icons.filter(i=>i===book).length!==1||icons.some(i=>![book,'goblin','demon'].includes(i)))break;
        group=candidate;
      }
      const icons=[...(group?.querySelectorAll('img[alt]')||[])].map(i=>i.alt.toLowerCase());
      const tier=icons.includes('goblin')&&icons.includes('demon')?null:icons.find(i=>i==='goblin'||i==='demon')||null;
      const display=group?.innerText.trim().slice(0,400)||'';
      appEvidence.push({book,icons,tier,display,line:Number.isFinite(line)?line:null,
        state:Number.isFinite(line)?'book_badge_observed':'line_missing'});
      if(!Number.isFinite(line)||icons.includes('goblin')&&icons.includes('demon'))continue;
      // Parse explicit side+price from a book-isolated group, including split text nodes.
      const matches=[...display.matchAll(/(?:^|\s)(O|U|Higher|Lower|Over|Under)\s*([+-]\d{2,4})(?=\s|$)/gi)];
      for(const m of matches){
        const side=/^(o|over|higher)$/i.test(m[1])?'Higher':'Lower';
        if(!apps.some(a=>a.side===side&&a.displayedPrice===m[2]&&a.tier===tier))
          apps.push({book,line,side,displayedPrice:m[2],tier});
      }
    }
    const research = [];
    for (const [i,metric] of headers.entries()) {
      if (!metric || ['Apps','Line'].includes(metric)) continue;
      const value=tr.cells[i]?.innerText.trim();
      research.push({origin:'board',tab:'Props',metric:metric==='Implied'?'sportsbook_implied':metric,
        value:!value || value==='-'?null:value,scope:'displayed prop',observedAt,
        window:/^(L5|L10|L15|Avg L10|H2H|SZN)$/.test(metric)?metric:null});
    }
    rows.push({sport:rawSport===code.toLowerCase()?sport:rawSport,player:a.querySelector('p')?.innerText,
      market,eventId:parts[2],detailId:u.pathname+'?'+u.search.slice(1).split('&').filter(part=>part.startsWith('prop=')).join('&'),
      period:market?.match(/^(\d+(?:st|nd|rd|th)_(?:half|quarter|period))/)?.[1]||null,
      mapRange:market?.match(/^(.*?maps?)_player/)?.[1]||null,gameMode:null,
      observedAt,apps,appEvidence,research});
  }
  return {authenticated,rows,number:Number(pages?.[1]),total:Number(pages?.[2]),
    empty:table?.innerText.includes('No props found')===true};
}
async function collect(page,{book,code,slot='manual',maxPages=500,shouldContinue=()=>true}) {
  if(!['prizepicks','underdog'].includes(book)||!Number.isInteger(maxPages)||maxPages<1||maxPages>500)throw Error('invalid partition');
  const sport=aliases[code]||code.toLowerCase();
  const startedAt=new Date().toISOString();
  const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(startedAt));
  const result={schema:'pickfinder-premium-export-v1',book,sport,slot,localDay,startedAt,pages:[],boardState:'partial',lastPageReached:false};
  if(!shouldContinue())return result;
  const initial=await page.evaluate(readBoard,{book,code,sport,observedAt:startedAt});
  if(!initial.authenticated)throw Error('premium_session_unavailable');
  const button=(name)=>page.getByRole('button',{name,exact:true});
  const sportButton=button(code);
  if(!await sportButton.isEnabled())result.boardState='disabled';
  else {
    await sportButton.click();
    await page.getByRole('button',{name:/^Apps /}).click();
    await page.getByRole('option',{name:new RegExp(book+'.*Only','i')}).getByRole('button',{name:'Only',exact:true}).click();
    await page.getByRole('option',{name:'Close',exact:true}).click();
    await button('Apps '+book).waitFor({state:'visible'});
    const read=()=>page.evaluate(readBoard,{book,code,sport,observedAt:new Date().toISOString()});
    let previous='';
    for(let n=1;n<=maxPages&&shouldContinue();n++){
      let snapshot, stableEmpty=0, ready=false;
      for(let retry=0;retry<24&&shouldContinue();retry++){
        snapshot=await read();
        if(!snapshot.authenticated){result.failure='session_expired';break;}
        stableEmpty=snapshot.empty?stableEmpty+1:0;
        const first=snapshot.rows[0]?.detailId;
        if(snapshot.number===n && ((first && first!==previous && snapshot.rows.every(r=>r.sport===sport)) || stableEmpty>=4)){ready=true;break;}
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      if(!ready)break;
      result.displayedPageCount=snapshot.total;
      result.pages.push({number:n,rows:snapshot.rows});
      previous=snapshot.rows[0]?.detailId;
      if(n===snapshot.total){result.lastPageReached=true;result.boardState=snapshot.empty&&n===1?'empty':'populated';break;}
      if(n<maxPages&&shouldContinue())await button('Next page').click();
    }
  }
  result.endedAt=new Date().toISOString();
  return result;
}
module.exports={ORIGIN,collect,readBoard};
