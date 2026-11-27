'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{createHash,createHmac}=require('node:crypto');
const {safeDiscordWebhook}=require('../src/private-follow-discord-alerts.cjs');
const {build,message}=require('./project-discord-line-alerts.cjs');
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
async function dispatch(events,{env,mode,runKey,now,ledger,client=fetch}){
 if(!['preview','test','deliver'].includes(mode))throw Error('mode');
 if(mode==='preview'||mode==='deliver'&&env.PROJECT_DISCORD_ALERTS_ENABLED!=='1')return {status:'preview',candidates:events.length,delivered:0};
 if(mode==='test'){
  if(!/^\d+$/.test(runKey))throw Error('run reference');
  events=[{id:hash('channel test '+runKey),kind:'research_update',text:'Channel setup test. No live offer or prediction.'}];
 }
 if(!events.length)return {status:'no_eligible_changes',delivered:0};
 if(events.some(e=>!id(e.id)))throw Error('event identity');
 const stored=ledger.read();
 const pending=[...new Map(events.map(x=>[x.id,x])).values()].filter(e=>!Object.hasOwn(stored.rows,e.id)).slice(0,6);
 if(!pending.length)return {status:'already_claimed',delivered:0};
 const dest=allowDestination(env),opts={redirect:'error',signal:AbortSignal.timeout(12000)};
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
 return {status:'discord_confirmed',delivered:pending.length};
}
async function main(){
 const mode=process.argv[2]||'preview',root=fs.realpathSync(process.argv[3]||'.'),now=Date.now();
 const report=f=>JSON.parse(git(root,['show','HEAD:data/'+f]));
 const r=mode==='test'?{events:[],usablePartitions:0}:build(root,now,
  report('pickfinder-reviewed-history-performance.json'),report('pickfinder-public-research-health.json'));
 const categories={};for(const e of r.events)categories[e.kind]=(categories[e.kind]||0)+1;
 const outcome=await dispatch(r.events,{env:process.env,mode,runKey:process.env.GITHUB_RUN_ID,now,ledger:gitLedger(root)});
 console.log(JSON.stringify({...outcome,usablePartitions:r.usablePartitions,categories,paidRequests:0}));
}
if(require.main===module)main().catch(()=>{console.error('Project Discord alerts stopped without retrying an unconfirmed delivery. Check destination setup, archive contracts, and the delivery ledger.');process.exitCode=1;});
module.exports={dispatch,gitLedger};
