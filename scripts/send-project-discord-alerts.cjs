'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{createHash,createHmac}=require('node:crypto');
const {safeDiscordWebhook}=require('../src/private-follow-discord-alerts.cjs');
const {build,message,collectionStatus,sports,books,tiers,names}=require('./project-discord-line-alerts.cjs');
const {buildSuggestions,isQualifiedSuggestion}=require('./project-discord-suggestions.cjs');
const ref='refs/heads/project-discord-alert-ledger',file='receipts.json';
const dtOrZero=x=>Date.parse(x)||0;
const id=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const snow=x=>typeof x==='string'&&/^\d{16,22}$/.test(x), M=60000;
const hash=x=>createHash('sha256').update(x).digest('hex');
const git=(root,args,opts={})=>execFileSync('git',['-C',root,...args],{stdio:['ignore','pipe','pipe'],maxBuffer:8e6,timeout:120000,...opts}).toString();
function gitLedger(root){
 function read(){
  const s=git(root,['ls-remote','--heads','origin',ref]).trim();if(!s)return {head:null,rows:{}};
  git(root,['fetch','--no-tags','origin',ref]);const head=git(root,['rev-parse','FETCH_HEAD']).trim();
  const rows=JSON.parse(git(root,['show',head+':'+file]));
  if(!rows||Array.isArray(rows)||Object.keys(rows).length>5000||Object.entries(rows).some(([k,r])=>
   !id(k)||!Number.isSafeInteger(r.at)||!['reserved','confirmed'].includes(r.state)||r.state==='confirmed'&&!id(r.proof)))throw Error('ledger');
  return {head,rows};
 }
 function save(head,rows){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'discord-ledger-'));
  const env={...process.env,GIT_INDEX_FILE:path.join(tmp,'index')};
  try{
   const blob=git(root,['hash-object','-w','--stdin'],{input:JSON.stringify(rows)+'\n',stdio:['pipe','pipe','pipe']}).trim();
   git(root,['read-tree','--empty'],{env});git(root,['update-index','--add','--cacheinfo','100644,'+blob+','+file],{env});
   const tree=git(root,['write-tree'],{env}).trim();
   const c=git(root,['-c','user.name=Platform research alerts','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit-tree',tree,...(head?['-p',head]:[]),'-m','Record counts-safe Discord delivery state']).trim();
   // Exact lease also protects the first claim when two runners observe an absent ref.
   git(root,['push','--force-with-lease='+ref+':'+(head||''),'origin',c+':'+ref]);return c;
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 }
 return {read,save};
}
function allowDestination(env){
 if(!safeDiscordWebhook(env.PROJECT_DISCORD_WEBHOOK_URL)||!snow(env.PROJECT_DISCORD_GUILD_ID)||!snow(env.PROJECT_DISCORD_CHANNEL_ID))throw Error('destination not configured');
 return {url:env.PROJECT_DISCORD_WEBHOOK_URL,guild:env.PROJECT_DISCORD_GUILD_ID,channel:env.PROJECT_DISCORD_CHANNEL_ID};
}
function jsonConfig(raw,limit){
 if(!raw)return {};
 if(typeof raw!=='string'||raw.length>limit)throw Error('configuration');
 const x=JSON.parse(raw);
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('configuration');
 return x;
}
function filterConfig(raw){
 const x=jsonConfig(raw,2000),allowed={sports,books,tiers,kinds:new Set(Object.keys(names))},out={};
 for(const [k,v] of Object.entries(x)){
  if(!Object.hasOwn(allowed,k)||!Array.isArray(v)||!v.length||v.length>30||v.some(a=>!allowed[k].has(a)))throw Error('filters');
  out[k]=new Set(v);
 }
 return e=>(!out.sports||out.sports.has(e.sport))&&(!out.kinds||out.kinds.has(e.kind))&&
  (!out.tiers||!e.tier||out.tiers.has(e.tier))&&(!out.books||!e.books?.length||e.books.every(b=>out.books.has(b)));
}
const claimed=(rows,e)=>Object.hasOwn(rows,e.id)||e.priorIds?.some(k=>id(k)&&Object.hasOwn(rows,k));
const routeNames=['prizepicks-props','prizepicks-suggestions','underdog-props','underdog-suggestions'];
const propKinds=new Set(['new_prop','line_change','price_change','removed_prop','reposted_prop','alternate_tier']);
const systemKinds=new Set(['research_update','availability_update','collection_status']);
function platformDestinations(env){
 const base=allowDestination(env);
 const routes=jsonConfig(env.PROJECT_DISCORD_PLATFORM_ROUTES,12000);
 const all=new Map([['general',base]]), seenChannels=new Set([base.channel]);
 const hookId=url=>new URL(url).pathname.split('/')[3];
 const hooks=new Set([hookId(base.url)]);
 if(Object.keys(routes).length!==routeNames.length)throw Error('four platform routes required');
 for(const name of routeNames){
  const p=Object.hasOwn(routes,name)&&routes[name];
  if(!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).sort().join(',')!=='channelId,webhookUrl'||
   !safeDiscordWebhook(p.webhookUrl)||!snow(p.channelId)||seenChannels.has(p.channelId)||hooks.has(hookId(p.webhookUrl)))throw Error('invalid platform route');
  seenChannels.add(p.channelId);hooks.add(hookId(p.webhookUrl));
  all.set(name,{url:p.webhookUrl,channel:p.channelId,guild:base.guild});
 }
 return all;
}
function platformRoute(e){
 if(systemKinds.has(e.kind))return 'general';
 if(e.books?.length!==1||!books.has(e.books[0]))return null;
 if(propKinds.has(e.kind))return e.books[0]+'-props';
 if(e.kind==='suggestion'&&isQualifiedSuggestion(e))return e.books[0]+'-suggestions';
 return null;
}
const splitEnabled=env=>env.PROJECT_DISCORD_PLATFORM_ROUTING_ENABLED==='1';
function deliveryBatches(events,env){
 if(splitEnabled(env)){
  const destinations=platformDestinations(env), groups=new Map();
  for(const e of events){
   const route=platformRoute(e);
   if(!route)continue;
   if(!groups.has(route))groups.set(route,{route,destination:destinations.get(route),events:[]});
   groups.get(route).events.push(e);
  }
  return [...groups.values()];
 }
 events=events.filter(e=>e.kind!=='suggestion');
 const base=allowDestination(env),r=jsonConfig(env.PROJECT_DISCORD_SPORT_ROUTES,9000),byChannel=new Map(),configured=new Map([[base.channel,base]]);
 if(Object.keys(r).length>sports.size)throw Error('route capacity');
 for(const [sport,p] of Object.entries(r)){
  if(!sports.has(sport)||!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).sort().join(',')!=='channelId,webhookUrl'||
    !safeDiscordWebhook(p.webhookUrl)||!snow(p.channelId)||p.channelId===base.channel)throw Error('sport route');
  const old=configured.get(p.channelId);
  if(old&&old.url!==p.webhookUrl)throw Error('sport route destination conflict');
  configured.set(p.channelId,{url:p.webhookUrl,channel:p.channelId,guild:base.guild});
 }
 for(const e of events){
  const d=Object.hasOwn(r,e.sport)?configured.get(r[e.sport].channelId):base;
  const list=byChannel.get(d.channel)||{destination:d,events:[]};list.events.push(e);byChannel.set(d.channel,list);
 }
 return [...byChannel.values()];
}
const priority=e=>['new_prop','alternate_tier','reposted_prop'].includes(e.kind)?0:e.kind==='line_change'||e.kind==='suggestion'?1:2;
function batchConfig(raw){
 const x=jsonConfig(raw,1000), defaults={itemsPerMessage:6,messagesPerChannel:8,messagesPerRun:12,newPropLookbackMinutes:240};
 const bounds={itemsPerMessage:[1,6],messagesPerChannel:[1,12],messagesPerRun:[1,36],newPropLookbackMinutes:[25,480]};
 for(const [k,v] of Object.entries(x)){
  if(!Object.hasOwn(bounds,k)||!Number.isInteger(v)||v<bounds[k][0]||v>bounds[k][1])throw Error('batch configuration');
 }
 return {...defaults,...x};
}
async function dispatch(events,{env,mode,runKey,now,ledger,client=fetch}){
 if(!['preview','test','test_routes','deliver'].includes(mode))throw Error('mode');
 if(mode==='test_routes')return testRoutes(env,runKey,{now,ledger,client});
 const split=mode==='deliver'&&splitEnabled(env);
 if(split&&!env.PROJECT_DISCORD_PLATFORM_ROUTES)return {status:'routes_unconfigured',delivered:0};
 if(mode!=='test')events=events.filter(filterConfig(env.PROJECT_DISCORD_FILTERS)).filter(e=>e.kind!=='suggestion'||isQualifiedSuggestion(e));
 if(mode==='deliver')events=events.filter(e=>split?platformRoute(e):!['suggestion','collection_status'].includes(e.kind));
 if(mode==='preview'||mode==='deliver'&&env.PROJECT_DISCORD_ALERTS_ENABLED!=='1')return {status:'preview',candidates:events.length,delivered:0};
 if(mode==='test'){
  if(!/^\d+$/.test(runKey))throw Error('run reference');
  events=[{id:hash('channel test '+runKey),kind:'research_update',text:'Channel setup test. No live offer or prediction.'}];
 }
 const deliveredCategories={};
 if(!events.length)return {status:'no_eligible_changes',delivered:0,deliveredCategories};
 if(events.some(e=>!id(e.id)))throw Error('event identity');
 const first=ledger.read(),config=batchConfig(env.PROJECT_DISCORD_BATCH_CONFIG);
 const pending=[...new Map(events.map(e=>[e.id,e])).values()].filter(e=>!claimed(first.rows,e));
 if(!pending.length)return {status:'already_claimed',delivered:0,deliveredCategories};
 const batches=mode==='test'?[{destination:allowDestination(env),events:pending}]:deliveryBatches(pending,env);
 let delivered=0,messages=0;
 const perChannel=new Map(),sentIds=new Set(),deliveredRoutes={},unavailableRoutes=new Set();
 // Across channels, exhaust higher priority before ordinary updates. Round
 // robin inside each priority so one busy sport cannot take every batch.
 for(const rank of [0,1,2]){
  const groups=batches.map(b=>({...b,events:b.events.filter(e=>priority(e)===rank)
   .sort((a,b)=>(dtOrZero(a.observedAt)-dtOrZero(b.observedAt))||a.id.localeCompare(b.id))}));
  while(messages<config.messagesPerRun&&groups.some(b=>!unavailableRoutes.has(b.route)&&b.events.length&&(perChannel.get(b.destination.channel)||0)<config.messagesPerChannel)){
   for(const b of groups){
    const channel=b.destination.channel,count=perChannel.get(channel)||0;
    if(messages>=config.messagesPerRun||count>=config.messagesPerChannel||!b.events.length||unavailableRoutes.has(b.route))continue;
    let sent;
    try{
     sent=await deliverBatch({destination:b.destination,events:b.events.splice(0,Math.min(config.itemsPerMessage,b.route?.endsWith('-suggestions')?3:6))},{now,ledger,client});
    }catch(e){
     if(!split||!(e instanceof DestinationError))throw e;
     unavailableRoutes.add(b.route);continue;
    }
    if(sent.length&&b.route)deliveredRoutes[b.route]=(deliveredRoutes[b.route]||0)+sent.length;
    if(sent.length){messages++;perChannel.set(channel,count+1);}
    for(const e of sent){sentIds.add(e.id);delivered++;deliveredCategories[e.kind]=(deliveredCategories[e.kind]||0)+1;}
   }
  }
 }
 const remaining=pending.length-delivered,remainingCategories={};
 for(const e of pending)if(!sentIds.has(e.id))remainingCategories[e.kind]=(remainingCategories[e.kind]||0)+1;
 return {status:unavailableRoutes.size?'route_verification_failed':delivered?'discord_confirmed':'already_claimed',delivered,deliveredCategories,...(split?{deliveredRoutes,unavailableRoutes:[...unavailableRoutes]}:{}),...(remaining?{remaining,remainingCategories}:{}),...(messages?{messages}:{})};
}
class DestinationError extends Error {}
async function testRoutes(env,runKey,ctx){
 if(!env.PROJECT_DISCORD_PLATFORM_ROUTES)return {status:'routes_unconfigured',delivered:0};
 if(!/^\d+$/.test(runKey))throw Error('run reference');
 const results={};
 let delivered=0;
 for(const [route,destination] of platformDestinations(env)){
  const event={id:hash('platform route test '+route+' '+runKey),kind:'research_update',
   text:'Route setup test for #'+route+'. No live offer or prediction.'};
  try{
   const sent=await deliverBatch({destination,events:[event]},ctx);
   delivered+=sent.length;
   results[route]=sent.length?'discord_confirmed':ctx.ledger.read().rows[event.id]?.state==='confirmed'?'previously_confirmed':'unconfirmed';
  }catch{
   results[route]='unconfirmed';
  }
 }
 return {status:Object.values(results).every(v=>v!=='unconfirmed')?'discord_confirmed':'route_verification_failed',delivered,results};
}
async function deliverBatch({events,destination:dest},{now,ledger,client}){
 const stored=ledger.read();
 const pending=[...new Map(events.map(x=>[x.id,x])).values()].filter(e=>!claimed(stored.rows,e));
 if(!pending.length)return [];
 const opts={redirect:'error',signal:AbortSignal.timeout(12000)};
 let verified;
 try{
  const meta=await client(dest.url,opts);
  if(!meta.ok)throw Error('metadata read');
  verified=await meta.json();
 }catch{throw new DestinationError('destination read failed');}
 if(verified?.guild_id!==dest.guild||verified?.channel_id!==dest.channel)throw new DestinationError('destination identity mismatch');
 const rows=Object.fromEntries(Object.entries(stored.rows).filter(([,r])=>r.at>=now-72*60*M));
 if(Object.keys(rows).length>4900)throw Error('ledger capacity');
 for(const e of pending)rows[e.id]={at:now,state:'reserved'};
 // Reserve before POST. Ambiguous network outcomes never resend automatically.
 const claim=ledger.save(stored.head,rows);
 const out=await client(dest.url+'?wait=true',{...opts,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message(pending))});
 if(!out.ok)throw Error('delivery unconfirmed');
 const receipt=await out.json();
 if(!snow(receipt.id)||receipt.channel_id!==dest.channel)throw Error('delivery unconfirmed');
 const proof=createHmac('sha256',dest.url).update(receipt.id).digest('hex');
 for(const e of pending)rows[e.id]={at:now,state:'confirmed',proof};
 ledger.save(claim,rows);
 return pending;
}
async function main(){
 const mode=process.argv[2]||'preview',root=fs.realpathSync(process.argv[3]||'.'),now=Date.now();
 const report=f=>JSON.parse(git(root,['show','HEAD:data/'+f]));
 const building=!['test','test_routes'].includes(mode);
 const r=!building?{events:[],usablePartitions:0}:build(root,now,
  report('pickfinder-reviewed-history-performance.json'),report('pickfinder-public-research-health.json'),
  require('./pickfinder-public-model-validation.cjs').history(root,'nba-official-availability'),
  {registry:report('pickfinder-current-identity-registry.json'),windowMs:batchConfig(process.env.PROJECT_DISCORD_BATCH_CONFIG).newPropLookbackMinutes*M});
 if(building){
  const filename='approved-individual-prop-research.json';
  // Only read an approved public artifact from the checked-out commit, never a local untracked file.
  const tracked=git(root,['ls-tree','--name-only','HEAD','data/'+filename]).trim();
  if(tracked)r.events.push(...buildSuggestions(report(filename),now));
  if(mode==='deliver'&&splitEnabled(process.env))r.events.push(...collectionStatus(report('pickfinder-public-activity.json'),now));
 }
 const categories={};for(const e of r.events)categories[e.kind]=(categories[e.kind]||0)+1;
 const outcome=await dispatch(r.events,{env:process.env,mode,runKey:process.env.GITHUB_RUN_ID,now,ledger:gitLedger(root)});
 console.log(JSON.stringify({...outcome,usablePartitions:r.usablePartitions,categories,qualifiedSuggestions:categories.suggestion||0,paidRequests:0}));
 if(['routes_unconfigured','route_verification_failed'].includes(outcome.status))process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.error('Project Discord alerts stopped without retrying an unconfirmed delivery. Check destination setup, archive contracts, and the delivery ledger.');process.exitCode=1;});
module.exports={dispatch,gitLedger,filterConfig,deliveryBatches,batchConfig};
