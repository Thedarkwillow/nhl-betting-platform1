'use strict';
// Separate, bounded post-snapshot research. Never represents a new pregame offer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const SEED='aef07d2aecb75388c6757c9cc5844b2113d6a0ac';
const ROOT='research/pickfinder-premium-deep';
const {traverseDashboard,inspectCapabilities,verifiedNavigation}=require('./pickfinder-dashboard-research.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const git=(root,args)=>execFileSync('git',['-C',root,...args],{maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']});
function scope(book,row){
 if(!['prizepicks','underdog'].includes(book)||!row||!row.sport||!row.player||!row.market||!row.eventId||typeof row.detailId!=='string')return null;
 let url;try{url=new URL(row.detailId,'https://www.pickfinder.app');}catch{return null;}
 if(url.origin!=='https://www.pickfinder.app'||!url.pathname.startsWith('/players/')||!url.searchParams.has('prop'))return null;
 return {book,sport:row.sport,player:row.player,market:row.market,eventId:row.eventId,detailId:row.detailId,period:row.period||null,mapRange:row.mapRange||null,gameMode:row.gameMode||null};
}
function queue(batches,done=new Set()){
 const unique=new Map();
 for(const b of batches)for(const p of b.pages)for(const row of p.rows){
  if(row.sport!==b.sport||!Array.isArray(row.apps))continue;
  const priced=row.apps.some(a=>a.book===b.book&&Number.isFinite(a.line)&&['Higher','Lower'].includes(a.side)&&/^[+-]\d{2,4}$/.test(a.displayedPrice||''));
  const tierEvidence=Array.isArray(row.appEvidence)&&row.appEvidence.some(e=>e?.book===b.book&&Number.isFinite(e.line)&&['goblin','demon'].includes(e.tier)&&Array.isArray(e.icons)&&e.icons.length===2&&e.icons.includes(b.book)&&e.icons.includes(e.tier));
  if(!priced&&!tierEvidence)continue; // Profile research is not price or side verification.
  const s=scope(b.book,row);if(!s)continue;
  const key=hash(JSON.stringify(s));if(!unique.has(key))unique.set(key,{key,...s});
 }
 const rank=s=>['nba','cs2','dota2','valorant','lol','cod','nhl','nfl'].indexOf(s);
 const bySport=new Map();
 for(const item of unique.values()){if(done.has(item.key))continue;const list=bySport.get(item.sport)||[];list.push(item);bySport.set(item.sport,list);}
 const sports=[...bySport.keys()].sort((a,b)=>(rank(a)<0?99:rank(a))-(rank(b)<0?99:rank(b)));
 // Round-robin across sports so NBA cannot starve esports.
 const pending=[];for(let i=0;sports.some(s=>i<bySport.get(s).length);i++)for(const s of sports){const item=bySport.get(s)[i];if(item)pending.push(item);}
 return {total:unique.size,pending};
}
function seedBatches(root){
 git(root,['merge-base','--is-ancestor',SEED,'HEAD']);
 const files=git(root,['diff-tree','--no-commit-id','--name-only','-r',SEED]).toString().trim().split('\n').filter(p=>/^research\/pickfinder-premium\/2026-11-25\/manual\/[a-z-]+\/[a-z0-9-]+\/[a-z0-9-]+\/source\.json$/.test(p));
 if(files.length!==27)throw Error('seed partitions mismatch');
 return files.map(p=>{const raw=git(root,['show',SEED+':'+p]),n=JSON.parse(git(root,['show',SEED+':'+p.replace(/source\.json$/,'normalized.json')]));if(hash(raw)!==n.sourceDigest)throw Error('seed digest mismatch');return JSON.parse(raw);});
}
function allBatches(root){
 const base=seedBatches(root);
 const files=git(root,['ls-tree','-r','--name-only','HEAD','--','research/pickfinder-premium']).toString().trim().split('\n').filter(p=>/^research\/pickfinder-premium\/\d{4}-\d{2}-\d{2}\/(manual|0600|0900)\/(prizepicks|underdog)\/[a-z0-9-]+\/[a-z0-9-]+\/source\.json$/.test(p));
 const seen=new Set(base.map(b=>JSON.stringify([b.book,b.sport,b.startedAt,b.finishedAt])));
 for(const p of files){try{
  const raw=git(root,['show','HEAD:'+p]),n=JSON.parse(git(root,['show','HEAD:'+p.replace(/source\.json$/,'normalized.json')]));
  if(hash(raw)!==n.sourceDigest)continue;
  const b=JSON.parse(raw),k=JSON.stringify([b.book,b.sport,b.startedAt,b.finishedAt]);
  if(!Array.isArray(b.pages)||seen.has(k))continue;
  seen.add(k);base.push(b);
 }catch{}}
 return base;
}
function summarizeCheckpoints(checkpoints){
 const done=new Set(),attempts=new Map(),scopes=new Map();let files=0,invalid=0,records=0,dashboardSnapshots=0,summaryFiles=0,failedAttempts=0,partialAttempts=0,fields=0;
 for(const b of checkpoints){
  files++;if(b?.seed!==SEED||b?.schema!=='pickfinder-deep-v1'||!Array.isArray(b.records)){invalid++;continue;}
  dashboardSnapshots+=Array.isArray(b.dashboardSnapshots)?b.dashboardSnapshots.length:0;
  if(!b.records.length&&!b.dashboardSnapshots?.length)summaryFiles++;
  for(const r of b.records){
   const s=scope(r?.book,r);if(!s||hash(JSON.stringify(s))!==r.key){invalid++;continue;}
   records++;attempts.set(r.key,(attempts.get(r.key)||0)+1);scopes.set(r.key,s.sport);
   if(r.status==='failed')failedAttempts++;
   if(r.status==='sampled'&&r.profileCollection?.truncated===false&&Array.isArray(r.research)&&r.research.length&&!r.profileCollection?.tabAudit?.some(t=>t.state==='failed')){done.add(r.key);fields+=r.research.length;}
   else partialAttempts++;
  }
 }
 const bySport={};for(const [key,sport] of scopes){const b=bySport[sport]??={attemptedScopes:0,completeScopes:0};b.attemptedScopes++;if(done.has(key))b.completeScopes++;}
 return {done,attempts,summary:{checkpointFiles:files,invalidCheckpointsOrRecords:invalid,profileAttempts:records,uniqueAttemptedScopes:attempts.size,completeScopes:done.size,incompleteScopes:attempts.size-done.size,failedAttempts,partialAttempts,completeAttemptFields:fields,dashboardSnapshots,summaryFiles,bySport,rawRowsPublished:0,modelInputsApproved:false}};
}
function priorDone(root,ref='HEAD'){
 if(!['HEAD','FETCH_HEAD'].includes(ref))throw Error('invalid archive ref');
 const files=git(root,['ls-tree','-r','--name-only',ref,'--',ROOT+'/'+SEED]).toString().trim().split('\n').filter(x=>x.endsWith('/research.json'));
 function* checkpoints(){for(const file of files){try{yield JSON.parse(git(root,['show',ref+':'+file]));}catch{yield null;}}}
 return summarizeCheckpoints(checkpoints());
}
class DeepFailure extends Error{constructor(stage){super(stage);this.deepStage=stage;}}
async function checked(stage,fn){try{return await fn();}catch(e){if(e instanceof DeepFailure)throw e;throw new DeepFailure(stage);}}
function inventory(){
 const visible=e=>e.getClientRects().length>0;
 const names=['Games','Discrepancies','Popular','Pick Builder','Alerts','Line Alerts','Date','Game','Market','Sport','Apps','Modifiers','Newest','Dota 2','DOTA2','Soccer','SOCCER'];
 const controls=[...document.querySelectorAll('button,a,[role=tab]')].filter(visible);
 return Object.fromEntries(names.map(n=>[n,controls.filter(e=>{const v=(e.getAttribute('aria-label')||e.innerText||'').trim();return v===n||v.startsWith(n+' ');}).length]));
}
async function persist(root,data){
 const prefix=ROOT+'/'+SEED+'/'+crypto.randomUUID();
 const target=path.join(root,prefix);
 fs.mkdirSync(target,{recursive:true,mode:0o700});
 const file=prefix+'/research.json',raw=JSON.stringify(data);
 if(Buffer.byteLength(raw)>8_000_000)throw new DeepFailure('checkpoint_size_limit');
 await checked('checkpoint_write',()=>fs.writeFileSync(path.join(root,file),raw,{flag:'wx',mode:0o600}));
 await checked('checkpoint_stage',()=>git(root,['add','--',file]));const staged=git(root,['diff','--cached','--name-status']).toString().trim();
 if(staged!=='A\t'+file)throw new DeepFailure('checkpoint_not_append_only');
 await checked('checkpoint_commit',()=>git(root,['-c','user.name=PickFinder research runner','-c','user.email=research-runner@users.noreply.github.com','commit','-m','Archive bounded PickFinder deep research']));
 let sha=null;
 for(let attempt=0;attempt<6;attempt++){
  await checked('checkpoint_fetch',()=>git(root,['fetch','origin','main']));
  try{git(root,['rebase','FETCH_HEAD']);}catch(e){try{git(root,['rebase','--abort']);}catch{}throw new DeepFailure('checkpoint_rebase');}
  const revision=git(root,['rev-parse','HEAD']).toString().trim();
  if(git(root,['diff-tree','--no-commit-id','--name-status','-r',revision]).toString().trim()!=='A\t'+file)throw new DeepFailure('checkpoint_rebase_not_append_only');
  try{git(root,['push','origin','HEAD:refs/heads/main']);sha=revision;break;}catch(e){const detail=String(e?.stderr||'');const category=/non-fast-forward|fetch first|failed to push some refs/i.test(detail)?'remote_advanced_or_rejected':/403|permission denied|authentication failed/i.test(detail)?'permission_or_authentication':/large files|exceeds.*limit|GH001/i.test(detail)?'size_rejected':'other';console.log(JSON.stringify({state:'deep_checkpoint_push_retry',attempt:attempt+1,category,rawDataLogged:false}));if(attempt===5||category==='permission_or_authentication'||category==='size_rejected')throw new DeepFailure('checkpoint_push_'+category);await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));}
 }
 if(!sha)throw new DeepFailure('checkpoint_push_exhausted');
 await checked('checkpoint_remote_verification',()=>{git(root,['fetch','origin','main']);git(root,['merge-base','--is-ancestor',sha,'FETCH_HEAD']);if(hash(git(root,['show','FETCH_HEAD:'+file]))!==hash(raw))throw Error('digest mismatch');});

 return sha;
}
async function run({root,context,page,enrich,collect,evidence={},limit=Infinity,shouldContinue=()=>true}){
 if(!(limit===Infinity||Number.isInteger(limit)&&limit>0))throw Error('profile budget');
 const {done,attempts,summary}=await checked('checkpoint_inventory',()=>priorDone(root));
 const q=await checked('board_archive_queue',()=>queue(allBatches(root),done));
 console.log(JSON.stringify({state:'deep_resume_inventory',...summary,queueTotal:q.total,remaining:q.pending.length}));
 if(summary.invalidCheckpointsOrRecords)throw new DeepFailure('checkpoint_inventory_invalid');
 const policy=require('./season-aware-collection.cjs');
 const core=new Set(['nba','nhl','nfl']),active=new Set(Object.entries(policy.registry).filter(([c,s])=>['CS2','DOTA2','VAL','LOL','COD'].includes(c)&&policy.scheduleStatus(evidence[c])==='competition_scheduled').map(([c,s])=>s));
 const tier=x=>core.has(x.sport)?0:active.has(x.sport)?1:2;
 const queues=[0,1,2].map(n=>q.pending.filter(x=>tier(x)===n).sort((a,b)=>(attempts.get(a.key)||0)-(attempts.get(b.key)||0)));
 q.pending=[];while(queues.some(q=>q.length))for(const n of [0,0,0,1,1,2])if(queues[n].length)q.pending.push(queues[n].shift());
 const startedAt=new Date().toISOString(),records=[],diagnostics={};
 let persistedProfiles=0,persistedComplete=0,phase='dashboard_inventory';
 try{
 const premium=async p=>p.evaluate(()=>document.body.innerText.split('\n').some(l=>l.trim()==='Premium')&&!!document.querySelector('button[aria-label="Open user menu"]'));
 diagnostics.controls=await page.evaluate(inventory);
 diagnostics.readOnlyCapabilities=await inspectCapabilities(page);
 // Only follow uniquely visible same-origin read-only dashboard anchors. Builder and alerts are inventory-only.
 diagnostics.dashboards={};
 const dashboardSnapshots=[];
 for(const name of ['Games','Discrepancies','Popular']){
  if(!shouldContinue())break;
  try{
   await page.goto('https://www.pickfinder.app/props',{timeout:15000});
   const href=await verifiedNavigation(page,name,['/'+name.toLowerCase()]);
   if(!href){diagnostics.dashboards[name]={state:'link_not_verified'};continue;}
   await page.goto(href,{timeout:15000});
   await page.waitForFunction(()=>document.body.innerText.split('\n').some(l=>l.trim()==='Premium'),null,{timeout:12000});
   if(!await premium(page))throw Error('session unavailable');
   let tables=0,cards=0,clocks=0;
   const traversal=await traverseDashboard(page,name,{shouldContinue,onSnapshot:async snapshot=>{
    tables+=snapshot.tables.length;cards+=snapshot.cards.length;clocks+=snapshot.clocks.length;
    await persist(root,{schema:'pickfinder-deep-v1',seed:SEED,startedAt,finishedAt:new Date().toISOString(),diagnostics:{},dashboardSnapshots:[snapshot],records:[],modelInputsApproved:false,originalOffersVerified:false});
   }});
   diagnostics.dashboards[name]={...traversal,tables,cards,clocks,controls:await page.evaluate(inventory)};

  }catch(e){if(e instanceof DeepFailure)throw e;diagnostics.dashboards[name]={state:'unverified'};await page.goto('https://www.pickfinder.app/props',{timeout:20000});await page.getByRole('button',{name:'Open user menu'}).waitFor({timeout:15000});if(!await premium(page).catch(()=>false))throw Error('session unavailable');}
 }
 // Inspect only same-origin read-only navigation links; do not add picks, save alerts or submit forms.
 for(const name of ['Pick Builder','Line Alerts','Alerts']){
  if(!shouldContinue())break;
  try{
   await page.goto('https://www.pickfinder.app/props',{timeout:15000});
   const href=await verifiedNavigation(page,name,name==='Pick Builder'?['/pick-builder','/builder']:['/alerts','/line-alerts']);
   if(!href){diagnostics[name]={state:'navigation_not_verified'};continue;}
   const u=new URL(href);
   await page.goto(u.href,{timeout:15000});await page.getByRole('button',{name:'Open user menu'}).waitFor({timeout:10000});
   if(!await premium(page))throw Error('session unavailable');
   diagnostics[name]={state:'read_only_capabilities_observed',route:u.pathname,labels:await inspectCapabilities(page),mutations:0};
  }catch{diagnostics[name]={state:'unverified',mutations:0};}
 }
 for(const code of ['DOTA2','SOCCER']){
  if(!shouldContinue())break;
  try{await page.goto('https://www.pickfinder.app/props',{timeout:20000});
   const b=await collect(page,{book:'prizepicks',code,maxPages:1,shouldContinue});
   diagnostics[code]={state:b.boardState,pages:b.pages.length,displayedPages:b.displayedPageCount||null,failure:b.failure||null,controls:await page.evaluate(inventory)};
  }catch{diagnostics[code]={state:'failed',controls:await page.evaluate(inventory).catch(()=>null)};}
  if(!await premium(page)){diagnostics[code].sessionUnverified=true;await page.goto('https://www.pickfinder.app/props',{timeout:20000});await page.getByRole('button',{name:'Open user menu'}).waitFor({timeout:15000});}
 }
 phase='profile_navigation';
 const detail=await context.newPage();detail.setDefaultTimeout(5000);
 for(const item of q.pending.slice(0,limit)){
  if(!shouldContinue())break;
  const row={...item,research:[]};
  try{
   await enrich(detail,row,{maxFields:Infinity,navigate:async url=>{await detail.goto(url,{timeout:10000});await detail.getByRole('button',{name:'Open user menu'}).waitFor({timeout:10000});if(new URL(detail.url()).origin!=='https://www.pickfinder.app'||!await premium(detail))throw Error('session unavailable');}});
   records.push({...item,status:row.research.length?'sampled':'empty',profileCollection:row.profileCollection,research:row.research});
  }catch{records.push({...item,status:'failed',profileCollection:row.profileCollection,research:row.research});}
  phase='profile_checkpoint';
  await persist(root,{schema:'pickfinder-deep-v1',seed:SEED,startedAt,finishedAt:new Date().toISOString(),diagnostics:{},dashboardSnapshots:[],records:[records.at(-1)],modelInputsApproved:false,originalOffersVerified:false});
  persistedProfiles++;if(records.at(-1).status==='sampled'&&records.at(-1).profileCollection?.truncated===false)persistedComplete++;
  if(persistedProfiles%10===0)console.log(JSON.stringify({state:'deep_profile_progress',persistedProfiles,persistedComplete,rawRowsPublished:0}));
  phase='profile_session';if(!await premium(detail).catch(()=>false))throw new DeepFailure('profile_session_unverified');
 }
 phase='summary_checkpoint';
 const finishedAt=new Date().toISOString();
 const data={schema:'pickfinder-deep-v1',seed:SEED,startedAt,finishedAt,diagnostics,dashboardSnapshots:[],records:[],modelInputsApproved:false,originalOffersVerified:false};
 const sha=await persist(root,data);
 const sampled=records.filter(r=>r.status==='sampled').length,complete=records.filter(r=>r.status==='sampled'&&r.profileCollection?.truncated===false).length;
 return {state:'deep_research_verified',sha,queueTotal:q.total,priorSampled:done.size,attempted:records.length,sampled,completeUntruncatedProfiles:complete,remaining:q.pending.length-complete,diagnostics,rawRowsPublished:0,modelInputsApproved:false};
 }catch(e){const stage=e instanceof DeepFailure?e.deepStage:phase;console.log(JSON.stringify({state:'deep_research_partial',stage,persistedProfiles,persistedComplete,remaining:q.pending.length-persistedComplete,rawRowsPublished:0,modelInputsApproved:false}));throw new DeepFailure(stage);}
}
module.exports={scope,queue,inventory,run,allBatches,persist,priorDone,summarizeCheckpoints,DeepFailure};
if(require.main===module){try{const root=fs.realpathSync(process.argv[2]);const ref=process.argv[3]||'HEAD';const {summary}=priorDone(root,ref);console.log(JSON.stringify({state:'deep_archive_count_audit',...summary}));if(summary.invalidCheckpointsOrRecords)process.exitCode=1;}catch{console.error(JSON.stringify({state:'deep_archive_audit_failed',rawRowsPublished:0}));process.exitCode=1;}}
