'use strict';
// Separate, bounded post-snapshot research. Never represents a new pregame offer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const SEED='aef07d2aecb75388c6757c9cc5844b2113d6a0ac';
const ROOT='research/pickfinder-premium-deep';
const {traverseDashboard,inspectCapabilities}=require('./pickfinder-dashboard-research.cjs');
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
  if(row.sport!==b.sport||!Array.isArray(row.apps)||!row.apps.some(a=>a.book===b.book&&Number.isFinite(a.line)&&['Higher','Lower'].includes(a.side)&&/^[+-]\d{2,4}$/.test(a.displayedPrice||'')))continue;
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
function priorDone(root){
 const done=new Set(),attempts=new Map(),files=git(root,['ls-tree','-r','--name-only','HEAD','--',ROOT+'/'+SEED]).toString().trim().split('\n').filter(x=>x.endsWith('/research.json'));
 for(const file of files){const b=JSON.parse(git(root,['show','HEAD:'+file]));if(b.seed!==SEED||b.schema!=='pickfinder-deep-v1')throw Error('checkpoint contract');for(const r of b.records){attempts.set(r.key,(attempts.get(r.key)||0)+1);if(r.status==='sampled'&&r.profileCollection?.truncated===false&&r.research?.length&&/^[a-f0-9]{64}$/.test(r.key))done.add(r.key);}}
 return {done,attempts};
}
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
 if(Buffer.byteLength(raw)>8_000_000)throw Error('profile snapshot exceeds safe file size');
 fs.writeFileSync(path.join(root,file),raw,{flag:'wx',mode:0o600});
 git(root,['add','--',file]);const staged=git(root,['diff','--cached','--name-status']).toString().trim();
 if(staged!=='A\t'+file)throw Error('append-only research required');
 git(root,['-c','user.name=PickFinder research runner','-c','user.email=research-runner@users.noreply.github.com','commit','-m','Archive bounded PickFinder deep research']);
 let sha=null;
 for(let attempt=0;attempt<3;attempt++){
  git(root,['fetch','origin','main']);
  try{git(root,['rebase','FETCH_HEAD']);}catch(e){try{git(root,['rebase','--abort']);}catch{}throw e;}
  const revision=git(root,['rev-parse','HEAD']).toString().trim();
  if(git(root,['diff-tree','--no-commit-id','--name-status','-r',revision]).toString().trim()!=='A\t'+file)throw Error('deep archive not append-only');
  try{git(root,['push','origin','HEAD:refs/heads/main']);sha=revision;break;}catch(e){if(attempt===2)throw e;await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));}
 }
 if(!sha)throw Error('deep archive push failed');
 git(root,['fetch','origin','main']);git(root,['merge-base','--is-ancestor',sha,'FETCH_HEAD']);
 if(hash(git(root,['show','FETCH_HEAD:'+file]))!==hash(raw))throw Error('deep archive digest mismatch');

 return sha;
}
async function run({root,context,page,enrich,collect,evidence={},limit=Infinity,shouldContinue=()=>true}){
 if(!(limit===Infinity||Number.isInteger(limit)&&limit>0))throw Error('profile budget');
 const {done,attempts}=priorDone(root),q=queue(allBatches(root),done);
 const policy=require('./season-aware-collection.cjs'),order=policy.prioritySports(Object.keys(policy.registry),evidence).map(c=>policy.registry[c]);
 const core=new Set(['nba','nhl','nfl']),active=new Set(Object.entries(policy.registry).filter(([c,s])=>['CS2','DOTA2','VAL','LOL','COD'].includes(c)&&policy.scheduleStatus(evidence[c])==='competition_scheduled').map(([c,s])=>s));
 const tier=x=>core.has(x.sport)?0:active.has(x.sport)?1:2;
 q.pending.sort((a,b)=>tier(a)-tier(b)||(attempts.get(a.key)||0)-(attempts.get(b.key)||0));
 const startedAt=new Date().toISOString(),records=[],diagnostics={};
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
   const links=page.getByRole('link',{name,exact:true});
   if(await links.count()!==1||!await links.isVisible()){diagnostics.dashboards[name]={state:'link_not_verified'};continue;}
   const href=await links.getAttribute('href'),u=new URL(href,'https://www.pickfinder.app');
   if(!href||u.origin!=='https://www.pickfinder.app'||!['/games','/discrepancies','/popular'].includes(u.pathname)){diagnostics.dashboards[name]={state:'route_not_verified'};continue;}
   await page.goto(u.href,{timeout:15000});
   await page.waitForFunction(()=>document.body.innerText.split('\n').some(l=>l.trim()==='Premium'),null,{timeout:12000});
   if(!await premium(page))throw Error('session unavailable');
   let tables=0,cards=0,clocks=0;
   const traversal=await traverseDashboard(page,name,{shouldContinue,onSnapshot:async snapshot=>{
    tables+=snapshot.tables.length;cards+=snapshot.cards.length;clocks+=snapshot.clocks.length;
    await persist(root,{schema:'pickfinder-deep-v1',seed:SEED,startedAt,finishedAt:new Date().toISOString(),diagnostics:{},dashboardSnapshots:[snapshot],records:[],modelInputsApproved:false,originalOffersVerified:false});
   }});
   diagnostics.dashboards[name]={...traversal,tables,cards,clocks,controls:await page.evaluate(inventory)};

  }catch{diagnostics.dashboards[name]={state:'unverified'};await page.goto('https://www.pickfinder.app/props',{timeout:20000});await page.getByRole('button',{name:'Open user menu'}).waitFor({timeout:15000});if(!await premium(page).catch(()=>false))throw Error('session unavailable');}
 }
 // Inspect only same-origin read-only navigation links; do not add picks, save alerts or submit forms.
 for(const name of ['Pick Builder','Line Alerts','Alerts']){
  if(!shouldContinue())break;
  try{
   await page.goto('https://www.pickfinder.app/props',{timeout:15000});
   const link=page.getByRole('link',{name,exact:true});
   if(await link.count()!==1||!await link.isVisible()){diagnostics[name]={state:'navigation_not_verified'};continue;}
   const href=await link.getAttribute('href'),u=new URL(href,'https://www.pickfinder.app');
   if(!href||u.origin!=='https://www.pickfinder.app'||!['/pick-builder','/builder','/alerts','/line-alerts'].includes(u.pathname)){diagnostics[name]={state:'route_not_verified'};continue;}
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
 const detail=await context.newPage();detail.setDefaultTimeout(5000);
 for(const item of q.pending.slice(0,limit)){
  if(!shouldContinue())break;
  const row={...item,research:[]};
  try{
   await enrich(detail,row,{maxFields:Infinity,navigate:async url=>{await detail.goto(url,{timeout:10000});await detail.getByRole('button',{name:'Open user menu'}).waitFor({timeout:10000});if(new URL(detail.url()).origin!=='https://www.pickfinder.app'||!await premium(detail))throw Error('session unavailable');}});
   records.push({...item,status:row.research.length?'sampled':'empty',profileCollection:row.profileCollection,research:row.research});
  }catch{records.push({...item,status:'failed',profileCollection:row.profileCollection,research:row.research});}
  await persist(root,{schema:'pickfinder-deep-v1',seed:SEED,startedAt,finishedAt:new Date().toISOString(),diagnostics:{},dashboardSnapshots:[],records:[records.at(-1)],modelInputsApproved:false,originalOffersVerified:false});
  if(!await premium(detail).catch(()=>false))break;
 }
 const finishedAt=new Date().toISOString();
 const data={schema:'pickfinder-deep-v1',seed:SEED,startedAt,finishedAt,diagnostics,dashboardSnapshots:[],records:[],modelInputsApproved:false,originalOffersVerified:false};
 const sha=await persist(root,data);
 const sampled=records.filter(r=>r.status==='sampled').length,complete=records.filter(r=>r.status==='sampled'&&r.profileCollection?.truncated===false).length;
 return {state:'deep_research_verified',sha,queueTotal:q.total,priorSampled:done.size,attempted:records.length,sampled,completeUntruncatedProfiles:complete,remaining:q.pending.length-complete,diagnostics,rawRowsPublished:0,modelInputsApproved:false};
}
module.exports={scope,queue,inventory,run,allBatches,persist,priorDone};
