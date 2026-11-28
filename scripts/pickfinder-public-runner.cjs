'use strict';
const {performance}=require('node:perf_hooks');
const fs=require('node:fs'),path=require('node:path'),{normalize}=require('./pickfinder-premium-archive.cjs'),{collect,ORIGIN,readCompactBoardClocks}=require('./pickfinder-browser.cjs'),{enrich}=require('./pickfinder-player-research.cjs'),{VERSION}=require('./pickfinder-research-coverage.cjs'),{checkpointBuffer}=require('./pickfinder-checkpoint-buffer.cjs'),{pacific,decide}=require('./pacific-morning-capture-gate.cjs'),{prioritySports,registry}=require('./season-aware-collection.cjs'),{discover}=require('./season-aware-discovery.cjs'),{openHostedBoard}=require('./pickfinder-unattended-runner.cjs'),{persist,read,iterate,archiveRevision,safe,sha,assertDestination}=require('./pickfinder-public-archive.cjs');
const {dashboardRoutes,captureGameDialogs,verifiedNavigation,traverseDashboardFilters,dashboardControlDiagnostics,inspectCapabilities}=require('./pickfinder-dashboard-research.cjs');
const {inspectTool}=require('./pickfinder-tool-schema.cjs');
const {observeNamedControl,observePropsPager}=require('./pickfinder-dashboard-controls.cjs');
const currentIdentity=require('./pickfinder-current-identity.cjs');
const gameContext=require('./pickfinder-public-nba-context.cjs'),{load}=require('./pickfinder-public-evidence-audit.cjs');
const {backupPreflight,isBackup,protectedMorningClock}=require('./pickfinder-public-morning-preflight.cjs');
const CORE=['NBA','NHL','NFL','CS2','DOTA2','VAL','LOL','COD','MLB','WNBA','CFB','CBB','TENNIS','SOCCER'],BOOKS=['prizepicks','underdog'];
function recoveryPartitions(raw){
 if(typeof raw!=='string'||raw.length>100)throw Error('invalid partition recovery scope');
 const items=raw.split(',').map(x=>x.trim().toLowerCase());
 const permitted=new Set(CORE.flatMap(s=>BOOKS.map(b=>s.toLowerCase()+'/'+b)));
 if(items.length<1||items.length>4||new Set(items).size!==items.length||items.some(x=>!permitted.has(x)))throw Error('invalid partition recovery scope');
 return items;
}
function invocation(env,now=new Date()){
 if(env.PICKFINDER_AUTOMATION_AUTHORIZED!=='1'||env.PICKFINDER_PUBLIC_DATA_AUTHORIZED!=='1')throw Error('authorization required');
 if(env.GITHUB_EVENT_NAME==='schedule'&&/^[0-9]+ (6|9) \* \* \*$/.test(env.GITHUB_EVENT_SCHEDULE))return decide({eventName:'schedule',schedule:env.GITHUB_EVENT_SCHEDULE,now});
 if(env.GITHUB_EVENT_NAME==='workflow_dispatch'&&['capture_0600','capture_0900'].includes(env.REQUESTED_MODE))return decide({eventName:'workflow_dispatch',mode:env.REQUESTED_MODE,now});
 const clock=pacific(now),mode=env.REQUESTED_MODE||'board_and_deep';
 if(mode==='recover_partitions'){
  if(env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('manual partition recovery only');
  const partitions=recoveryPartitions(env.REQUESTED_PARTITIONS);
  return {allowed:!protectedMorningClock(clock),expected:'manual',clock,boardsOnly:true,partitions,state:'manual_partition_recovery_gate'};
 }
 if(mode==='nba_history_repair'){if(env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('manual repair only');return {allowed:!protectedMorningClock(clock),expected:'manual',clock,deep:true,historyRepair:true,state:'nba_history_repair_gate'};}
 if(mode==='game_timezone_validation'){if(env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('manual game clock experiment only');return {allowed:!protectedMorningClock(clock),expected:'manual',clock,gameTimezoneOnly:true,state:'game_timezone_experiment_gate'};}
 if(mode==='timezone_validation'){if(env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('manual experiment only');return {allowed:!protectedMorningClock(clock),expected:'manual',clock,timezoneOnly:true,state:'timezone_experiment_gate'};}
 if(['current_profiles','clock_audit'].includes(mode)&&env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('manual bounded pass only');
 if(!['current_profiles','clock_audit','board_and_deep','deep_research_now','probe_now','nba_context_only','features_only','boards_only'].includes(mode))throw Error('mode');
 if(protectedMorningClock(clock))return {allowed:false,state:'protect_morning_hour',clock};
 return {allowed:true,expected:'manual',clock,deep:['current_profiles','deep_research_now','nba_context_only','features_only'].includes(mode),currentProfiles:mode==='current_profiles',contextOnly:mode==='nba_context_only',featuresOnly:mode==='features_only',boardsOnly:mode==='boards_only',clockAudit:mode==='clock_audit',probe:mode==='probe_now'};
}
function profileWorkers(env,p){return env.GITHUB_EVENT_NAME==='workflow_dispatch'&&['deep_research_now','current_profiles'].includes(env.REQUESTED_MODE)&&p.expected==='manual'&&p.deep&&!p.contextOnly?2:1;}
function captureOrigin(env,policy){
 const event=env.GITHUB_EVENT_NAME,runId=String(env.GITHUB_RUN_ID||''),attempt=String(env.GITHUB_RUN_ATTEMPT||''),revision=String(env.GITHUB_SHA||'');
 if(!/^[1-9][0-9]{0,19}$/.test(runId)||!/^[1-9][0-9]{0,5}$/.test(attempt)||! /^[a-f0-9]{40}$/.test(revision))return null;
 const cron=event==='schedule'?String(env.GITHUB_EVENT_SCHEDULE||''):null;
 if(event==='schedule'&&(!/^[0-9]{1,2} (6|9|12|16) \* \* \*$/.test(cron)||policy.expected!=='manual'&&Number(cron.split(' ')[1])!==Number(policy.expected.slice(0,2))))return null;
 if(!['schedule','workflow_dispatch','push'].includes(event))return null;
 return {event,runId,attempt,revision,cron};
}
function cleanBoard(batch){
 const n=normalize(batch);return safe({...n,sourceDigest:sha(JSON.stringify(batch)),schema:'pickfinder-public-normalized-v1',authenticated:batch.authenticated===true,explicitEmpty:batch.explicitEmpty===true,disabledConfirmed:batch.disabledConfirmed===true,displayedPageCount:batch.displayedPageCount??null,lastPageReached:batch.lastPageReached===true,...(batch.traversalAudit&&{recoveryTraversal:{...batch.traversalAudit,stopReason:batch.failure??null,pageFailure:batch.pageFailureDiagnostics??null}}),rawHtmlPublished:false,accountDataPublished:false});
}
function splitBoard(n){
 const {offers,researchObservations,unpricedTierObservations,sportsbookQuotes,...meta}=n,parts=[];
 for(const [field,values] of Object.entries({offers,researchObservations,unpricedTierObservations,sportsbookQuotes})){
  let rows=[],bytes=0;for(const value of values||[]){const size=Buffer.byteLength(JSON.stringify(value))+1;if(size>2000000)throw Error('record too large');if(bytes+size>2000000){parts.push({schema:'pickfinder-public-board-part-v1',book:n.book,sport:n.sport,sourceDigest:n.sourceDigest,field,rows,...(n.samplingPurpose?{samplingPurpose:n.samplingPurpose}:{})});rows=[];bytes=0;}rows.push(value);bytes+=size;}if(rows.length)parts.push({schema:'pickfinder-public-board-part-v1',book:n.book,sport:n.sport,sourceDigest:n.sourceDigest,field,rows,...(n.samplingPurpose?{samplingPurpose:n.samplingPurpose}:{})});
 }return {meta,parts};
}
function sharedScope(s){
 const {sport,player,market,eventId,detailId}=s;
 if(!sport||!player||!market||!eventId||!detailId)return null;
 let u;try{u=new URL(detailId,ORIGIN);}catch{return null;}
 if(u.origin!==ORIGIN||!u.pathname.startsWith('/players/')||u.searchParams.getAll('prop').length!==1||[...u.searchParams.keys()].some(k=>k!=='prop'))return null;
 return {sport,player,market,eventId,detailId:u.pathname+'?'+u.searchParams.toString(),period:s.period??null,mapRange:s.mapRange??null,gameMode:s.gameMode??null};
}
function profileBenchmarkScope(items,{currentProfiles=false,historyRepair=false}={}){
 const mode=currentProfiles?'current_profiles':historyRepair?'history_repair':'deep_profiles';
 const keys=items.map(r=>{
  const scope=sharedScope(r);
  return scope?sha(JSON.stringify([scope,r.book??null,[...(r.books||[])].sort(),currentProfiles&&r.probeSportsbookMovement===true])):null;
 });
 const cohortDigest=keys.length&&keys.every(Boolean)&&new Set(keys).size===keys.length
  ?sha(JSON.stringify([VERSION,mode,keys])):null;
 return {mode,cohortDigest,scopes:keys.length,coverageVersion:VERSION};
}
function queue(boards,profiles,{historyAudit}={}){
 const done=new Set(),attempted=new Map(),repairs=new Map(),aligned=new Map(),lastAligned=new Map();
 for(const b of profiles)for(const r of (historyAudit?b.doc:b).records||[]){
  if(r.observationPurpose==='displayed_game_clock')continue;
  const scope=sharedScope(r);if(!scope)continue;
  const key=sha(JSON.stringify(scope));attempted.set(key,(attempted.get(key)||0)+1);
  if(r.status==='sampled'&&r.coverageVersion===VERSION&&r.truncated===false&&r.research?.length)done.add(key);
  if(r.sport!=='nba')continue;
  for(const f of require('./pickfinder-native-history-reconciliation.cjs').structuredFields(r.research||[])){
   if(f.origin!=='profile'||!/^row \d+$/.test(f.metric||'')||!(/(?:^| \| )(?:Date|Game Date)(?: \| |$)/i.test(f.scope||'')))continue;
   let cells;try{cells=JSON.parse(f.value);}catch{continue;}
   if(!Array.isArray(cells)||!Number.isFinite(Date.parse(f.observedAt)))continue;
   const n=String(f.scope||'').split(' | ').length,at=Date.parse(f.observedAt);
   // The rolling game log moves rows between positions. Bind the entire cell vector
   // (including date, opponent labels and values) to its profile/tab/filter context.
   const contentKey=sha(JSON.stringify([key,f.tab??null,f.filterSelection??null,f.window??null,f.period??null,f.mapRange??null,f.gameMode??null,cells]));
   const header=String(f.scope),rowKey=JSON.stringify([contentKey,header,f.metric]);
   if(n!==cells.length||header.endsWith('[header truncated]')){
    const old=repairs.get(rowKey);
    if(!old||old.at<at)repairs.set(rowKey,{key,contentKey,header,metric:f.metric,at,...(historyAudit?{source:historyAudit.pin(r,f,b.digest,cells.length)}:{})});
   }else if(r.status==='sampled'&&r.coverageVersion===VERSION&&r.truncated===false&&(f.headerLayout==='span-grid-v1'||header.length>500)){
    const rows=aligned.get(contentKey)||new Map(),id=JSON.stringify([header,f.metric]);
    if(!rows.has(id)||rows.get(id).at<at)rows.set(id,{at,header,metric:f.metric});
    aligned.set(contentKey,rows);
    lastAligned.set(key,Math.max(lastAligned.get(key)||0,at));
    historyAudit?.observe(r,f,b.digest,cells.length);
   }
  }
 }
 let unresolvedHistoryRows=0;
 const repairKeys=new Set(),latestGap=new Map(),oldPositions=new Map();
 for(const x of repairs.values()){
  const id=JSON.stringify([x.contentKey,x.header]),positions=oldPositions.get(id)||new Set();
  positions.add(x.metric);oldPositions.set(id,positions);
 }
 for(const x of repairs.values()){
  const prefix=x.header.replace(/ \| \[header truncated\]$/,'');
  // Legacy capture clipped at 500 characters (or 480 plus the explicit marker).
  // Only the clipped last label may be partial. Require every whole label to agree.
  const clipped=prefix.length===500||x.header.endsWith('[header truncated]');
  const whole=clipped?prefix.split(' | ').slice(0,-1).join(' | '):prefix;
  const matching=[...(aligned.get(x.contentKey)?.values()||[])].filter(y=>y.at>x.at&&whole&&
   (y.header===whole||y.header.startsWith(whole+' | '))&&(!clipped||y.header.startsWith(prefix)));
  const hasSingleLayout=new Set(matching.map(y=>y.header)).size===1;
  const oldUnique=oldPositions.get(JSON.stringify([x.contentKey,x.header])).size===1;
  if(hasSingleLayout&&(matching.some(y=>y.metric===x.metric)||oldUnique&&matching.length===1))continue;
  unresolvedHistoryRows++;
  if(historyAudit)historyAudit.gaps.push(x.source);
  repairKeys.add(x.key);latestGap.set(x.key,Math.max(latestGap.get(x.key)||0,x.at));
 }
 // Replaying the same completed extraction cannot certify a missing old row.
 // Reopen when a newer malformed row arrives or the collector version changes.
 const deferred=new Set([...repairKeys].filter(k=>lastAligned.get(k)>latestGap.get(k)));
 for(const k of repairKeys)done.delete(k);
 const q=new Map();let references=0;
 for(const b of boards)for(const o of [...b.offers||[],...b.unpricedTierObservations||[],...(['offers','unpricedTierObservations'].includes(b.field)?b.rows:[])]){
  if(!['prizepicks','underdog'].includes(b.book)||b.samplingPurpose==='displayed_game_clock')continue;
  const scope=sharedScope({...o,sport:b.sport});if(!scope)continue;
  const key=sha(JSON.stringify(scope)),prev=q.get(key);references++;
  const books=[...new Set([...(prev?.books||[]),b.book])].sort();
  q.set(key,{key,...scope,book:books[0],books});
 }
 const groups=new Map();for(const x of q.values())if(!done.has(x.key)&&!deferred.has(x.key)){const a=groups.get(x.sport)||[];a.push(x);groups.set(x.sport,a);}
 const order=['nba','nhl','nfl','cs2','dota2','valorant','lol','cod',...groups.keys()];const sports=[...new Set(order)].filter(s=>groups.has(s));
 for(const a of groups.values())a.sort((x,y)=>Number(repairKeys.has(y.key))-Number(repairKeys.has(x.key))||(attempted.get(x.key)||0)-(attempted.get(y.key)||0));
 const i=new Map(),pending=[];while(sports.some(s=>(i.get(s)||0)<groups.get(s).length))for(const s of sports){const n=i.get(s)||0;if(n<groups.get(s).length){pending.push(groups.get(s)[n]);i.set(s,n+1);}}
 return {total:q.size,unresolvedHistoryRows,deferredHistoryScopes:[...deferred].filter(k=>q.has(k)).length,done:[...done].filter(k=>q.has(k)).length,pending,repairPending:pending.filter(x=>repairKeys.has(x.key)),malformedHistoryPending:[...repairKeys].filter(k=>q.has(k)).length,offerReferences:references,sharedAcrossBooks:[...q.values()].filter(x=>x.books.length>1).length};
}
// Only the current complete board defines work. Legacy repair rows are
// never enqueued, and exact previously completed observations are reusable.
function currentProfileQueue(archive,profiles,now=Date.now()){
 const at=Number(now),day=8*3600000,dt=Date.parse;
 if(!Number.isFinite(at))throw Error('current profile clock');
 if(archive.invalid?.length)return {pending:[],total:0,reused:0,expired:0,eligiblePartitions:0,reason:'archive_integrity'};
 const cache=new Map(),tries=new Map(),previouslySeen=new Set(),currentAttempts=new Set();
 const feature=x=>{const p=currentIdentity.sourceScope(x);return p?JSON.stringify([p.playerPath,x.eventId,x.market,x.period??null,x.mapRange??null,x.gameMode??null]):null;};
 for(const d of profiles)for(const r of d.records||[]){
  if(r.observationPurpose==='displayed_game_clock')continue;
  const scope=sharedScope(r);if(!scope)continue;
  const id=sha(JSON.stringify(scope));
  const fields=(r.research||[]).filter(f=>Number.isFinite(dt(f?.observedAt))&&dt(f.observedAt)<=at);
  const seen=fields.reduce((latest,f)=>Math.max(latest,dt(f.observedAt)),-Infinity);
  const attempt=dt(r.currentProfileAttemptedAt);
  if(Number.isFinite(attempt)&&attempt<=at){
   tries.set(id,Math.max(tries.get(id)||0,attempt));
   const playerPath=currentIdentity.sourceScope(scope)?.playerPath;
   if(playerPath)previouslySeen.add(playerPath);
   const fk=feature(scope);if(fk)currentAttempts.add(fk);
  }
  if(!Number.isFinite(seen)||seen>at)continue;
  tries.set(id,Math.max(tries.get(id)||0,seen));
  if(r.status==='sampled'&&r.coverageVersion===VERSION&&r.truncated===false&&fields.some(f=>f.origin==='profile'&&f.value!=null))
   cache.set(id,Math.max(cache.get(id)||0,seen));
 }
 const targets=new Map();let eligiblePartitions=0,expired=0;
 for(const b of archive.latest||[]){
  const m=b.m,observed=dt(m?.lastObservedAt),first=dt(b.first);
  if(!['prizepicks','underdog'].includes(m?.book)||m.authenticated!==true||m.boardState!=='populated'||
     m.pageTraversalComplete!==true||m.lastPageReached!==true||m.health?.wrongSport!==0||m.health?.priceConflictKeys!==0||
     !Number.isFinite(observed)||!Number.isFinite(first)||first>at||observed>at||observed>first+999||
     at-observed>day||!Number.isFinite(dt(m.firstObservedAt))||dt(m.firstObservedAt)>observed)continue;
  eligiblePartitions++;
  for(const o of [...b.offers||[],...b.unpricedTierObservations||[]]){
   const t=dt(o.observedAt),start=dt(o.startAt);
   if(o.book!==m.book||o.sport!==m.sport||!Number.isFinite(t)||t<dt(m.firstObservedAt)||t>observed)continue;
   if(Number.isFinite(start)&&start<=at){expired++;continue;}
   const scope=sharedScope(o);if(!scope)continue;
   const key=sha(JSON.stringify(scope)),prior=targets.get(key),books=[...new Set([...(prior?.books||[]),o.book])].sort();
   targets.set(key,{key,...scope,books,book:books[0],observed:Math.max(prior?.observed||0,t)});
  }
 }
 for(const x of targets.values())if(tries.has(x.key))previouslySeen.add(currentIdentity.sourceScope(x)?.playerPath);
 const rank=['nba','nhl','nfl','cs2','valorant','dota2','lol','cod'];
 const groups=new Map();let reused=0,unchangedSkipped=0;
 for(const x of targets.values()){
  const previous=cache.get(x.key);
  if(previous>=x.observed&&at-previous<=day){reused++;continue;}
  if(currentAttempts.has(feature(x))){unchangedSkipped++;continue;}
  const a=groups.get(x.sport)||[];a.push(x);groups.set(x.sport,a);
 }
 const missingSaveLog=x=>Number(x.sport==='nhl'&&x.market==='player_saves'&&!x.period&&!x.mapRange&&!x.gameMode);
 const nflPriority=x=>Number(x.sport==='nfl'&&!x.period&&!x.mapRange&&!x.gameMode&&/^player_(?:field_goals(?:_made)?|extra_points_made|kicking_points|pass(?:ing)?_(?:yards|yds|attempts|completions))$/.test(x.market));
 const priority=x=>missingSaveLog(x)+nflPriority(x);
 for(const a of groups.values())a.sort((x,y)=>priority(y)-priority(x)||(tries.get(x.key)||0)-(tries.get(y.key)||0)||y.observed-x.observed||x.key.localeCompare(y.key));
 const order=[...new Set([...rank,...groups.keys()])],pending=[];
 for(let i=0;pending.length<targets.size-reused-unchangedSkipped;i++)for(const sport of order){
  const x=groups.get(sport)?.[i];if(x)pending.push(x);
 }
 const front=[],repeat=[],players=new Set(previouslySeen);
 for(const x of pending){
   const k=currentIdentity.sourceScope(x)?.playerPath;
   if(!k||players.has(k))repeat.push(x);
   else {players.add(k);front.push(x);}
 }
 // A seen goalie may have a new saves scope; admit it as a targeted gap only if
 // the exact scope has not already been attempted. Do not displace another new
 // player with multiple thresholds from the same goalie.
 const targeted=[],back=[],frontPaths=new Set(front.map(x=>currentIdentity.sourceScope(x)?.playerPath));
 for(const x of repeat){
  const k=currentIdentity.sourceScope(x)?.playerPath;
  if(k&&!frontPaths.has(k)&&missingSaveLog(x)&&!tries.has(x.key)){frontPaths.add(k);targeted.push(x);}
  else back.push(x);
 }
 const movementTargets=new Set(front.filter(x=>x.sport==='nhl'&&!x.period&&!x.mapRange&&!x.gameMode).slice(0,4).map(x=>x.key));
 const fSeen=new Set();
 const pendingOrdered=[...targeted,...front,...back].filter(x=>{const k=feature(x);if(!k)return true;if(fSeen.has(k))return false;fSeen.add(k);return true;});
 return {pending:pendingOrdered.map(x=>movementTargets.has(x.key)?{...x,probeSportsbookMovement:true}:x),distinctNewPlayersQueued:front.length,distinctSeenGoaliesWithNewSavesScope:targeted.length,
  savesScopesInFirstBatch:pendingOrdered.slice(0,96).filter(missingSaveLog).length,total:targets.size,reused,unchangedSkipped,expired,eligiblePartitions,reason:eligiblePartitions?'current_exact_board_scopes':'no_recent_complete_partition'};
}
// Overview game logs often stay visible as unrelated dialogs open. Collapse
// only identical aligned dated rows within this exact unfiltered profile
// capture, never movement, filtered data, or a materially different result.
function compactCurrentProfile(record){
 const seen=new Map(),fields=[];let repeats=0;
 for(const field of record.research||[]){
  let id=null;
  if(field.origin==='profile'&&!field.filterSelection&&field.headerLayout==='span-grid-v1'&&
     /^row \d+$/.test(field.metric)&&/^Date \| Opponent \| /.test(field.scope||'')){
   let cells;try{cells=JSON.parse(field.value);}catch{}
   if(Array.isArray(cells)&&cells.length===field.scope.split(' | ').length&&
      /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(cells[0]?.value||'')&&cells[1]?.value)
    id=JSON.stringify([field.scope,field.period,field.mapRange,field.gameMode,field.window,cells]);
  }
  if(id!==null&&seen.has(id)&&seen.get(id)!==field.tab){repeats++;continue;}
  if(id!==null&&!seen.has(id))seen.set(id,field.tab);
  fields.push(field);
 }
 return {...record,research:fields,identicalSharedLogCopiesNotRearchived:repeats};
}
function publicProfile(row){
 const fields=[];for(const f of row.research||[]){
  // Account screens and unstructured panels are not published. Preserve scoped sporting rows and history.
  if(!['profile','line_movement','prop_history'].includes(f.origin)||!f.metric||/^displayed panel/.test(f.metric))continue;
  try{fields.push(safe({origin:f.origin,tab:f.tab,scope:f.scope,metric:f.metric,value:f.value,observedAt:f.observedAt,period:f.period??null,mapRange:f.mapRange??null,gameMode:f.gameMode??null,window:f.window??null,filterSelection:f.filterSelection??null,...(f.headerLayout==='span-grid-v1'?{headerLayout:f.headerLayout}:{})}));}catch{}
 }
 return {key:row.key,book:row.book,books:row.books||[row.book],bookCoverageVerified:false,sport:row.sport,player:row.player,market:row.market,eventId:row.eventId,detailId:row.detailId,period:row.period,mapRange:row.mapRange,gameMode:row.gameMode,status:fields.length?'sampled':'empty',coverageVersion:VERSION,truncated:row.profileCollection?.truncated!==false,research:fields,excludedFields:(row.research||[]).length-fields.length,modelInputsApproved:false,originalOffersVerified:false};
}
const premium=page=>page.evaluate(()=>document.body.innerText.split('\n').some(x=>x.trim()==='Premium')&&!!document.querySelector('button[aria-label="Open user menu"]'));
function boardTargets(evidence,missingPartitions=null){
 const missing=missingPartitions===null?null:new Set(missingPartitions);
 return prioritySports(CORE,evidence??{}).flatMap(code=>BOOKS.map(book=>({code,book})))
  .filter(({code,book})=>!missing||missing.has(code.toLowerCase()+'/'+book));
}
async function waitPremium(page,check=premium){
 try{await page.getByRole('button',{name:'Open user menu',exact:true}).waitFor({state:'visible',timeout:10000});
 await page.waitForFunction(()=>document.body.innerText.split('\n').some(x=>x.trim()==='Premium'),null,{timeout:10000});
 return await check(page);}catch{return false;}
}
// Pair exact recent board links with a maximum of four distinct players.
function clockAuditTargets(observations,max=4){
 const targets=new Map(),seen=new Set();
 for(const o of [...observations].sort((a,b)=>Number(!!b.hasClock)-Number(!!a.hasClock))){
  const scope=sharedScope(o),x=scope&&currentIdentity.sourceScope(scope);
  if(!x||!BOOKS.includes(o.book)||!Number.isFinite(Date.parse(o.observedAt))||seen.has(x.playerPath))continue;
  seen.add(x.playerPath);const key=sha(JSON.stringify(scope));
  targets.set(key,{key,...scope,book:o.book,boardArchiveDigest:o.boardArchiveDigest});
  if(targets.size>=max)break;
 }
 return [...targets.values()];
}
// Dispatch the research sidecar after remote board verification. Ignore failures:
 // the existing collector must retain its independent morning capture deadline.
async function dispatchNhlSogShadow(digest,env,client=fetch){
 if(env.GITHUB_REPOSITORY!=='Thedarkwillow/nhl-betting-platform1'||!env.PICKFINDER_NHL_SHADOW_DISPATCH||
  !/^[a-f0-9]{64}$/.test(digest))return 'disabled';
 try{
  const r=await client('https://api.github.com/repos/Thedarkwillow/nhl-betting-platform1/dispatches',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(1200),
   headers:{authorization:'Bearer '+env.PICKFINDER_NHL_SHADOW_DISPATCH,'content-type':'application/json',accept:'application/vnd.github+json'},
   body:JSON.stringify({event_type:'pickfinder_nhl_sog_board_archived',client_payload:{digest}})
  });
  return r.status===204?'queued':'not_queued';
 }catch{return 'not_queued';}
}
async function main(root,env=process.env){
 assertDestination(root);const p=invocation(env);if(!p.allowed){console.log(JSON.stringify(p));return;}
 const fallback=isBackup(env)?backupPreflight(root,env):null;
 if(fallback){console.log(JSON.stringify(fallback));if(!fallback.proceed)return;}
 const current=p.currentProfiles?currentProfileQueue(load(root,null,{latestOnly:true}),iterate(root,'profiles')):null;
 if(current){const {pending,...counts}=current;console.log(JSON.stringify({state:'current_profile_plan',...counts,pending:pending.length,legacyRepair:false,paidApiRequests:0}));if(!pending.length)return;}
 const {chromium}=require('playwright');
 if(p.gameTimezoneOnly){
  const probe=require('./pickfinder-controlled-clock.cjs'),until=Date.now()+6*60000;
  const alive=()=>{const c=pacific(new Date());return Date.now()<until&&c.day===p.clock.day&&!protectedMorningClock(c);};
  const targets=probe.selectProfiles(iterate(root,'profiles'),read(root,'directory'),new Date().toISOString(),{expanded:true});
  const result=targets.length?await probe.observe({targets,open:zone=>openHostedBoard(chromium,env,zone),alive,
   write:data=>persist(root,'directory',data),premium,origin:ORIGIN}):{targets:0,attempts:0,expected:0,providerDisplayZoneVerified:false};
  console.log(JSON.stringify({state:'public_game_timezone_experiment',...result,paidApiRequests:0}));return;
 }
 if(p.timezoneOnly){const probe=require('./pickfinder-movement-clock-probe.cjs'),until=Date.now()+8*60000;const alive=()=>{const c=pacific(new Date());return Date.now()<until&&c.day===p.clock.day&&!protectedMorningClock(c);};const prior=read(root,'directory');const targets=probe.select(require('./pickfinder-public-model-validation.cjs').history(root,'profile-market-evidence'),new Date().toISOString(),prior);const result=await probe.observe({targets,prior,open:zone=>openHostedBoard(chromium,env,zone),alive,write:data=>persist(root,'directory',data),premium,origin:ORIGIN});console.log(JSON.stringify({state:'movement_clock_experiment',...result}));return;}
 const {page,context}=await openHostedBoard(chromium,env);
 const started=Date.now(),deadline=started+(p.clockAudit?8:p.expected==='manual'?40:45)*60000,alive=()=>{const c=pacific(new Date());return Date.now()<deadline&&(p.currentProfiles||c.day===p.clock.day)&&(p.expected==='manual'?!protectedMorningClock(c):c.hour===p.clock.hour&&c.minute<55);};
 let boards=0,profiles=0,archiveMs=0,transactions=0,profileMs=0,errors=0;const write=async(kind,data)=>{const t=Date.now();const receipt=await persist(root,kind,data);archiveMs+=Date.now()-t;transactions++;return receipt;};
 try{
  if(p.probe){console.log(JSON.stringify({state:'public_hosted_auth_verified',accountDataPublished:false}));return;}
  const evidence=p.historyRepair||p.currentProfiles||p.clockAudit||p.partitions||fallback?null:await discover({env});
  if(p.partitions)console.log(JSON.stringify({state:'public_partition_recovery_scope',partitions:p.partitions,protectedMorningCapture:false,paidApiRequests:0}));
  const auditRows=[];
  if(!p.deep){for(const {code,book} of (p.clockAudit?boardTargets(null,['nba/prizepicks','nba/underdog']):boardTargets(evidence,p.partitions??fallback?.missingPartitions??null))){
   if(!alive())break;
   try{await page.goto(ORIGIN+'/props',{timeout:20000});const names=code==='DOTA2'?['DOTA2','Dota 2']:[code];let visible=false;for(const name of names){const b=page.getByRole('button',{name,exact:true});if(await b.count()===1&&await b.isVisible())visible=true;}if(!visible){console.log(JSON.stringify({state:'public_board_not_exposed',code,book,competition:'unknown'}));continue;}
    const batch=await collect(page,{book,code,slot:p.expected,maxPages:p.clockAudit?1:Infinity,auditTraversal:!!p.partitions,shouldContinue:alive,onPage:async x=>{if(x.page.number===1||x.page.number%10===0)console.log(JSON.stringify({state:'public_board_progress',code,book,pages:x.page.number,displayedPages:x.displayedPageCount}));}});
    const n={...cleanBoard(batch),...(p.clockAudit?{samplingPurpose:'displayed_game_clock'}:{})},{meta,parts}=splitBoard(n),partDigests=[];for(const part of parts)partDigests.push((await write('board-parts',part)).digest);const receipt=await write('boards',{...meta,partDigests,captureOrigin:captureOrigin(env,p)});boards++;
    if(p.clockAudit&&!batch.failure)for(const row of batch.pages.flatMap(x=>x.rows))auditRows.push({...row,book,boardArchiveDigest:receipt.digest,hasClock:row.research.some(f=>f.metric==='Displayed Matchup and Time')});
    console.log(JSON.stringify({state:'public_board_checkpoint_verified',code,book,slot:n.slot,withinSlot:n.withinSlot,boardState:n.boardState,pages:n.health.pages,offers:n.health.distinctOfferKeys,unresolved:n.health.unresolvedRows,sourceDigest:n.sourceDigest,archiveDigest:receipt.digest,remoteDigestVerified:true,originalOffersVerified:false}));
    if(code==='NHL'&&book==='prizepicks'&&!p.clockAudit&&!batch.failure&&n.pageTraversalComplete===true&&n.health.distinctOfferKeys>0){
     const state=await dispatchNhlSogShadow(receipt.digest,env);
     console.log(JSON.stringify({state:'public_nhl_sog_pilot_dispatch',status:state}));
    }
    if(batch.failure==='session_expired')throw Error('session expired');if(batch.failure||batch.boardState==='partial'&&!p.clockAudit)errors++;
   }catch{errors++;console.log(JSON.stringify({state:'public_board_partition_pending',code,book}));if(!await premium(page).catch(()=>false))throw Error('session unavailable');}
  }}
  if(p.clockAudit){
   if(alive()&&await premium(page).catch(()=>false)){
    const compact=await context.newPage();
    try{
     await compact.setViewportSize({width:412,height:915});
     await compact.goto(ORIGIN+'/props',{timeout:12000});
     if(alive()){
      await compact.getByRole('button',{name:'NBA',exact:true}).first().click({timeout:3500}).catch(()=>{});
      await compact.locator('a[href*="/players/nba/"][href*="prop="]:visible').first().waitFor({timeout:5000}).catch(()=>{});
      const sample=await compact.evaluate(readCompactBoardClocks,{sport:'nba',observedAt:new Date().toISOString(),limit:20,authenticatedContextVerified:true});
      if(sample.authenticated){
       const r=await write('directory',{schema:'pickfinder-compact-board-clock-sample-v1',...sample,
        captureOrigin:captureOrigin(env,p),viewportWidth:412,boardCompletenessVerified:false});
       console.log(JSON.stringify({state:'public_compact_board_clock_audit',archiveDigest:r.digest,visiblePropLinks:sample.visiblePropLinks,clocks:sample.records.length}));
      }else console.log(JSON.stringify({state:'public_compact_board_clock_not_verified'}));
     }
    }catch(e){errors++;console.log(JSON.stringify({state:'public_compact_board_clock_audit_unavailable',reason:e.name}));}
    finally{await compact.close();}
   }
   const records=[];
   for(const item of clockAuditTargets(auditRows)){
    if(!alive())break;
    const row={...item,research:[]};let observed=null;
    try{await enrich(page,row,{expanded:true,fullSportingHeaders:true,maxFields:250,includePropHistory:false,shouldContinue:alive,navigate:async url=>{
     await page.goto(url,{timeout:10000});if(!await waitPremium(page))throw Error('session unavailable');
     await page.getByText(row.player,{exact:true}).first().waitFor({state:'visible',timeout:5000}).catch(()=>{});
     const snap=await page.evaluate(currentIdentity.readVisible,{player:row.player,detailId:row.detailId});
     observed=currentIdentity.captureProfileContext(row,snap,new Date().toISOString());
    }});}catch{errors++;row.profileCollection={truncated:true};if(!await premium(page).catch(()=>false))throw Error('session unavailable');}
    records.push({...publicProfile(row),boardArchiveDigest:item.boardArchiveDigest,independentReconciliationContext:observed,observationPurpose:'displayed_game_clock'});
   }
   if(records.length){const receipt=await write('profiles',{schema:'pickfinder-public-profiles-v1',observedAt:new Date().toISOString(),records,modelInputsApproved:false});profiles=records.length;
    console.log(JSON.stringify({state:'public_clock_audit_readback',boards,profiles,profileDigest:receipt.digest,profileLabels:records.filter(r=>r.independentReconciliationContext?.displayedMatchupLabel).length,paidApiRequests:0}));}
   else console.log(JSON.stringify({state:'public_clock_audit_no_profiles',boards,paidApiRequests:0}));
   return;
  }
  // Morning board acquisition is independent of deep research and must never delay next slot.
  if(p.expected!=='manual'||p.boardsOnly)return;
  // Capture game context before the potentially very long deep-profile queue.
  // Time-box this independently and never consume a protected morning window.
  if(!p.historyRepair&&!p.currentProfiles&&alive()){
   const until=Date.now()+90000,gameAlive=()=>alive()&&Date.now()<until;
   try{
    await page.goto(ORIGIN+'/props',{timeout:15000});
    const href=await verifiedNavigation(page,'Games',dashboardRoutes('Games'));
    if(href&&gameAlive()){
     await page.goto(href,{timeout:15000});
     if(await premium(page)&&gameAlive()){
      const records=[];
      try{
       for(const sport of ['NBA','NHL','NFL','CS2','DOTA2','VAL','LOL','COD']){
        if(!gameAlive())break;
        const stop=Date.now()+12000;
        try{await captureGameDialogs(page,sport,()=>gameAlive()&&Date.now()<stop,game=>records.push(game));}
        catch{errors++;if(!await premium(page).catch(()=>false))throw Error('session unavailable');await page.goto(href,{timeout:5000});}
       }
      }finally{
       if(records.length)await write('dashboards',{schema:'pickfinder-public-game-dialog-v1',records});
      }
     }
     // Full dashboard traversal is reserved in the separate feature pass below.
    }
   }catch{errors++;console.log(JSON.stringify({state:'public_game_context_pending'}));}
  }
  if(!p.historyRepair&&!p.currentProfiles&&alive()&&!p.featuresOnly){
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
  // Reserve bounded feature discovery before the long player-profile queue.
  // Morning capture has already returned; context-only passes remain isolated.
  if(!p.historyRepair&&!p.currentProfiles&&alive()){
   try{await page.goto(ORIGIN+'/props',{timeout:15000});if(await waitPremium(page)){const labels=await inspectCapabilities(page);await write('capabilities',{schema:'pickfinder-public-capabilities-v1',labels,observedAt:new Date().toISOString(),captureOrigin:captureOrigin(env,p),accountMutations:0});}}catch{errors++;console.log(JSON.stringify({state:'public_capability_probe_pending'}));}
  }
  // Existing tool inspector was imported but never invoked by the public runner.
  for(const kind of p.historyRepair||p.currentProfiles?[]:['builder','alerts']){
   if(!alive())break;
   try{
    await page.goto(ORIGIN+'/props',{timeout:15000});
    if(!await waitPremium(page))throw Error('session unavailable');
    const result=await inspectTool(page,kind,premium);
    const receipt=await write('capabilities',{schema:'pickfinder-public-tool-schema-v1',kind,observedAt:new Date().toISOString(),captureOrigin:captureOrigin(env,p),...result});
    if(result.state!=='read_only_schema_observed')errors++;
    console.log(JSON.stringify({state:result.state==='read_only_schema_observed'?'public_tool_schema_pass':'public_tool_schema_pending',kind,result:result.state,archiveDigest:receipt.digest,mutations:0}));
   }catch{errors++;console.log(JSON.stringify({state:'public_tool_schema_pending',kind}));}
  }
  const saveControlProbe=async (name,result)=>{
   if(!await premium(page))throw Error('session unavailable');
   const receipt=await write('capabilities',{schema:'pickfinder-public-dashboard-control-effect-v1',name,
    path:new URL(page.url()).pathname,observedAt:new Date().toISOString(),captureOrigin:captureOrigin(env,p),
    result,completeDashboardVerified:false,accountMutations:0});
   console.log(JSON.stringify({state:'public_dashboard_control_effect',name,result,digest:receipt.digest}));
  };
  if(p.featuresOnly&&alive()){
   try{
    await page.goto(ORIGIN+'/props',{timeout:15000});
    if(!await waitPremium(page))throw Error('session unavailable');
    await saveControlProbe('Props',await observePropsPager(page,alive));
   }catch{errors++;console.log(JSON.stringify({state:'public_dashboard_control_effect_pending',name:'Props'}));}
  }
  for(const name of p.historyRepair||p.currentProfiles?[]:['Games','Discrepancies','Popular']){
   if(!alive())break;
   const stop=Date.now()+90000,featureAlive=()=>alive()&&Date.now()<stop;
   try{
    await page.goto(ORIGIN+'/props',{timeout:15000});if(!await waitPremium(page))throw Error('session unavailable');const href=await verifiedNavigation(page,name,dashboardRoutes(name));
    if(!href){errors++;console.log(JSON.stringify({state:'public_dashboard_route_pending',name}));continue;}
    await page.goto(href,{timeout:15000});if(!await waitPremium(page))throw Error('session unavailable');
    const controlSurface=await dashboardControlDiagnostics(page,name);
    if(p.featuresOnly&&featureAlive()){try{await saveControlProbe(name,await observeNamedControl(page,name,featureAlive));}catch{errors++;console.log(JSON.stringify({state:'public_dashboard_control_effect_pending',name}));}}
    let snapshots=0,sequences=0;const result=await traverseDashboardFilters(page,name,{shouldContinue:featureAlive,
     onSnapshot:async s=>{const {controls,...sports}=s;const r=await write('dashboards',{schema:'pickfinder-public-dashboard-v1',...sports});snapshots++;return r.digest;},
     onSequence:async receipt=>{await write('dashboards',{...receipt,captureOrigin:captureOrigin(env,p)});sequences++;}
    });
    if(p.featuresOnly&&featureAlive()){
     const evidence=await write('capabilities',{schema:'pickfinder-public-dashboard-control-diagnostics-v1',name,
      observedAt:new Date().toISOString(),path:new URL(href).pathname,captureOrigin:captureOrigin(env,p),
      ...controlSurface,traversalState:result.state,nativeEligible:result.filterAudit?.eligibleControls??0,
      customEligible:result.customFilterAudit?.maxEligibleControls??0,allDashboardDataVerified:false,accountMutations:0});
     console.log(JSON.stringify({state:'public_dashboard_control_readback',name,digest:evidence.digest,traversal:result.state,controls:controlSurface.controls}));
    }
    if(!snapshots){errors++;console.log(JSON.stringify({state:'public_dashboard_data_pending',name,reason:result.state}));}
    else console.log(JSON.stringify({state:'public_dashboard_pass',name,snapshots,sequences,filtersExhausted:result.filtersExhausted===true}));
   }catch{errors++;console.log(JSON.stringify({state:'public_dashboard_pending',name}));}
  }
  if(p.featuresOnly)return;
  const revision=archiveRevision(root);
  const q=current?{...current,pending:current.pending.slice(0,96)}:queue(iterate(root,'board-parts',revision),iterate(root,'profiles',revision));
  if(p.historyRepair)q.pending=q.repairPending;
  if(!current)console.log(JSON.stringify({state:'public_deep_queue',archiveRevision:revision,total:q.total,completed:q.done,remaining:q.pending.length,malformedHistoryPending:q.malformedHistoryPending,unresolvedHistoryRows:q.unresolvedHistoryRows,deferredHistoryScopes:q.deferredHistoryScopes,offerReferences:q.offerReferences,sharedAcrossBooks:q.sharedAcrossBooks,legacyPrivateHistoryImported:false}));
  // Explicit manual deep runs alone trial two isolated tabs; all archives remain serialized.
  // Never increase parallelism in the protected morning board or scheduled collection paths.
  const workers=profileWorkers(env,p),pages=[];
  const buffer=checkpointBuffer({write:rows=>write('profiles',{schema:'pickfinder-public-profiles-v1',observedAt:new Date().toISOString(),records:rows,modelInputsApproved:false}),onVerified:r=>{profiles++;console.log(JSON.stringify({state:'public_deep_scope_checkpoint_verified',sport:r.sport,book:r.book,status:r.status,truncated:r.truncated,verifiedThisRun:profiles}));}});
  const deepStarted=Date.now(),archiveBefore=archiveMs,transactionsBefore=transactions,profilesBefore=profiles,profileAlive=()=>alive()&&(!p.currentProfiles||Date.now()-deepStarted<18*60000);let attemptedProfiles=0,nontruncated=0,navigationMs=0,researchMs=0;
  try{
   for(let n=0;n<workers;n++){const detail=await context.newPage();detail.setDefaultTimeout(5000);pages.push(detail);}
   for(let i=0;i<q.pending.length&&profileAlive();i+=workers){
    const items=q.pending.slice(i,i+workers);
    const results=await Promise.allSettled(items.map(async(item,n)=>{
     const detail=pages[n],row={...item,research:[]},t=performance.now();let nav=0;attemptedProfiles++;
     try{await enrich(detail,row,{expanded:true,fullSportingHeaders:true,maxFields:Infinity,includePropHistory:!p.currentProfiles,probeSportsbookMovement:p.currentProfiles&&item.probeSportsbookMovement===true,shouldContinue:profileAlive,navigate:async url=>{const n0=performance.now();try{await detail.goto(url,{timeout:10000});await detail.getByRole('button',{name:'Open user menu'}).waitFor({timeout:10000});if(!await premium(detail))throw Error('session');
       const snap=await detail.evaluate(currentIdentity.readVisible,{player:row.player,detailId:row.detailId}).catch(()=>null);row.independentReconciliationContext=currentIdentity.captureProfileContext(row,snap,new Date().toISOString());
       }finally{nav+=performance.now()-n0;}}});}catch{row.profileCollection={truncated:true};}
     const reached=performance.now()-t;navigationMs+=nav;researchMs+=Math.max(0,reached-nav);
     const record={...publicProfile(row),independentReconciliationContext:row.independentReconciliationContext??null};
     return {record:p.currentProfiles?compactCurrentProfile({...record,currentProfileAttemptedAt:new Date().toISOString()}):record,elapsed:Math.round(performance.now()-t),authenticated:await premium(detail).catch(()=>false)};
    }));
    let failed=false;for(const x of results){if(x.status!=='fulfilled'){failed=true;continue;}const {record,elapsed,authenticated}=x.value;profileMs+=elapsed;await buffer.add(record);if(record.status==='sampled'&&record.truncated===false)nontruncated++;if(!authenticated)failed=true;}
    if(failed)throw Error('session unavailable');
   }
  }finally{
   try{if(!buffer.failed())await buffer.flush();}
   finally{await Promise.allSettled(pages.map(page=>page.close()));console.log(JSON.stringify({state:'public_deep_worker_metrics',workers,attemptedProfiles,nontruncated,verifiedProfiles:profiles,workerElapsedMs:Date.now()-deepStarted,aggregateProfileMs:profileMs,archiveMs,transactions,parallelBoardCollection:false,
     benchmark:{...profileBenchmarkScope(q.pending.slice(0,attemptedProfiles),p),navigationAggregateMs:Math.round(navigationMs),featureReadAggregateMs:Math.round(researchMs),
      profileArchiveMs:archiveMs-archiveBefore,profileArchiveTransactions:transactions-transactionsBefore,verifiedProfileWrites:profiles-profilesBefore}}));}
  }

 }finally{
  await context.close();console.log(JSON.stringify({state:'public_pickfinder_throughput',boards,profiles,profileMs,archiveMs,transactions,errors,elapsedMs:Date.now()-started,privateRepoUsed:false,modelInputsApproved:false}));
 }
}
module.exports={invocation,recoveryPartitions,clockAuditTargets,queue,cleanBoard,publicProfile,splitBoard,captureOrigin,profileWorkers,waitPremium,boardTargets,currentProfileQueue,compactCurrentProfile,profileBenchmarkScope};
if(require.main===module)main(fs.realpathSync(process.argv[2])).catch(()=>{console.error(JSON.stringify({state:'public_pickfinder_failed_closed',privateRepoUsed:false,accountDataLogged:false}));process.exitCode=1;});
