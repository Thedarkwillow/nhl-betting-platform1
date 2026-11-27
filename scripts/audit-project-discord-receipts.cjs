'use strict';
// Counts-only offline replay. Never calls Discord, a provider, or Git remote.
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {compare,sports,books}=require('./project-discord-line-alerts.cjs');
const BASE='research/pickfinder-public-v1/';
const sha=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const revision=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const bound=(o,k)=>Object.hasOwn(o,k);
const dt=Date.parse;
const kinds=new Set(['new_prop','alternate_tier','reposted_prop','line_change','price_change','removed_prop','discrepancy']);

function reconcile(events,ledger,clock){
 if(!Number.isSafeInteger(clock)||clock<=0||!ledger||Object.getPrototypeOf(ledger)!==Object.prototype)throw Error('receipt input');
 const ids=new Set();
 for(const [key,v] of Object.entries(ledger)){
  if(!digest(key)||!v||!Number.isSafeInteger(v.at)||!['reserved','confirmed'].includes(v.state)||v.state==='confirmed'&&!digest(v.proof))throw Error('ledger shape');
  if(v.at===clock&&v.state==='confirmed')ids.add(key);
 }
 const confirmations=ids.size,counts={};
 for(const e of events){
  if(!kinds.has(e.kind)||!sports.has(e.sport)||!Array.isArray(e.books)||e.books.length<1||e.books.length>2||
     new Set(e.books).size!==e.books.length||!e.books.every(x=>books.has(x)))continue;
  if(!ids.delete(e.id))continue;
  const k=[...e.books].sort().join('+')+'/'+e.sport+'/'+e.kind;
  counts[k]=(counts[k]||0)+1;
 }
 return {confirmations,matched:confirmations-ids.size,unmatched:ids.size,counts};
}
function run(root,archiveRevision,ledgerRevision,clock,lookbackMinutes=240){
 if(!revision(archiveRevision)||!revision(ledgerRevision)||!Number.isSafeInteger(clock)||clock<=0||
    !Number.isSafeInteger(lookbackMinutes)||lookbackMinutes<1||lookbackMinutes>720)throw Error('input');
 const git=(...args)=>execFileSync('git',['-C',root,...args],{maxBuffer:16e6,timeout:15000,stdio:['ignore','pipe','pipe']});
 const raw=(rev,file)=>git('show',rev+':'+file);
 // If a historical release algorithm differs, do not replay it with today's code.
 for(const f of ['project-discord-line-alerts.cjs','pickfinder-local-line-alerts.cjs']){
  if(!fs.readFileSync(path.join(__dirname,f)).equals(raw(archiveRevision,'scripts/'+f)))throw Error('historical algorithm mismatch');
 }
 const read=(kind,key)=>{
  if(!digest(key))throw Error('archive digest');
  const b=raw(archiveRevision,BASE+kind+'/'+key+'.json');
  if(sha(b)!==key)throw Error('archive bytes');
  return JSON.parse(b);
 };
 const counts={offers:'distinctOfferKeys',unpricedTierObservations:'unpricedTierObservations',
  researchObservations:'researchFields',sportsbookQuotes:'sportsbookQuoteObservations'};
 const paths=git('ls-tree','-r','--name-only',archiveRevision,'--',BASE+'boards/').toString().trim().split('\n').filter(Boolean);
 const entries=[];
 for(const f of paths){
  if(!/^research\/pickfinder-public-v1\/boards\/[a-f0-9]{64}\.json$/.test(f))throw Error('archive path');
  const key=path.basename(f,'.json'),m=read('boards',key),delta=clock-dt(m.lastObservedAt);
  if(delta<0||delta>20*3600000||m.samplingPurpose==='displayed_game_clock')continue;
  if(m.schema!=='pickfinder-public-normalized-v1'||!sports.has(m.sport)||!books.has(m.book)||
     m.authenticated!==true||!Number.isFinite(delta)||!Number.isFinite(dt(m.firstObservedAt))||dt(m.firstObservedAt)>dt(m.lastObservedAt)||
     !Array.isArray(m.partDigests)||new Set(m.partDigests).size!==m.partDigests.length)throw Error('archive manifest');
  const commits=git('log','--format=%H',archiveRevision,'--',f).toString().trim().split('\n');
  if(commits.length!==1||!revision(commits[0]))throw Error('mutable manifest');
  const first=git('show','-s','--format=%cI',commits[0]).toString().trim();
  if(!Number.isFinite(dt(first))||dt(first)+999<dt(m.lastObservedAt))throw Error('archive clock');
  const rows=Object.fromEntries(Object.keys(counts).map(k=>[k,0]));
  const entry={m,first,digest:key,offers:[],unpricedTierObservations:[]};
  for(const p of m.partDigests){
   const d=read('board-parts',p);
   if(d.schema!=='pickfinder-public-board-part-v1'||d.sport!==m.sport||d.book!==m.book||
      d.sourceDigest!==m.sourceDigest||!bound(rows,d.field)||!Array.isArray(d.rows))throw Error('archive part');
   rows[d.field]+=d.rows.length;if(bound(entry,d.field))entry[d.field].push(...d.rows);
  }
  if(Object.entries(counts).some(([k,expected])=>rows[k]!==m.health?.[expected]))throw Error('archive row counts');
  entries.push({entry});
 }
 const registry=JSON.parse(raw(archiveRevision,'data/pickfinder-current-identity-registry.json'));
 const result=compare(entries,clock,{registry,windowMs:lookbackMinutes*60000});
 const ledger=JSON.parse(raw(ledgerRevision,'receipts.json'));
 return {kind:'offline_project_discord_board_receipt_replay_v1',archiveRevision,ledgerRevision,
  decisionAt:new Date(clock).toISOString(),lookbackMinutes,boardsChecked:entries.length,
  ...reconcile(result.events,ledger,clock),paidRequests:0,dispatches:0,rawReceiptsPublished:0};
}
module.exports={reconcile,run};
if(require.main===module)try{
 const [root,archive,ledger,clock,lookback]=process.argv.slice(2);
 if(!/^\d{13}$/.test(clock||'')||lookback!==undefined&&!/^\d{1,3}$/.test(lookback))throw Error('arguments');
 const out=run(root,archive,ledger,Number(clock),lookback===undefined?240:Number(lookback));
 console.log(JSON.stringify(out));
 if(!out.confirmations||out.unmatched)process.exitCode=1;
}catch{console.error('Discord board receipt replay withheld. Check pinned revisions, clock, lookback and byte integrity.');process.exitCode=1;}
