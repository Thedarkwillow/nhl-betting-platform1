'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{createHash,createHmac}=require('node:crypto');
const {safeDiscordWebhook}=require('../src/private-follow-discord-alerts.cjs');
const {build,message,sports,books,tiers,names}=require('./project-discord-line-alerts.cjs');
const ref='refs/heads/project-discord-alert-ledger',file='receipts.json';
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
function deliveryBatches(events,env){
 const base=allowDestination(env),r=jsonConfig(env.PROJECT_DISCORD_SPORT_ROUTES,6000),byChannel=new Map(),configured=new Map([[base.channel,base]]);
 if(Object.keys(r).length>4)throw Error('route capacity');
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
async function dispatch(events,{env,mode,runKey,now,ledger,client=fetch}){
 if(!['preview','test','deliver'].includes(mode))throw Error('mode');
 if(mode!=='test')events=events.filter(filterConfig(env.PROJECT_DISCORD_FILTERS));
 if(mode==='preview'||mode==='deliver'&&env.PROJECT_DISCORD_ALERTS_ENABLED!=='1')return {status:'preview',candidates:events.length,delivered:0};
 if(mode==='test'){
  if(!/^\d+$/.test(runKey))throw Error('run reference');
  events=[{id:hash('channel test '+runKey),kind:'research_update',text:'Channel setup test. No live offer or prediction.'}];
 }
 if(!events.length)return {status:'no_eligible_changes',delivered:0};
 if(events.some(e=>!id(e.id)))throw Error('event identity');
 const first=ledger.read();
 if(events.every(e=>Object.hasOwn(first.rows,e.id)))return {status:'already_claimed',delivered:0};
 const batches=mode==='test'?[{destination:allowDestination(env),events}]:deliveryBatches(events,env);
 let delivered=0;
 for(const b of batches)delivered+=await deliverBatch(b,{now,ledger,client});
 return {status:delivered?'discord_confirmed':'already_claimed',delivered};
}
async function deliverBatch({events,destination:dest},{now,ledger,client}){
 const stored=ledger.read();
 const pending=[...new Map(events.map(x=>[x.id,x])).values()].filter(e=>!Object.hasOwn(stored.rows,e.id)).slice(0,6);
 if(!pending.length)return 0;
 const opts={redirect:'error',signal:AbortSignal.timeout(12000)};
 const meta=await client(dest.url,opts);
 if(!meta.ok)throw Error('destination read failed');
 const verified=await meta.json();
 if(verified.guild_id!==dest.guild||verified.channel_id!==dest.channel)throw Error('destination identity mismatch');
 const rows=Object.fromEntries(Object.entries(stored.rows).filter(([,r])=>r.at>=now-72*60*M));
 if(Object.keys(rows).length>4900)throw Error('ledger capacity');
 for(const e of pending)rows[e.id]={at:now,state:'reserved'};
 // Reserve before POST. Ambiguous network outcomes never resend automatically.
 const claimed=ledger.save(stored.head,rows);
 const out=await client(dest.url+'?wait=true',{...opts,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message(pending))});
 if(!out.ok)throw Error('delivery unconfirmed');
 const receipt=await out.json();
 if(!snow(receipt.id)||receipt.channel_id!==dest.channel)throw Error('delivery unconfirmed');
 const proof=createHmac('sha256',dest.url).update(receipt.id).digest('hex');
 for(const e of pending)rows[e.id]={at:now,state:'confirmed',proof};
 ledger.save(claimed,rows);
 return pending.length;
}
async function main(){
 const mode=process.argv[2]||'preview',root=fs.realpathSync(process.argv[3]||'.'),now=Date.now();
 const report=f=>JSON.parse(git(root,['show','HEAD:data/'+f]));
 const r=mode==='test'?{events:[],usablePartitions:0}:build(root,now,
  report('pickfinder-reviewed-history-performance.json'),report('pickfinder-public-research-health.json'),
  require('./pickfinder-public-model-validation.cjs').history(root,'nba-official-availability'));
 const categories={};for(const e of r.events)categories[e.kind]=(categories[e.kind]||0)+1;
 const outcome=await dispatch(r.events,{env:process.env,mode,runKey:process.env.GITHUB_RUN_ID,now,ledger:gitLedger(root)});
 console.log(JSON.stringify({...outcome,usablePartitions:r.usablePartitions,categories,paidRequests:0}));
}
if(require.main===module)main().catch(()=>{console.error('Project Discord alerts stopped without retrying an unconfirmed delivery. Check destination setup, archive contracts, and the delivery ledger.');process.exitCode=1;});
module.exports={dispatch,gitLedger,filterConfig,deliveryBatches};
