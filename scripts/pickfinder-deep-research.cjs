'use strict';
// Separate, bounded post-snapshot research. Never represents a new pregame offer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const SEED='aef07d2aecb75388c6757c9cc5844b2113d6a0ac';
const ROOT='research/pickfinder-premium-deep';
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
function priorDone(root){
 const done=new Set(),files=git(root,['ls-tree','-r','--name-only','HEAD','--',ROOT+'/'+SEED]).toString().trim().split('\n').filter(x=>x.endsWith('/research.json'));
 for(const file of files){const b=JSON.parse(git(root,['show','HEAD:'+file]));if(b.seed!==SEED||b.schema!=='pickfinder-deep-v1')throw Error('checkpoint contract');for(const r of b.records)if(r.status==='sampled'&&r.research?.length&&/^[a-f0-9]{64}$/.test(r.key))done.add(r.key);}
 return done;
}
function inventory(){
 const visible=e=>e.getClientRects().length>0;
 const names=['Games','Discrepancies','Popular','Pick Builder','Alerts','Line Alerts','Date','Game','Market','Sport','Apps','Modifiers','Newest','Dota 2','DOTA2','Soccer','SOCCER'];
 const controls=[...document.querySelectorAll('button,a,[role=tab]')].filter(visible);
 return Object.fromEntries(names.map(n=>[n,controls.filter(e=>{const v=(e.getAttribute('aria-label')||e.innerText||'').trim();return v===n||v.startsWith(n+' ');}).length]));
}
async function run({root,context,page,enrich,collect,limit=20,shouldContinue=()=>true}){
 if(!Number.isInteger(limit)||limit<1||limit>40)throw Error('profile budget');
 const done=priorDone(root),q=queue(seedBatches(root),done);
 const startedAt=new Date().toISOString(),records=[],diagnostics={};
 const premium=async p=>p.evaluate(()=>document.body.innerText.split('\n').some(l=>l.trim()==='Premium')&&!!document.querySelector('button[aria-label="Open user menu"]'));
 diagnostics.controls=await page.evaluate(inventory);
 // Only follow uniquely visible same-origin read-only dashboard anchors. Builder and alerts are inventory-only.
 diagnostics.dashboards={};
 for(const name of ['Games','Discrepancies','Popular']){
  if(!shouldContinue())break;
  try{
   await page.goto('https://www.pickfinder.app/props',{timeout:15000});
   const links=page.getByRole('link',{name,exact:true});
   if(await links.count()!==1||!await links.isVisible()){diagnostics.dashboards[name]={state:'link_not_verified'};continue;}
   const href=await links.getAttribute('href'),u=new URL(href,'https://www.pickfinder.app');
   if(!href||u.origin!=='https://www.pickfinder.app'||!['/games','/discrepancies','/popular'].includes(u.pathname)){diagnostics.dashboards[name]={state:'route_not_verified'};continue;}
   await page.goto(u.href,{timeout:15000});
   if(!await premium(page))throw Error('session unavailable');
   diagnostics.dashboards[name]={state:'visible_route',controls:await page.evaluate(inventory)};
  }catch{diagnostics.dashboards[name]={state:'unverified'};if(!await premium(page).catch(()=>false))throw Error('session unavailable');}
 }
 for(const code of ['DOTA2','SOCCER']){
  if(!shouldContinue())break;
  try{await page.goto('https://www.pickfinder.app/props',{timeout:20000});
   const b=await collect(page,{book:'prizepicks',code,maxPages:1,shouldContinue});
   diagnostics[code]={state:b.boardState,pages:b.pages.length,displayedPages:b.displayedPageCount||null,failure:b.failure||null,controls:await page.evaluate(inventory)};
  }catch{diagnostics[code]={state:'failed',controls:await page.evaluate(inventory).catch(()=>null)};}
  if(!await premium(page))throw Error('session unavailable');
 }
 const detail=await context.newPage();detail.setDefaultTimeout(5000);
 for(const item of q.pending.slice(0,limit)){
  if(!shouldContinue())break;
  const row={...item,research:[]};
  try{
   await enrich(detail,row,{maxFields:2000,navigate:async url=>{await detail.goto(url,{timeout:10000});if(new URL(detail.url()).origin!=='https://www.pickfinder.app'||!await premium(detail))throw Error('session unavailable');}});
   records.push({...item,status:row.research.length?'sampled':'empty',profileCollection:row.profileCollection,research:row.research});
  }catch{records.push({...item,status:'failed',research:[]});if(!await premium(detail).catch(()=>false))break;}
 }
 const finishedAt=new Date().toISOString(),id=crypto.randomUUID(),prefix=ROOT+'/'+SEED+'/'+id;
 const data={schema:'pickfinder-deep-v1',seed:SEED,startedAt,finishedAt,diagnostics,records,modelInputsApproved:false,originalOffersVerified:false};
 const target=path.join(root,prefix);
 fs.mkdirSync(target,{recursive:true,mode:0o700});
 const file=prefix+'/research.json',raw=JSON.stringify(data);
 fs.writeFileSync(path.join(root,file),raw,{flag:'wx',mode:0o600});
 git(root,['add','--',file]);const staged=git(root,['diff','--cached','--name-status']).toString().trim();
 if(staged!=='A\t'+file)throw Error('append-only research required');
 git(root,['-c','user.name=PickFinder research runner','-c','user.email=research-runner@users.noreply.github.com','commit','-m','Archive bounded PickFinder deep research']);
 const sha=git(root,['rev-parse','HEAD']).toString().trim();
 git(root,['push','origin','HEAD:refs/heads/main']);git(root,['fetch','origin','main']);git(root,['merge-base','--is-ancestor',sha,'FETCH_HEAD']);
 if(hash(git(root,['show','FETCH_HEAD:'+file]))!==hash(raw))throw Error('deep archive digest mismatch');
 const sampled=records.filter(r=>r.status==='sampled').length;
 return {state:'deep_research_verified',sha,queueTotal:q.total,priorSampled:done.size,attempted:records.length,sampled,remaining:q.pending.length-sampled,diagnostics,rawRowsPublished:0,modelInputsApproved:false};
}
module.exports={scope,queue,inventory,run};
