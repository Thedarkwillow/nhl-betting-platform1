'use strict';
const fs=require('node:fs'),path=require('node:path'),{normalize}=require('./pickfinder-premium-archive.cjs'),{collect,ORIGIN}=require('./pickfinder-browser.cjs'),{enrich}=require('./pickfinder-player-research.cjs'),{VERSION}=require('./pickfinder-research-coverage.cjs'),{checkpointBuffer}=require('./pickfinder-checkpoint-buffer.cjs'),{pacific,decide}=require('./pacific-morning-capture-gate.cjs'),{prioritySports,registry}=require('./season-aware-collection.cjs'),{discover}=require('./season-aware-discovery.cjs'),{openHostedBoard}=require('./pickfinder-unattended-runner.cjs'),{persist,read,safe,sha,assertDestination}=require('./pickfinder-public-archive.cjs');
const {verifiedNavigation,traverseDashboardFilters,inspectCapabilities}=require('./pickfinder-dashboard-research.cjs');
const {inspectTool}=require('./pickfinder-tool-schema.cjs');
const gameContext=require('./pickfinder-public-nba-context.cjs'),{load}=require('./pickfinder-public-evidence-audit.cjs');
const CORE=['NBA','NHL','NFL','CS2','DOTA2','VAL','LOL','COD','MLB','WNBA','CFB','CBB','TENNIS','SOCCER'],BOOKS=['prizepicks','underdog'];
function invocation(env,now=new Date()){
 if(env.PICKFINDER_AUTOMATION_AUTHORIZED!=='1'||env.PICKFINDER_PUBLIC_DATA_AUTHORIZED!=='1')throw Error('authorization required');
 if(env.GITHUB_EVENT_NAME==='schedule'&&/^[0-9]+ (6|9) \* \* \*$/.test(env.GITHUB_EVENT_SCHEDULE))return decide({eventName:'schedule',schedule:env.GITHUB_EVENT_SCHEDULE,now});
 if(env.GITHUB_EVENT_NAME==='workflow_dispatch'&&['capture_0600','capture_0900'].includes(env.REQUESTED_MODE))return decide({eventName:'workflow_dispatch',mode:env.REQUESTED_MODE,now});
 const clock=pacific(now),mode=env.REQUESTED_MODE||'board_and_deep';
 if(!['board_and_deep','deep_research_now','probe_now','nba_context_only'].includes(mode))throw Error('mode');
 if([6,9].includes(clock.hour))return {allowed:false,state:'protect_morning_hour',clock};
 return {allowed:true,expected:'manual',clock,deep:mode==='deep_research_now'||mode==='nba_context_only',contextOnly:mode==='nba_context_only',probe:mode==='probe_now'};
}
function cleanBoard(batch){
 const n=normalize(batch);return safe({...n,sourceDigest:sha(JSON.stringify(batch)),schema:'pickfinder-public-normalized-v1',authenticated:batch.authenticated===true,explicitEmpty:batch.explicitEmpty===true,disabledConfirmed:batch.disabledConfirmed===true,displayedPageCount:batch.displayedPageCount??null,lastPageReached:batch.lastPageReached===true,rawHtmlPublished:false,accountDataPublished:false});
}
function splitBoard(n){
 const {offers,researchObservations,unpricedTierObservations,sportsbookQuotes,...meta}=n,parts=[];
 for(const [field,values] of Object.entries({offers,researchObservations,unpricedTierObservations,sportsbookQuotes})){
  let rows=[],bytes=0;for(const value of values||[]){const size=Buffer.byteLength(JSON.stringify(value))+1;if(size>2000000)throw Error('record too large');if(bytes+size>2000000){parts.push({schema:'pickfinder-public-board-part-v1',book:n.book,sport:n.sport,sourceDigest:n.sourceDigest,field,rows});rows=[];bytes=0;}rows.push(value);bytes+=size;}if(rows.length)parts.push({schema:'pickfinder-public-board-part-v1',book:n.book,sport:n.sport,sourceDigest:n.sourceDigest,field,rows});
 }return {meta,parts};
}
function sharedScope(s){
 const {sport,player,market,eventId,detailId}=s;
 if(!sport||!player||!market||!eventId||!detailId)return null;
 let u;try{u=new URL(detailId,ORIGIN);}catch{return null;}
 if(u.origin!==ORIGIN||!u.pathname.startsWith('/players/')||u.searchParams.getAll('prop').length!==1||[...u.searchParams.keys()].some(k=>k!=='prop'))return null;
 return {sport,player,market,eventId,detailId:u.pathname+'?'+u.searchParams.toString(),period:s.period??null,mapRange:s.mapRange??null,gameMode:s.gameMode??null};
}
function queue(boards,profiles){
 const done=new Set(),attempted=new Map();for(const b of profiles)for(const r of b.records||[]){const scope=sharedScope(r);if(!scope)continue;const key=sha(JSON.stringify(scope));attempted.set(key,(attempted.get(key)||0)+1);if(r.status==='sampled'&&r.coverageVersion===VERSION&&r.truncated===false&&r.research?.length)done.add(key);}
 const q=new Map();let references=0;
 for(const b of boards)for(const o of [...b.offers||[],...b.unpricedTierObservations||[],...(['offers','unpricedTierObservations'].includes(b.field)?b.rows:[])]){
  if(!['prizepicks','underdog'].includes(b.book))continue;
  const scope=sharedScope({...o,sport:b.sport});if(!scope)continue;
  const key=sha(JSON.stringify(scope)),prev=q.get(key);references++;
  const books=[...new Set([...(prev?.books||[]),b.book])].sort();
  q.set(key,{key,...scope,book:books[0],books});
 }
 const groups=new Map();for(const x of q.values())if(!done.has(x.key)){const a=groups.get(x.sport)||[];a.push(x);groups.set(x.sport,a);}
 const order=['nba','nhl','nfl','cs2','dota2','valorant','lol','cod',...groups.keys()];const sports=[...new Set(order)].filter(s=>groups.has(s));
 for(const a of groups.values())a.sort((x,y)=>(attempted.get(x.key)||0)-(attempted.get(y.key)||0));
 const i=new Map(),pending=[];while(sports.some(s=>(i.get(s)||0)<groups.get(s).length))for(const s of sports){const n=i.get(s)||0;if(n<groups.get(s).length){pending.push(groups.get(s)[n]);i.set(s,n+1);}}
 return {total:q.size,done:[...done].filter(k=>q.has(k)).length,pending,offerReferences:references,sharedAcrossBooks:[...q.values()].filter(x=>x.books.length>1).length};
}
function publicProfile(row){
 const fields=[];for(const f of row.research||[]){
  // Account screens and unstructured panels are not published. Preserve scoped sporting rows and history.
  if(!['profile','line_movement','prop_history'].includes(f.origin)||!f.metric||/^displayed panel/.test(f.metric))continue;
  try{fields.push(safe({origin:f.origin,tab:f.tab,scope:f.scope,metric:f.metric,value:f.value,observedAt:f.observedAt,period:f.period??null,mapRange:f.mapRange??null,gameMode:f.gameMode??null,window:f.window??null,filterSelection:f.filterSelection??null}));}catch{}
 }
 return {key:row.key,book:row.book,books:row.books||[row.book],bookCoverageVerified:false,sport:row.sport,player:row.player,market:row.market,eventId:row.eventId,detailId:row.detailId,period:row.period,mapRange:row.mapRange,gameMode:row.gameMode,status:fields.length?'sampled':'empty',coverageVersion:VERSION,truncated:row.profileCollection?.truncated!==false,research:fields,excludedFields:(row.research||[]).length-fields.length,modelInputsApproved:false,originalOffersVerified:false};
}
const premium=page=>page.evaluate(()=>document.body.innerText.split('\n').some(x=>x.trim()==='Premium')&&!!document.querySelector('button[aria-label="Open user menu"]'));
async function main(root,env=process.env){
 assertDestination(root);const p=invocation(env);if(!p.allowed){console.log(JSON.stringify(p));return;}
 const {chromium}=require('playwright');const {page,context}=await openHostedBoard(chromium,env);
 const started=Date.now(),deadline=started+(p.expected==='manual'?40:45)*60000,alive=()=>{const c=pacific(new Date());return Date.now()<deadline&&c.day===p.clock.day&&(p.expected==='manual'?![6,9].includes(c.hour):c.hour===p.clock.hour&&c.minute<55);};
 let boards=0,profiles=0,archiveMs=0,transactions=0,profileMs=0,errors=0;const write=async(kind,data)=>{const t=Date.now();const receipt=await persist(root,kind,data);archiveMs+=Date.now()-t;transactions++;return receipt;};
 try{
  if(p.probe){console.log(JSON.stringify({state:'public_hosted_auth_verified',accountDataPublished:false}));return;}
  const evidence=await discover({env});
  if(!p.deep){for(const code of prioritySports(CORE,evidence))for(const book of BOOKS){
   if(!alive())break;
   try{await page.goto(ORIGIN+'/props',{timeout:20000});const names=code==='DOTA2'?['DOTA2','Dota 2']:[code];let visible=false;for(const name of names){const b=page.getByRole('button',{name,exact:true});if(await b.count()===1&&await b.isVisible())visible=true;}if(!visible){console.log(JSON.stringify({state:'public_board_not_exposed',code,book,competition:'unknown'}));continue;}
    const batch=await collect(page,{book,code,slot:p.expected,shouldContinue:alive,onPage:async x=>{if(x.page.number===1||x.page.number%10===0)console.log(JSON.stringify({state:'public_board_progress',code,book,pages:x.page.number,displayedPages:x.displayedPageCount}));}});
    const n=cleanBoard(batch),{meta,parts}=splitBoard(n),partDigests=[];for(const part of parts)partDigests.push((await write('board-parts',part)).digest);const receipt=await write('boards',{...meta,partDigests});boards++;
    console.log(JSON.stringify({state:'public_board_checkpoint_verified',code,book,slot:n.slot,withinSlot:n.withinSlot,boardState:n.boardState,pages:n.health.pages,offers:n.health.distinctOfferKeys,unresolved:n.health.unresolvedRows,sourceDigest:n.sourceDigest,archiveDigest:receipt.digest,remoteDigestVerified:true,originalOffersVerified:false}));
    if(batch.failure==='session_expired')throw Error('session expired');if(batch.boardState==='partial')errors++;
   }catch{errors++;console.log(JSON.stringify({state:'public_board_partition_pending',code,book}));if(!await premium(page).catch(()=>false))throw Error('session unavailable');}
  }}
  // Morning board acquisition is independent of deep research and must never delay next slot.
  if(p.expected!=='manual')return;
  // Capture game context before the potentially very long deep-profile queue.
  // Time-box this independently and never consume a protected morning window.
  if(alive()){
   const until=Date.now()+90000,gameAlive=()=>alive()&&Date.now()<until;
   try{
    await page.goto(ORIGIN+'/props',{timeout:15000});
    const href=await verifiedNavigation(page,'Games',['/games']);
    if(href&&gameAlive()){
     await page.goto(href,{timeout:15000});
     if(await premium(page)&&gameAlive())await traverseDashboardFilters(page,'Games',{shouldContinue:gameAlive,onSnapshot:async s=>{
      const {controls,...sports}=s;await write('dashboards',{schema:'pickfinder-public-dashboard-v1',...sports});
     }});
    }
   }catch{errors++;console.log(JSON.stringify({state:'public_game_context_pending'}));}
  }
  if(alive()){
   const until=Date.now()+(p.contextOnly?25:5)*60000,contextAlive=()=>alive()&&Date.now()<until;
   const q=gameContext.queue(load(root),read(root,'directory'),new Date().toISOString());
   const detail=await context.newPage();detail.setDefaultTimeout(5000);
   let observed=0,complete=0;
   const buffer=checkpointBuffer({write:records=>write('directory',{schema:'pickfinder-public-nba-context-v1',observedAt:new Date().toISOString(),records,modelInputsApproved:false}),onVerified:r=>{observed++;if(r.state==='explicit_context_observed')complete++;}});
   try{
    for(const item of q.pending){
     if(!contextAlive())break;
     let snap={};
     try{
      await detail.goto(ORIGIN+item.detailId,{timeout:10000});
      await detail.getByRole('button',{name:'Open user menu'}).waitFor({timeout:10000});
      if(!await premium(detail))throw Error('session unavailable');
      // The game header can render independently of market-history controls.
      await detail.getByText(item.player,{exact:true}).first().waitFor({state:'visible',timeout:5000}).catch(()=>{});
      snap=await detail.evaluate(gameContext.readVisible,{player:item.player,detailId:item.detailId});
     }catch{if(!await premium(detail).catch(()=>false))throw Error('session unavailable');}
     await buffer.add(gameContext.normalize(item,snap,new Date().toISOString()));
    }
   }finally{try{if(!buffer.failed())await buffer.flush();}finally{await detail.close();}}
   console.log(JSON.stringify({state:'public_nba_context_pass',playerEventTargets:q.total,offerReferences:q.offerReferences,attemptsArchived:observed,explicitContextArchived:complete,independentReviewVerified:0}));
  }
  if(p.contextOnly)return;
  const q=queue(read(root,'board-parts'),read(root,'profiles'));console.log(JSON.stringify({state:'public_deep_queue',total:q.total,completed:q.done,remaining:q.pending.length,offerReferences:q.offerReferences,sharedAcrossBooks:q.sharedAcrossBooks,legacyPrivateHistoryImported:false}));
  const detail=await context.newPage();detail.setDefaultTimeout(5000);
  const buffer=checkpointBuffer({write:rows=>write('profiles',{schema:'pickfinder-public-profiles-v1',observedAt:new Date().toISOString(),records:rows,modelInputsApproved:false}),onVerified:r=>{profiles++;console.log(JSON.stringify({state:'public_deep_scope_checkpoint_verified',sport:r.sport,book:r.book,status:r.status,truncated:r.truncated,verifiedThisRun:profiles}));}});
  try{
   for(const item of q.pending){if(!alive())break;const row={...item,research:[]},t=Date.now();try{await enrich(detail,row,{expanded:true,maxFields:Infinity,shouldContinue:alive,navigate:async url=>{await detail.goto(url,{timeout:10000});await detail.getByRole('button',{name:'Open user menu'}).waitFor({timeout:10000});if(!await premium(detail))throw Error('session');}});}catch{row.profileCollection={truncated:true};}
    profileMs+=Date.now()-t;await buffer.add(publicProfile(row));if(!await premium(detail).catch(()=>false))throw Error('session unavailable');
   }
  }finally{if(!buffer.failed())await buffer.flush();}
  // Dashboard snapshots remain separate from player data; only sporting tables/cards.
  for(const name of ['Games','Discrepancies','Popular']){if(!alive())break;try{await page.goto(ORIGIN+'/props',{timeout:15000});const href=await verifiedNavigation(page,name,['/'+name.toLowerCase()]);if(!href)continue;await page.goto(href,{timeout:15000});if(!await premium(page))continue;await traverseDashboardFilters(page,name,{shouldContinue:alive,onSnapshot:async s=>{const {controls,...sports}=s;await write('dashboards',{schema:'pickfinder-public-dashboard-v1',...sports});}});}catch{errors++;}}
  if(alive()){await page.goto(ORIGIN+'/props',{timeout:15000});const labels=await inspectCapabilities(page);await write('capabilities',{schema:'pickfinder-public-capabilities-v1',labels,observedAt:new Date().toISOString(),accountMutations:0});}
 }finally{
  await context.close();console.log(JSON.stringify({state:'public_pickfinder_throughput',boards,profiles,profileMs,archiveMs,transactions,errors,elapsedMs:Date.now()-started,privateRepoUsed:false,modelInputsApproved:false}));
 }
}
module.exports={invocation,queue,cleanBoard,publicProfile,splitBoard};
if(require.main===module)main(fs.realpathSync(process.argv[2])).catch(()=>{console.error(JSON.stringify({state:'public_pickfinder_failed_closed',privateRepoUsed:false,accountDataLogged:false}));process.exitCode=1;});
