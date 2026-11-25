'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{ROOT,sha}=require('./pickfinder-public-archive.cjs');
const {VERSION}=require('./pickfinder-research-coverage.cjs');
const dt=Date.parse, key=x=>JSON.stringify(x), valid=x=>Number.isFinite(dt(x));
const fields={offers:'distinctOfferKeys',researchObservations:'researchFields',unpricedTierObservations:'unpricedTierObservations',sportsbookQuotes:'sportsbookQuoteObservations'};
const git=(root,args)=>execFileSync('git',['-C',root,...args],{stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:128e6}).toString().trim();
function read(root,kind,digest){
 if(!/^[a-f0-9]{64}$/.test(digest))throw Error('digest');
 const rel=ROOT+'/'+kind+'/'+digest+'.json',p=path.join(root,rel),st=fs.lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.size>8e6)throw Error('file');
 const b=fs.readFileSync(p);if(sha(b)!==digest)throw Error('bytes');return JSON.parse(b);
}
function list(root,kind){
 const d=path.join(root,ROOT,kind);if(!fs.existsSync(d))return [];
 return fs.readdirSync(d).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(n=>n.slice(0,-5));
}
function load(root){
 const manifests=[],invalid=[],latest=new Map();
 for(const digest of list(root,'boards'))try{
  const m=read(root,'boards',digest);
  if(m.schema!=='pickfinder-public-normalized-v1'||!['prizepicks','underdog'].includes(m.book)||!valid(m.firstObservedAt)||!valid(m.lastObservedAt)||dt(m.firstObservedAt)>dt(m.lastObservedAt)||m.authenticated!==true||!Array.isArray(m.partDigests)||new Set(m.partDigests).size!==m.partDigests.length)throw Error('manifest');
  const rows={offers:[],researchObservations:[],unpricedTierObservations:[],sportsbookQuotes:[]};
  for(const p of m.partDigests){const x=read(root,'board-parts',p);if(x.schema!=='pickfinder-public-board-part-v1'||x.sourceDigest!==m.sourceDigest||x.sport!==m.sport||x.book!==m.book||!(x.field in fields)||!Array.isArray(x.rows))throw Error('part');rows[x.field].push(...x.rows);}
  for(const [f,k] of Object.entries(fields))if(rows[f].length!==m.health?.[k])throw Error('count');
  const entry={digest,m,...rows};manifests.push(entry);
  const k=m.sport+'/'+m.book,old=latest.get(k);if(!old||dt(old.m.lastObservedAt)<dt(m.lastObservedAt))latest.set(k,entry);
 }catch{invalid.push(digest);}
 return {manifests,latest:[...latest.values()],invalid};
}
function scope(r){return key([r.sport,r.detailId,r.eventId,r.market,r.period??null,r.mapRange??null,r.gameMode??null]);}
const price=v=>typeof v==='string'&&/^[+-]\d{2,4}$/.test(v)&&Math.abs(Number(v))>=100;
const implied=p=>Number(p)>0?100/(100+Number(p)):-Number(p)/(100-Number(p));
function quotes(offer,rows,cut,maxAge=300000){
 const by=new Map();for(const q of rows){
  if(!q.book||['prizepicks','underdog'].includes(q.book)||scope(q)!==scope(offer)||q.quoteLine!==offer.line||!price(q.price)||!['Higher','Lower'].includes(q.side)||!valid(q.observedAt)||dt(q.observedAt)>dt(cut)||dt(cut)-dt(q.observedAt)>maxAge)continue;
  const k=key([q.book,q.observedAt]),a=by.get(k)||{book:q.book,observedAt:q.observedAt,p:{},conflict:false};
  if(a.p[q.side]&&a.p[q.side]!==q.price)a.conflict=true;a.p[q.side]=q.price;by.set(k,a);
 }
 const result=new Map();for(const a of by.values())if(!a.conflict&&a.p.Higher&&a.p.Lower){const old=result.get(a.book);if(!old||dt(old.observedAt)<dt(a.observedAt))result.set(a.book,{book:a.book,observedAt:a.observedAt,higher:implied(a.p.Higher)/(implied(a.p.Higher)+implied(a.p.Lower))});}
 return [...result.values()];
}
function features(offer,rows){
 const out={},conflicts=new Set();for(const r of rows){
  if(scope({...r,period:offer.period,mapRange:offer.mapRange,gameMode:offer.gameMode})!==scope(offer)||r.origin!=='board'||r.observedAt!==offer.observedAt)continue;
  const name=r.metric;if(!['L5','L10','L15','SZN','H2H','Avg L10'].includes(name)||typeof r.value!=='string')continue;
  const m=name==='Avg L10'?r.value.match(/^\d+(?:\.\d+)?$/):r.value.match(/^(\d+(?:\.\d+)?)%(?:\n(\d+)\/(\d+))?$/);if(!m)continue;
  const value=Number(m[1]??m[0])/(name==='Avg L10'?1:100);if(!Number.isFinite(value)||value<0||name!=='Avg L10'&&value>1)continue;
  if(m[2]&&(!Number(m[3])||Number(m[2])>Number(m[3])||Math.abs(Number(m[2])/Number(m[3])-value)>.011))continue;
  if(name in out&&out[name]!==value)conflicts.add(name);out[name]=value;
 }
 for(const k of conflicts)delete out[k];return out;
}
function analyze(archive,now=new Date().toISOString()){
 const bySport={},comp=new Map(),events=new Map(),featureRows=[];let offerRefs=0,exactComparisons=0;
 for(const a of archive.latest){
  const m=a.m,s=m.sport,x=bySport[s]??={boards:{},offers:0,unresolved:0,unpricedGoblin:0,unpricedDemon:0,quotedSportsbooks:0,explicitThresholdQuotes:0,matchedTwoSidedQuotes:0,boardFeatureRows:0,missingStartAt:0,sourceEvents:0,exactCrossBookRows:0};
  x.boards[m.book]={state:m.boardState,pages:m.health.pages,displayedPages:m.displayedPageCount,offers:m.health.distinctOfferKeys,unresolved:m.health.unresolvedRows,observedAt:m.lastObservedAt,slot:m.slot,traversal:m.pageTraversalComplete};
  x.offers+=a.offers.length;x.unresolved+=m.health.unresolvedRows;
  x.unpricedGoblin+=a.unpricedTierObservations.filter(o=>o.tier==='goblin').length;x.unpricedDemon+=a.unpricedTierObservations.filter(o=>o.tier==='demon').length;
  x.quotedSportsbooks+=a.sportsbookQuotes.filter(q=>q.book&&!['prizepicks','underdog'].includes(q.book)).length;
  x.explicitThresholdQuotes+=a.sportsbookQuotes.filter(q=>q.book&&!['prizepicks','underdog'].includes(q.book)&&Number.isFinite(q.quoteLine)).length;
  const q=new Map(),f=new Map();for(const row of a.sportsbookQuotes){const k=scope(row),v=q.get(k)||[];v.push(row);q.set(k,v);}
  for(const row of a.researchObservations){const k=key([row.detailId,row.eventId,row.market,row.observedAt]),v=f.get(k)||[];v.push(row);f.set(k,v);}
  for(const o of a.offers){
   if(!o.eventId||!o.detailId||!Number.isFinite(o.line)||!valid(o.observedAt))continue;offerRefs++;
   if(!valid(o.startAt))x.missingStartAt++;
   const ek=key([s,o.eventId]);if(!events.has(ek))events.set(ek,{sport:s,sourceEventId:o.eventId,players:new Set()});events.get(ek).players.add(o.player);
   const k=key([scope(o),o.line,o.tier??null,o.side]),v=comp.get(k)||new Map();const old=v.get(o.book);if(!old||dt(old.observedAt)<dt(o.observedAt))v.set(o.book,o);comp.set(k,v);
   const b=features(o,f.get(key([o.detailId,o.eventId,o.market,o.observedAt]))||[]),c=quotes(o,q.get(scope(o))||[],m.lastObservedAt);
   if(c.length)x.matchedTwoSidedQuotes++;if(Object.keys(b).length)x.boardFeatureRows++;
   if(Object.keys(b).length||c.length)featureRows.push({offer:o,manifestDigest:a.digest,features:b,quotes:c});
  }
 }
 for(const v of comp.values())if(v.size===2){const a=v.get('prizepicks'),b=v.get('underdog');if(Math.abs(dt(a.observedAt)-dt(b.observedAt))<=900000){exactComparisons++;bySport[a.sport].exactCrossBookRows++;}}
 for(const e of events.values())bySport[e.sport].sourceEvents++;
 return {summary:{schema:'pickfinder_public_research_health_v1',generatedAt:now,archiveManifests:archive.manifests.length,invalidManifests:archive.invalid.length,latestPartitions:archive.latest.length,offerRefs,exactComparisons,bySport,originalPlatformVerified:false,modelApproved:false,paidRequests:0,privateRepoUsed:false},featureRows,events:[...events.values()].map(e=>({...e,players:[...e.players]}))};
}
function coverage(root){
 const profiles=list(root,'profiles').flatMap(d=>read(root,'profiles',d).records||[]),dashboards=list(root,'dashboards').map(d=>read(root,'dashboards',d));
 const done=new Set(profiles.filter(r=>r.status==='sampled'&&r.coverageVersion===VERSION&&!r.truncated&&r.research?.length).map(r=>r.key));
 const byDashboard={};for(const d of dashboards)byDashboard[d.name]=(byDashboard[d.name]||0)+1;
 return {profileAttempts:profiles.length,uniqueCompletedCurrentVersion:done.size,dashboardSnapshots:dashboards.length,byDashboard,allFiltersVerified:false};
}
module.exports={load,analyze,coverage,features,quotes,scope,read,list,git};
