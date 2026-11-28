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
      const matches=[...display.matchAll(/(?:^|\s)(O|U|Higher|Lower|Over|Under)\s*(?:(\d+(?:\.\d+)?)\s+)?\(?([+-]\d{2,4})\)?(?=\s|$)/gi)].filter(m=>Math.abs(Number(m[3]))>=100&&(m[2]===undefined||Number(m[2])===line));
      for(const m of matches){
        const side=/^(o|over|higher)$/i.test(m[1])?'Higher':'Lower';
        if(!apps.some(a=>a.side===side&&a.displayedPrice===m[3]&&a.tier===tier))
          apps.push({book,line,side,displayedPrice:m[3],tier});
      }
    }
    // Keep competitor quotes distinct from the selected fantasy book. The board's line
    // is not assumed to be the competitor's own threshold.
    const sportsbookEvidence=[];
    const supported=new Set(['prizepicks','underdog','draftkings','fanduel','betmgm','caesars','pinnacle','bet365','espnbet','fanatics','betrivers','hardrockbet','betonline','bovada','fliff','betfair']);
    const canonical=x=>x.toLowerCase().replace(/[^a-z0-9]/g,'');
    for(const icon of cell?.querySelectorAll('img[alt]')||[]){
      const label=icon.alt.trim(),id=canonical(label);if(!id||['goblin','demon'].includes(id))continue;
      let group=icon.parentElement;
      while(group?.parentElement&&group.parentElement!==cell){const next=group.parentElement,icons=[...next.querySelectorAll('img[alt]')];if(icons.length!==1||icons[0]!==icon)break;group=next;}
      const display=group?.innerText.trim().slice(0,400)||'';
      const isolatedGroup=group&&group!==cell&&[...group.querySelectorAll('img[alt]')].length===1&&supported.has(id);
      const normalizeOdds=t=>t.replace(/\u2212/g,'-').replace(/\u00a0/g,' ');
      const prices=isolatedGroup?[...normalizeOdds(display).matchAll(/(?:^|[\s,;])(O|U|Higher|Lower|Over|Under)\s*(?:(\d+(?:\.\d+)?)\s+)?\(?([+-]\d{2,4})\)?(?=[\s,;]|$)/gi)].filter(m=>Math.abs(Number(m[3]))>=100).map(m=>({side:/^(o|over|higher)$/i.test(m[1])?'Higher':'Lower',price:m[3],quoteLine:m[2]===undefined?null:Number(m[2])})):[];
      // A threshold must be explicitly attached to this book's isolated quote group.
      // A fantasy offer line, unlabeled number, or another book's tooltip is not evidence.
      const isolated=isolatedGroup&&!['prizepicks','underdog'].includes(id);
      if(isolated){
        // The price clock must be separately identified inside the same visible
        // sportsbook block as two literal odds at one literal line. Game, local
        // observation, tooltip-only, and generic or multiple clocks do not qualify.
        const quoteTimes=[...group.querySelectorAll('time[datetime]')].filter(t=>t.getClientRects().length);
        const quoteTime=quoteTimes.length===1&&/^(?:sportsbook )?quote (?:time|updated at)$/i.test(
          (quoteTimes[0].getAttribute('aria-label')||quoteTimes[0].getAttribute('title')||'').trim())?
          quoteTimes[0].getAttribute('datetime'):null;
        const literalBlock=normalizeOdds(display),inlineThresholds=[...new Set([...literalBlock.matchAll(
         /\b(?:sportsbook\s+)?(?:line|threshold)(?:\s*[:=]\s*|\s+)(\d+(?:\.\d+)?)(?=\s|[,;)]|$)/gi)].map(m=>Number(m[1])))];
        const inlineClockLine=inlineThresholds.length===1?inlineThresholds[0]:null;
        const inlinePair=inlineThresholds.length<=1&&prices.length===2&&prices[0].side!==prices[1].side&&
         (prices[0].quoteLine??inlineClockLine)!==null&&(prices[0].quoteLine??inlineClockLine)===(prices[1].quoteLine??inlineClockLine)&&
         (inlineClockLine===null||prices.every(p=>p.quoteLine===null||p.quoteLine===inlineClockLine));
        const local=[group,...group.querySelectorAll('[aria-label],[title],[aria-describedby]')];
        // Only a visible tooltip explicitly associated with this isolated book
        // and explicitly naming it may contribute. Never use the fantasy line,
        // unrelated popovers, hidden DOM, or raw tooltip content in exports.
        const described=[...new Set(local.flatMap(e=>(e.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean)))].flatMap(ref=>{
          const e=document.getElementById(ref);
          if(!e||e.getAttribute('role')!=='tooltip'||!e.getClientRects().length)return [];
          const t=e.innerText.trim();
          return t.length<=400&&canonical(t).includes(id)?[t]:[];
        });
        const texts=[display,...local.flatMap(e=>[e.getAttribute('aria-label'),e.getAttribute('title')]),...described].filter(t=>typeof t==='string'&&t.length<=400).map(normalizeOdds);
        const thresholds=new Set(texts.flatMap(t=>[...t.matchAll(/\b(?:sportsbook\s+)?(?:line|threshold)(?:\s*[:=]\s*|\s+)(\d+(?:\.\d+)?)(?=\s|[,;)]|$)/gi)].map(m=>Number(m[1]))));
        const explicit=thresholds.size===1?[...thresholds][0]:null;
        for(const t of texts)for(const m of t.matchAll(/(?:^|[\s,;])(O|Over|Higher|U|Under|Lower)\s*(\d+(?:\.\d+)?)\s*\(?([+-]\d{2,4})\)?(?=\s|[,;]|$)/gi)){
          if(Math.abs(Number(m[3]))<100)continue;
          const side=/^(?:O|Over|Higher)$/i.test(m[1])?'Higher':'Lower';
          const price=m[3],quoteLine=Number(m[2]);
          if(!prices.some(p=>p.side===side&&p.price===price&&p.quoteLine===quoteLine))prices.push({side,price,quoteLine});
        }
        if(explicit!==null&&prices.every(p=>p.quoteLine===null||p.quoteLine===explicit))for(const p of prices)if(p.quoteLine===null)p.quoteLine=explicit;
        if(quoteTime&&inlinePair&&prices.length===2&&thresholds.size<=1&&(explicit===null||explicit===prices[0].quoteLine))
          for(const p of prices)Object.assign(p,{sourceQuoteDateTime:quoteTime,sourceQuoteTimeBasis:'provider_quote_time_element'});
      }
      sportsbookEvidence.push({book:supported.has(id)?id:null,displayedBookLabel:label,unclassifiedBookBadge:!supported.has(id),display,prices,quoteLine:null,originalPlatformVerified:false,modelInputsApproved:false});
    }
    const research = [];
    for (const [i,metric] of headers.entries()) {
      if (!metric || ['Apps','Line'].includes(metric)) continue;
      const value=tr.cells[i]?.innerText.trim();
      research.push({origin:'board',tab:'Props',metric:metric==='Implied'?'sportsbook_implied':metric,
        value:!value || value==='-'?null:value,scope:'displayed prop',observedAt,
        window:/^(L5|L10|L15|Avg L10|H2H|SZN)$/.test(metric)?metric:null});
    }
    // Keep the provider's displayed clock on this exact player/market link.
    // The visible weekday and time do not, by themselves, establish a date or zone.
    const localMatchups=new Map();
    const props=[...(tr.querySelectorAll?.('a[href*="/players/"][href*="prop="]')||[])];
    const singleProp=props.every(other=>other.href===a.href);
    const textSources=[a.innerText,...(singleProp?[...tr.cells].filter((c,i)=>c!==cell&&
      !/^(?:Apps|Implied|Odds|Price|Sportsbook|Movement|History)/i.test(headers[i]||'')).map(c=>c.innerText):[])];
    for(const text of textSources){
      const lines=(text||'').split('\n').map(x=>x.trim()).filter(Boolean);
      for(let i=0;i<lines.length;i++){
        for(const raw of [lines[i],i+1<lines.length?lines[i]+' '+lines[i+1]:'']){
          const label=raw.trim();
          const m=label.match(/^([A-Z]{2,4})\s+(@|vs\.?)\s+([A-Z]{2,4})\s*[•·]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*@\s*(?:1[0-2]|[1-9]):[0-5]\d\s*[AP]M$/i);
          if(m&&m[1].toUpperCase()!==m[3].toUpperCase())localMatchups.set(label.replace(/\s+/g,' '),m);
        }
      }
    }
    const local=localMatchups.size===1?[...localMatchups.entries()][0]:null;
    const matchups=(a.innerText||'').split('\n').map(line=>line.trim().match(/^([A-Za-z0-9][A-Za-z0-9 ._-]{0,39}?)\s+(@|vs\.?)\s+([A-Za-z0-9][A-Za-z0-9 ._-]{0,39})$/i)).filter(Boolean);
    const pair=local?.[1]??(localMatchups.size===0&&matchups.length===1?matchups[0]:null);
    if(pair&&pair[1]!==pair[3]){
      for(const [metric,value] of [['Team',pair[1]],['Opponent',pair[3]],...(local?[['Displayed Matchup and Time',local[0]]]:[])])
        research.push({origin:'board',tab:'Props',metric,value,scope:'displayed prop',observedAt});
    }
    // Sportsbook clocks live in the Apps cell and cannot establish or block the game clock.
    const times=[...(tr.querySelectorAll?.('time[datetime]')||[])].filter(t=>!cell||t.closest('td')!==cell);
    const eventTimes=[...new Set(times.map(t=>t.getAttribute('datetime')).filter(t=>typeof t==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(t)&&Number.isFinite(Date.parse(t))))];
    // A single explicitly labeled game/start time only; never infer a clock from event ID.
    const labeledTimes=times.filter(t=>/^(?:game|match|event|scheduled)\s*(?:start|time)/i.test(t.getAttribute('aria-label')||t.getAttribute('title')||'')||/^(?:Game|Match|Event|Scheduled) (?:Start|Time|Start Time)$/i.test(headers[t.closest('td')?.cellIndex]||''));
    const startAt=eventTimes.length===1&&labeledTimes.some(t=>t.getAttribute('datetime')===eventTimes[0])?eventTimes[0]:null;
    rows.push({startAt,sport:rawSport===code.toLowerCase()||code==='DOTA2'&&['dota-2','dota_2'].includes(rawSport)?sport:rawSport,player:a.querySelector('p')?.innerText,
      market,eventId:parts[2],detailId:u.pathname+'?'+u.search.slice(1).split('&').filter(part=>part.startsWith('prop=')).join('&'),
      period:market?.match(/^(\d+(?:st|nd|rd|th)_(?:half|quarter|period))/)?.[1]||null,
      mapRange:market?.match(/^(.*?maps?)_player/)?.[1]||null,gameMode:null,
      observedAt,apps,appEvidence,sportsbookEvidence,research});
  }
  return {authenticated,rows,number:Number(pages?.[1]),total:Number(pages?.[2]),
    empty:table?.innerText.includes('No props found')===true};
}
// Compact cards are sampled separately: no book, price, board coverage, or UTC start is inferred.
function readCompactBoardClocks({sport,observedAt,limit=20,authenticatedContextVerified=false}){
  const visible=e=>e.getClientRects().length>0;
  const standalone=document.body.innerText.split('\n').some(x=>x.trim()==='Premium')&&
    !!document.querySelector('button[aria-label="Open user menu"]');
  const loginWall=[...document.querySelectorAll('input[type="password"]')].some(visible);
  const authenticated=(standalone||authenticatedContextVerified===true)&&!loginWall;
  if(!authenticated||location.origin!=='https://www.pickfinder.app'||location.pathname!=='/props')return {authenticated:false,records:[]};
  const selector='a[href*="/players/"][href*="prop="]';
  const links=[...document.querySelectorAll(selector)].filter(visible), records=[], seen=new Set();
  for(const a of links){
    const u=new URL(a.href),bits=u.searchParams.get('prop')?.split(':');
    if(u.origin!==location.origin||!new RegExp('^/players/'+sport+'/[A-Za-z0-9_-]+$').test(u.pathname)||
       u.searchParams.getAll('prop').length!==1||bits?.length!==4||!bits[0]||!bits[2]||
       !/^[a-z0-9_+]+$/i.test(bits[1])||!/^\d+(?:\.\d+)?$/.test(bits[3]))continue;
    const detailId=u.pathname+'?'+new URLSearchParams({prop:bits.join(':')}).toString();
    if(seen.has(detailId))continue;
    for(let card=a,depth=0;card&&card!==document.body&&depth<6;card=card.parentElement,depth++){
      if(!visible(card)||[...card.querySelectorAll(selector)].some(x=>visible(x)&&x.href!==a.href))break;
      const lines=(card.innerText||'').split('\n').map(x=>x.trim()).filter(Boolean);
      if(lines.length>40)break;
      const propLines=lines.map((x,i)=>({i,m:x.match(/^(?:O\/U|Over\/Under)\s+(\d+(?:\.\d+)?)\s+([\w ()+&/.-]{2,100})$/i)})).filter(x=>x.m);
      const prop=propLines.length===1?propLines[0]:null;
      if(!prop||prop.i<1||Number(prop.m[1])!==Number(bits[3]))continue;
      const player=lines[prop.i-1].replace(/\s*\([A-Za-z0-9/.-]{1,12}\)\s*$/,'').trim();
      if(!/^[\p{L}\p{M}][\p{L}\p{M} .’'-]{1,79}$/u.test(player))continue;
      const matchups=[...new Set([lines[prop.i+1],lines.slice(prop.i+1,prop.i+3).join(' ')].filter(x=>
        /^([A-Z]{2,4})\s+(@|vs\.?)\s+([A-Z]{2,4})\s*[•·]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*@\s*(?:1[0-2]|[1-9]):[0-5]\d\s*[AP]M$/i.test(x||'')))];
      if(matchups.length!==1)continue;
      records.push({sport,player,market:bits[1],eventId:bits[2],threshold:Number(bits[3]),detailId,
        displayedPropLabel:prop.m[0],displayedMatchupLabel:matchups[0],observedAt,startAt:null,sourceBook:null});
      seen.add(detailId);break;
    }
    if(records.length>=limit)break;
  }
  return {authenticated,visiblePropLinks:links.length,records};
}
// Read and act on the same visible pager, instead of selecting between
// duplicate responsive controls by a generic accessibility name.
async function advanceBoundPager(page,expected,total){
 const q=page.locator('button[aria-label="Next page"]:visible');
 const read=e=>{
  const match=e.parentElement?.innerText.match(/Page\s*(\d+)\s*\/\s*(\d+)/);
  return {page:match?Number(match[1]):null,total:match?Number(match[2]):null,
    disabled:e.disabled===true||e.getAttribute('aria-disabled')==='true'};
 };
 let items;
 try{items=await q.evaluateAll(es=>es.map(e=>{
  const m=e.parentElement?.innerText.match(/Page\s*(\d+)\s*\/\s*(\d+)/);
  return {page:m?Number(m[1]):null,total:m?Number(m[2]):null,disabled:e.disabled===true||e.getAttribute('aria-disabled')==='true'};
 }));}catch{return {ok:false,reason:'pager_controls_unreadable'};}
 const relevant=items.map((r,i)=>({...r,i})).filter(r=>r.page===expected&&r.total===total);
 const report={visibleControls:items.length,boundControls:relevant.length,disabledBoundControls:relevant.filter(r=>r.disabled).length};
 if(relevant.length!==1)return {ok:false,reason:relevant.length?'ambiguous_bound_pager':'no_bound_visible_pager',...report};
 if(relevant[0].disabled)return {ok:false,reason:'bound_pager_disabled',...report};
 const candidate=q.nth(relevant[0].i);
 try{
  const fresh=await candidate.evaluate(read);
  if(fresh?.page!==expected||fresh?.total!==total||fresh.disabled||!await candidate.isVisible()||!await candidate.isEnabled())
   return {ok:false,reason:'bound_pager_changed',...report};
  await candidate.click({timeout:5000});
  return {ok:true,reason:'bound_pager_clicked',...report};
 }catch(e){
  const m=String(e?.message??'');
  const reason=/intercepts pointer|intercepted/i.test(m)?'bound_pager_pointer_intercepted':/timeout/i.test(m)?'bound_pager_timeout':'bound_pager_click_rejected';
  return {ok:false,reason,...report};
 }
}

async function collect(page,{book,code,slot='manual',maxPages=Infinity,shouldContinue=()=>true,onPage=async()=>{},auditTraversal=false}) {
  if(!['prizepicks','underdog'].includes(book)||!(maxPages===Infinity||Number.isSafeInteger(maxPages)&&maxPages>=1))throw Error('invalid partition');
  const sport=aliases[code]||code.toLowerCase();
  const startedAt=new Date().toISOString();
  const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(startedAt));
  const result={schema:'pickfinder-premium-export-v1',book,sport,slot,localDay,startedAt,pages:[],boardState:'partial',lastPageReached:false};
  if(auditTraversal)result.traversalAudit={bookGapPages:[],pageChecks:[],firstDisplayedTotal:null,displayedTotalChanged:false,selectedControlRequired:true,lastPageTraversalVerified:false};
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
    // Live prices may change while old rows remain on screen. Identity, not price, proves progress.
    const signature=rows=>JSON.stringify(rows.map(r=>r.detailId).sort());
    const bookSeen=rows=>rows.some(r=>r.apps?.some(a=>a.book===book)||r.appEvidence?.some(a=>a.book===book));
    const readCount=rows=>rows.filter(r=>bookSeen([r])).length;
    const selected=async()=>{
      try{const b=button('Apps '+book);return await b.count()===1&&await b.isVisible();}catch{return false;}
    };
    const note=(n,snapshot,kind)=>{
      if(!auditTraversal)return;
      const trace=result.traversalAudit,total=snapshot.total;
      if(trace.firstDisplayedTotal===null)trace.firstDisplayedTotal=total;
      else if(total!==trace.firstDisplayedTotal)trace.displayedTotalChanged=true;
      if(trace.pageChecks.length<100)trace.pageChecks.push({page:n,displayedTotal:total,propRows:snapshot.rows.length,selectedBadgeRows:readCount(snapshot.rows),kind});
    };
    for(let n=1;n<=maxPages&&shouldContinue();n++){
      let snapshot, stableEmpty=0, ready=false, noBookReads=0,gap=false,gapSignature='';
      const rejection={page:0,sport:0,repeat:0,empty:0,book:0};
      for(let retry=0;retry<64&&shouldContinue();retry++){
        snapshot=await read();
        if(!snapshot.authenticated){result.failure='session_expired';break;}
        stableEmpty=snapshot.empty?stableEmpty+1:0;
        const sig=signature(snapshot.rows);
        const scoped=snapshot.number===n && Number.isSafeInteger(snapshot.total) && snapshot.total>=n && snapshot.rows.length>0 && sig!==previous && snapshot.rows.every(r=>r.sport===sport);
        if(snapshot.number!==n||!Number.isSafeInteger(snapshot.total)||snapshot.total<n)rejection.page++;
        else if(!snapshot.rows.length)rejection.empty++;
        else if(snapshot.rows.some(r=>r.sport!==sport))rejection.sport++;
        else if(sig===previous)rejection.repeat++;
        else if(!bookSeen(snapshot.rows))rejection.book++;
        if(scoped&&!bookSeen(snapshot.rows)){
          if(auditTraversal){
            // A changed pager and stable rows can prove browsing progression, not book ownership.
            // Only recover an observation if the actual selected-book control remains visible.
            const current=JSON.stringify([snapshot.total,sig]);
            noBookReads=gapSignature===current?noBookReads+1:1;gapSignature=current;
            if(noBookReads>=8){
              if(await selected()){ready=true;gap=true;break;}
              result.failure='selected_book_control_not_confirmed';break;
            }
          }else{noBookReads++;if(noBookReads>=8){result.failure='selected_book_badge_absent';break;}}
        }
        else noBookReads=0;
        if((scoped&&bookSeen(snapshot.rows)) || (n===1&&stableEmpty>=4&&snapshot.rows.length===0)){ready=true;break;}
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      if(!ready){result.failure=result.failure||'page_not_stable_or_scope_mismatch';
        result.pageFailureDiagnostics={expectedPage:n,observedPage:Number.isSafeInteger(snapshot?.number)?snapshot.number:null,displayedTotal:Number.isSafeInteger(snapshot?.total)?snapshot.total:null,rejection};
        if(result.failure==='selected_book_badge_absent'&&snapshot?.rows?.length){result.displayedPageCount=snapshot.total;result.pages.push({number:n,rows:snapshot.rows});await onPage({book,sport,startedAt,displayedPageCount:snapshot.total,page:result.pages.at(-1),accepted:false});}
        break;}
      if(auditTraversal&&!await selected()){
        result.failure='selected_book_control_not_confirmed';
        result.pageFailureDiagnostics={expectedPage:n,observedPage:snapshot.number,displayedTotal:snapshot.total,rejection};
        break;
      }
      if(n===1&&stableEmpty>=4&&snapshot.rows.length===0){result.boardState='empty';result.explicitEmpty=true;result.lastPageReached=true;break;}
      result.displayedPageCount=snapshot.total;
      result.pages.push({number:n,rows:snapshot.rows});
      note(n,snapshot,gap?'no_row_book_badge':'row_book_badge_observed');
      if(gap&&result.traversalAudit.bookGapPages.length<100)result.traversalAudit.bookGapPages.push(n);
      await onPage({book,sport,startedAt,displayedPageCount:snapshot.total,page:result.pages.at(-1),accepted:!gap});
      previous=signature(snapshot.rows);
      if(n===snapshot.total){
        result.lastPageReached=true;
        if(auditTraversal)result.traversalAudit.lastPageTraversalVerified=true;
        const incomplete=auditTraversal&&(result.traversalAudit.bookGapPages.length||result.traversalAudit.displayedTotalChanged);
        result.boardState=incomplete?'partial':snapshot.empty&&n===1?'empty':'populated';
        if(incomplete)result.failure=result.traversalAudit.displayedTotalChanged?'displayed_total_changed':'traversed_with_unverified_book_pages';
        break;
      }
      if(n<maxPages&&shouldContinue()){
        if(auditTraversal&&typeof page.locator==='function'){
          const pager=await advanceBoundPager(page,n,snapshot.total);
          if(result.traversalAudit.pageChecks.at(-1)?.page===n)result.traversalAudit.pageChecks.at(-1).pager=pager;
          if(!pager.ok){
            result.failure='next_page_click_failed';
            result.pageFailureDiagnostics={expectedPage:n+1,observedPage:n,displayedTotal:snapshot.total,rejection,pager};
            break;
          }
          continue;
        }
        try{await button('Next page').click();}
        catch(err){
          if(!auditTraversal)throw err;
          result.failure='next_page_click_failed';
          result.pageFailureDiagnostics={expectedPage:n+1,observedPage:n,displayedTotal:snapshot.total,rejection};
          break;
        }
      }
    }
  }
  result.endedAt=new Date().toISOString();
  return result;
}
module.exports={ORIGIN,collect,readBoard,readCompactBoardClocks,advanceBoundPager};
