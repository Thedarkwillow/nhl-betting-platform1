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
      if(!Number.isFinite(line)||icons.filter(i=>i===book).length!==1||icons.some(i=>![book,'goblin','demon'].includes(i))||icons.includes('goblin')&&icons.includes('demon'))continue;
      // Parse explicit side+price from a book-isolated group, including split text nodes.
      const matches=[...display.matchAll(/(?:^|\s)(O|U|Higher|Lower|Over|Under)\s*([+-]\d{2,4})(?=\s|$)/gi)];
      for(const m of matches){
        const side=/^(o|over|higher)$/i.test(m[1])?'Higher':'Lower';
        if(!apps.some(a=>a.side===side&&a.displayedPrice===m[2]&&a.tier===tier))
          apps.push({book,line,side,displayedPrice:m[2],tier});
      }
    }
    // Keep competitor quotes distinct from the selected fantasy book. The board's line
    // is not assumed to be the competitor's own threshold.
    const sportsbookEvidence=[];
    const supported=new Set(['draftkings','fanduel','betmgm','caesars','pinnacle','bet365','espnbet','fanatics','betrivers','hardrockbet','betonline','bovada','fliff','betfair']);
    const canonical=x=>x.toLowerCase().replace(/[^a-z0-9]/g,'');
    for(const icon of cell?.querySelectorAll('img[alt]')||[]){
      const label=icon.alt.trim(),id=canonical(label);if(!supported.has(id))continue;
      let group=icon.parentElement;
      while(group?.parentElement&&group.parentElement!==cell){const next=group.parentElement,icons=[...next.querySelectorAll('img[alt]')];if(icons.length!==1||icons[0]!==icon)break;group=next;}
      const display=group?.innerText.trim().slice(0,400)||'';
      const prices=[...display.matchAll(/(?:^|\\s)(O|U|Higher|Lower|Over|Under)\\s*([+-]\\d{2,4})(?=\\s|$)/gi)].map(m=>({side:/^(o|over|higher)$/i.test(m[1])?'Higher':'Lower',price:m[2]}));
      sportsbookEvidence.push({book:id,displayedBookLabel:label,display,prices,quoteLine:null,originalPlatformVerified:false,modelInputsApproved:false});
    }
    const research = [];
    for (const [i,metric] of headers.entries()) {
      if (!metric || ['Apps','Line'].includes(metric)) continue;
      const value=tr.cells[i]?.innerText.trim();
      research.push({origin:'board',tab:'Props',metric:metric==='Implied'?'sportsbook_implied':metric,
        value:!value || value==='-'?null:value,scope:'displayed prop',observedAt,
        window:/^(L5|L10|L15|Avg L10|H2H|SZN)$/.test(metric)?metric:null});
    }
    rows.push({sport:rawSport===code.toLowerCase()||code==='DOTA2'&&['dota-2','dota_2'].includes(rawSport)?sport:rawSport,player:a.querySelector('p')?.innerText,
      market,eventId:parts[2],detailId:u.pathname+'?'+u.search.slice(1).split('&').filter(part=>part.startsWith('prop=')).join('&'),
      period:market?.match(/^(\d+(?:st|nd|rd|th)_(?:half|quarter|period))/)?.[1]||null,
      mapRange:market?.match(/^(.*?maps?)_player/)?.[1]||null,gameMode:null,
      observedAt,apps,appEvidence,sportsbookEvidence,research});
  }
  return {authenticated,rows,number:Number(pages?.[1]),total:Number(pages?.[2]),
    empty:table?.innerText.includes('No props found')===true};
}
async function collect(page,{book,code,slot='manual',maxPages=Infinity,shouldContinue=()=>true,onPage=async()=>{}}) {
  if(!['prizepicks','underdog'].includes(book)||!(maxPages===Infinity||Number.isSafeInteger(maxPages)&&maxPages>=1))throw Error('invalid partition');
  const sport=aliases[code]||code.toLowerCase();
  const startedAt=new Date().toISOString();
  const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(startedAt));
  const result={schema:'pickfinder-premium-export-v1',book,sport,slot,localDay,startedAt,pages:[],boardState:'partial',lastPageReached:false};
  if(!shouldContinue())return result;
  await page.getByRole('button',{name:'Open user menu'}).waitFor({timeout:15000});
  await page.waitForFunction(()=>document.body.innerText.split('\n').some(l=>l.trim()==='Premium'),null,{timeout:15000});
  const initial=await page.evaluate(readBoard,{book,code,sport,observedAt:startedAt});
  if(!initial.authenticated)throw Error('premium_session_unavailable');
  const button=(name)=>page.getByRole('button',{name,exact:true});
  let sportButton=button(code);
  if(code==='DOTA2'&&typeof sportButton.count==='function'&&await sportButton.count()===0){
    const alternate=button('Dota 2');
    if(await alternate.count()===1&&await alternate.isVisible())sportButton=alternate;
  }
  await sportButton.waitFor({state:'visible',timeout:10000});
  result.authenticated=true;
  if(!await sportButton.isEnabled()){result.boardState='disabled';result.disabledConfirmed=true;}
  else {
    await sportButton.click();
    await page.getByRole('button',{name:/^Apps /}).click();
    await page.getByRole('option',{name:new RegExp(book+'.*Only','i')}).getByRole('button',{name:'Only',exact:true}).click();
    await page.getByRole('option',{name:'Close',exact:true}).click();
    await button('Apps '+book).waitFor({state:'visible'});
    const read=()=>page.evaluate(readBoard,{book,code,sport,observedAt:new Date().toISOString()});
    let previous='';
    const signature=rows=>JSON.stringify(rows.map(r=>[r.detailId,r.apps,r.appEvidence]));
    const bookSeen=rows=>rows.some(r=>r.apps?.some(a=>a.book===book)||r.appEvidence?.some(a=>a.book===book));
    for(let n=1;n<=maxPages&&shouldContinue();n++){
      let snapshot, stableEmpty=0, ready=false, noBookReads=0;
      for(let retry=0;retry<24&&shouldContinue();retry++){
        snapshot=await read();
        if(!snapshot.authenticated){result.failure='session_expired';break;}
        stableEmpty=snapshot.empty?stableEmpty+1:0;
        const sig=signature(snapshot.rows);
        const scoped=snapshot.number===n && Number.isSafeInteger(snapshot.total) && snapshot.total>=n && snapshot.rows.length>0 && sig!==previous && snapshot.rows.every(r=>r.sport===sport);
        if(scoped&&!bookSeen(snapshot.rows)){noBookReads++;if(noBookReads>=8){result.failure='selected_book_badge_absent';break;}}
        else noBookReads=0;
        if((scoped&&bookSeen(snapshot.rows)) || (n===1&&stableEmpty>=4&&snapshot.rows.length===0)){ready=true;break;}
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      if(!ready){result.failure=result.failure||'page_not_stable_or_scope_mismatch';
        if(result.failure==='selected_book_badge_absent'&&snapshot?.rows?.length){result.displayedPageCount=snapshot.total;result.pages.push({number:n,rows:snapshot.rows});await onPage({book,sport,startedAt,displayedPageCount:snapshot.total,page:result.pages.at(-1),accepted:false});}
        break;}
      if(n===1&&stableEmpty>=4&&snapshot.rows.length===0){result.boardState='empty';result.explicitEmpty=true;result.lastPageReached=true;break;}
      result.displayedPageCount=snapshot.total;
      result.pages.push({number:n,rows:snapshot.rows});
      await onPage({book,sport,startedAt,displayedPageCount:snapshot.total,page:result.pages.at(-1),accepted:true});
      previous=signature(snapshot.rows);
      if(n===snapshot.total){result.lastPageReached=true;result.boardState=snapshot.empty&&n===1?'empty':'populated';break;}
      if(n<maxPages&&shouldContinue())await button('Next page').click();
    }
  }
  result.endedAt=new Date().toISOString();
  return result;
}
module.exports={ORIGIN,collect,readBoard};
