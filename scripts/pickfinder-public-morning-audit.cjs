'use strict';
const {execFileSync}=require('node:child_process'),path=require('node:path'),{ROOT,sha}=require('./pickfinder-public-archive.cjs'),{pacific}=require('./pacific-morning-capture-gate.cjs');
const git=(root,args)=>execFileSync('git',['-C',root,...args],{stdio:['ignore','pipe','pipe'],maxBuffer:32e6,timeout:30000});
const inHour=(at,day,h)=>{try{const x=pacific(at);return x.day===day&&x.hour===h;}catch{return false;}};
function assess({manifest,first,parts,day,slot}){
 const h=Number(slot.slice(0,2)),m=manifest;
 if(m.schema!=='pickfinder-public-normalized-v1'||m.localDay!==day||m.slot!==slot||m.authenticated!==true||m.withinSlot!==true||!inHour(m.firstObservedAt,day,h)||!inHour(m.lastObservedAt,day,h)||Date.parse(m.lastObservedAt)<Date.parse(m.firstObservedAt)||Date.parse(first)<Date.parse(m.lastObservedAt)-999||!inHour(first,day,h)||!Array.isArray(m.partDigests)||new Set(m.partDigests).size!==m.partDigests.length)return 'pending';
 const totals={offers:0,researchObservations:0,unpricedTierObservations:0,sportsbookQuotes:0};
 for(const digest of m.partDigests){const p=parts.get(digest);if(!p||p.doc.sourceDigest!==m.sourceDigest||p.doc.book!==m.book||p.doc.sport!==m.sport||!(p.doc.field in totals)||!Array.isArray(p.doc.rows)||!inHour(p.first,day,h)||Date.parse(p.first)>Date.parse(first))return 'pending';totals[p.doc.field]+=p.doc.rows.length;}
 if(totals.offers!==m.health?.distinctOfferKeys||totals.researchObservations!==m.health?.researchFields||totals.unpricedTierObservations!==m.health?.unpricedTierObservations||totals.sportsbookQuotes!==m.health?.sportsbookQuoteObservations)return 'pending';
 if((m.boardState==='empty'&&m.explicitEmpty||m.boardState==='disabled'&&m.disabledConfirmed)&&m.health.pages===0&&totals.offers===0)return 'verified_empty_or_disabled';
 return m.pageTraversalComplete&&m.health.pages===m.displayedPageCount?'verified_displayed_traversal':'pending';
}
function load(root,kind){
 const dir=ROOT+'/'+kind,files=git(root,['ls-tree','-r','--name-only','HEAD','--',dir]).toString().trim().split('\n').filter(p=>new RegExp('^'+dir+'/[a-f0-9]{64}\\.json$').test(p)),out=new Map();
 for(const rel of files){try{const raw=git(root,['show','HEAD:'+rel]),digest=path.basename(rel,'.json');if(sha(raw)!==digest)continue;const cs=git(root,['log','--format=%H','--',rel]).toString().trim().split('\n');if(cs.length!==1)continue;out.set(digest,{doc:JSON.parse(raw),first:git(root,['show','-s','--format=%cI',cs[0]]).toString().trim()});}catch{}}
 return out;
}
function run(root,day,slot,now=new Date()){
 const h=Number(slot.slice(0,2));if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!['06:00','09:00'].includes(slot))throw Error('slot');
 const t=pacific(now);if(t.day<day||t.day===day&&t.hour<=h)return {state:'slot_not_finished',day,slot};
 const parts=load(root,'board-parts'),boards=load(root,'boards'),results={};
 for(const {doc,first} of boards.values()){if(doc.localDay!==day||doc.slot!==slot)continue;const k=doc.sport+'/'+doc.book,r=results[k]??={verified:0,pending:0,offers:0};const state=assess({manifest:doc,first,parts,day,slot});if(state==='pending')r.pending++;else{r.verified++;r.offers+=doc.health.distinctOfferKeys;}}
 return {state:'public_pickfinder_morning_audit',day,slot,partitions:results,corePartitionsVerified:['nba','nhl','nfl'].every(s=>['prizepicks','underdog'].every(b=>results[s+'/'+b]?.verified>0)),originalPlatformAvailabilityVerified:false,modelApproved:false,privateRepoUsed:false};
}
module.exports={assess,run};
if(require.main===module){try{const day=pacific(new Date()).day;console.log(JSON.stringify(run(process.argv[2],day,process.argv[3])));}catch{console.error('Public archive audit failed closed');process.exitCode=1;}}
