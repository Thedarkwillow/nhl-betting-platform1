'use strict';
// Archived research only: compare exact aggregator scopes, not independently confirmed quotes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {files,validate}=require('./private-source-history-connections.cjs');
const {immutableMaps}=require('./chronological-player-stat-audit.cjs');
const {evaluate,archiveRows}=require('./independent-chronological-challenger.cjs');
const SEED='aef07d2aecb75388c6757c9cc5844b2113d6a0ac';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const git=(root,args)=>execFileSync('git',['-C',root,...args],{maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']});
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const name=x=>typeof x==='string'?x.normalize('NFC').trim().toLowerCase().replace(/\s+/g,' '):'';
const key=x=>JSON.stringify(x);
function profile(row){
 try{const u=new URL(row.detailId,'https://www.pickfinder.app');const prop=u.searchParams.get('prop')?.split(':');if(u.origin!=='https://www.pickfinder.app'||!u.pathname.startsWith('/players/')||!prop||prop[1]!==row.market||prop[2]!==row.eventId)return null;return u.pathname;}catch{return null;}
}
function audit(batches,nba=[],maps=[]){
 const offers=new Map(),players=new Map(),names=new Map(),sports={};
 const inc=(s,k,n=1)=>{const a=sports[s]??={};a[k]=(a[k]||0)+n;};
 for(const row of nba){if(!Number.isInteger(row.playerId)||!name(row.player))continue;const k=name(row.player),set=names.get(k)||new Set();set.add(row.playerId);names.set(k,set);}
 for(const b of batches)for(const p of b.pages)for(const row of p.rows){
  if(row.sport!==b.sport||!row.eventId||!row.market||!name(row.player)||!profile(row)){inc(b.sport,'invalidScope');continue;}
  const id=profile(row);const playerKey=key([b.sport,id]);if(!players.has(playerKey))players.set(playerKey,{sport:b.sport,id,names:new Set()});players.get(playerKey).names.add(name(row.player));
  for(const a of row.apps||[]){
   if(a.book!==b.book||!Number.isFinite(a.line)||!['Higher','Lower'].includes(a.side)||!(/^[+-]\d{2,4}$/).test(a.displayedPrice||'')||stamp(row.observedAt)===null)continue;
   // Null tier is unknown, not assumed standard. Exact same tier value required; no payout comparisons.
   const scope=key([b.sport,id,row.eventId,row.market,row.period||null,row.mapRange||null,row.gameMode||null,a.line,a.tier||null,a.side]);
   const g=offers.get(scope)||{sport:b.sport,byBook:new Map()};
   const list=g.byBook.get(b.book)||[];list.push({t:stamp(row.observedAt),price:a.displayedPrice});g.byBook.set(b.book,list);offers.set(scope,g);
  }
 }
 for(const g of offers.values()){
  inc(g.sport,'distinctPricedScopes');
  if(g.byBook.size<2)continue;
  inc(g.sport,'crossBookExactScope');
  const a=g.byBook.get('prizepicks')||[],b=g.byBook.get('underdog')||[];
  // Do not call non-simultaneous observations equivalent.
  const near=a.some(x=>b.some(y=>Math.abs(x.t-y.t)<=5*60000));
  if(near)inc(g.sport,'crossBookWithinFiveMinutes');else inc(g.sport,'crossBookClockGap');
 }
 for(const p of players.values()){
  inc(p.sport,'distinctSourceProfiles');
  if(p.names.size!==1){inc(p.sport,'profileLabelConflict');continue;}
  if(p.sport==='nba'){
   const ids=names.get([...p.names][0]);inc(p.sport,ids?.size===1?'uniqueHistoricalNameCandidate':ids?.size>1?'ambiguousHistoricalName':'noHistoricalName');
  }else inc(p.sport,'independentIdentityEvidenceRequired');
 }
 const mapCounts={};for(const m of maps)mapCounts[m.title]=(mapCounts[m.title]||0)+1;
 return {sports,independentMapRowsByTitle:mapCounts,originalPlatformVerified:0,authoritativePlayerLinks:0,pregameVerified:0,modelInputsApproved:false,rawRowsPublished:0,paidRequests:0};
}
function batches(root){
 git(root,['merge-base','--is-ancestor',SEED,'HEAD']);
 const paths=git(root,['diff-tree','--no-commit-id','--name-only','-r',SEED]).toString().trim().split('\n').filter(p=>/^research\/pickfinder-premium\/2026-11-25\/manual\/[a-z-]+\/[a-z0-9-]+\/[a-z0-9-]+\/source\.json$/.test(p));
 if(paths.length!==27)throw Error('seed count');
 return paths.map(p=>{const raw=git(root,['show',SEED+':'+p]),n=JSON.parse(git(root,['show',SEED+':'+p.replace(/source\.json$/,'normalized.json')]));if(hash(raw)!==n.sourceDigest)throw Error('source digest');return JSON.parse(raw);});
}
function nbaHistory(root){
 return files.flatMap(([season,file,sha])=>{const raw=git(root,['show','HEAD:outputs/nba/history/'+season+'/'+file]);validate(raw,season,sha);return JSON.parse(raw).rows;});
}
function main(root){
 const result=audit(batches(root),nbaHistory(root),immutableMaps(root));
 const model=evaluate(archiveRows(root));
 const groups=Object.entries(model.groups).map(([scope,g])=>({scope,training:g.training,calibration:g.calibration,holdout:g.holdout,status:g.status||'evaluated',baselineMAE:g.baseline?.mae??null,challengerMAE:g.challenger?.mae??null,baselineBrier:g.baseline?.brier??null,challengerBrier:g.challenger?.brier??null,interval:g.approxCluster95Interval||null}));
 return {state:'pickfinder_archive_research_audit',seed:SEED,...result,backtest:{sourceRows:model.sourceRows,groups,thresholdType:model.thresholdType,untouched:false,prospective:false,modelPromoted:false}};
}
module.exports={profile,audit,main};
if(require.main===module){try{console.log(JSON.stringify(main(fs.realpathSync(process.argv[2]))));}catch{console.error('Archive comparison/history audit failed closed');process.exitCode=1;}}
