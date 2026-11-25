'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const relative='research/pickfinder-premium/2026-11-25/manual/browser-pilot-bb60508f.json.gz.b64';
function audit(data){
 const result=[];
 for(const {source:s,normalized:n} of data.partitions){
  let noApps=0,other=0,identity=0,evidenceRetained=0;
  for(const p of s.pages)for(const row of p.rows){
   if(row.sport!==s.sport)continue;
   if(!row.detailId||!row.player||!row.market||!Array.isArray(row.apps)){identity++;continue;}
   if(row.apps.some(a=>a.book===s.book&&Number.isFinite(a.line)&&['Higher','Lower'].includes(a.side)))continue;
   if(!row.apps.length)noApps++;else other++;
   if(Array.isArray(row.appEvidence)&&row.appEvidence.length)evidenceRetained++;
  }
  result.push({book:s.book,sport:s.sport,noApps,other,identity,evidenceRetained,reportedUnresolved:n.health.unresolvedRows});
 }
 return {partitions:result,unresolved:result.reduce((n,r)=>n+r.noApps+r.other+r.identity,0),rawRowsPublished:0,recoveredOffers:0,modelInputsApproved:false};
}
function loadPilot(root){return JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(root,relative),'utf8'),'base64')));}
const key=(book,r)=>JSON.stringify([book,r.sport,r.detailId,r.player,r.market,r.eventId||null,r.period||null,r.mapRange||null,r.gameMode||null]);
const valid=(book,a)=>a&&a.book===book&&Number.isFinite(a.line)&&['Higher','Lower'].includes(a.side)&&typeof a.displayedPrice==='string'&&/^[+-]\d{2,4}$/.test(a.displayedPrice);
function compare(pilot,batches){
 const fresh=new Map();
 for(const b of batches)for(const p of b.pages)for(const r of p.rows){
  if(r.sport!==b.sport||!r.detailId||!r.player||!r.market||!Array.isArray(r.apps))continue;
  const k=key(b.book,r),old=fresh.get(k)||{observed:false,priced:false};
  fresh.set(k,{observed:true,priced:old.priced||r.apps.some(a=>valid(b.book,a))});
 }
 const partitions=[];
 for(const {source:s} of pilot.partitions){
  let historicalUnresolved=0,seenAgain=0,freshExplicitPrice=0,notSeen=0;
  for(const p of s.pages)for(const r of p.rows){
   if(r.sport!==s.sport||!r.detailId||!r.player||!r.market||!Array.isArray(r.apps)||r.apps.length)continue;
   historicalUnresolved++;const m=fresh.get(key(s.book,r));
   if(m){seenAgain++;if(m.priced)freshExplicitPrice++;}else notSeen++;
  }
  if(historicalUnresolved)partitions.push({book:s.book,sport:s.sport,historicalUnresolved,seenAgain,freshExplicitPrice,seenStillUnpriced:seenAgain-freshExplicitPrice,notSeen});
 }
 return {partitions,historicalUnresolved:partitions.reduce((n,p)=>n+p.historicalUnresolved,0),freshExplicitPrice:partitions.reduce((n,p)=>n+p.freshExplicitPrice,0),historicalRecovered:0,rawRowsPublished:0,modelInputsApproved:false};
}
function inputAudit(normalized){
 const output={};
 for(const n of normalized){
  if(!['nba','cs2','valorant','lol','dota2','cod'].includes(n.sport))continue;
  const t=output[n.sport]||={offers:0,explicitPrices:0,eventIds:0,pregameTimestampVerified:0,originalPlatformVerified:0,eligibleForLockedModel:0,researchFields:0,missingResearchValues:0};
  for(const o of n.offers){t.offers++;if(valid(n.book,o))t.explicitPrices++;if(o.eventId)t.eventIds++;if(o.startAt&&Date.parse(o.observedAt)<Date.parse(o.startAt))t.pregameTimestampVerified++;if(o.originalPlatformVerified===true)t.originalPlatformVerified++;if(o.eligibleForLockedModel===true)t.eligibleForLockedModel++;}
  t.researchFields+=n.researchObservations.length;t.missingResearchValues+=n.researchObservations.filter(x=>x.value===null).length;
 }
 return {sports:output,independentIdentityAndResultJoinVerified:false,modelInputsApproved:false,modelPromoted:false,rawRowsPublished:0};
}
module.exports={audit,loadPilot,compare,inputAudit};
if(require.main===module){try{const root=fs.realpathSync(process.argv[2]);const file=path.join(root,relative);const data=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(file,'utf8'),'base64')));console.log(JSON.stringify(audit(data)));}catch{console.error('Private pilot audit failed');process.exitCode=1;}}
