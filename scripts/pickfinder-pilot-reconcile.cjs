'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {registry,contextGate}=require('./season-aware-collection.cjs');
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
  const t=output[n.sport]||={offers:0,explicitPrices:0,eventIds:0,pregameTimestampVerified:0,originalPlatformVerified:0,eligibleForLockedModel:0,researchFields:0,missingResearchValues:0,contextIncompleteOrChanged:0};
  for(const o of n.offers){t.offers++;const code=Object.keys(registry).find(c=>registry[c]===n.sport);if(contextGate(code,null,o.context).needsRevalidation)t.contextIncompleteOrChanged++;if(valid(n.book,o))t.explicitPrices++;if(o.eventId)t.eventIds++;if(o.startAt&&Date.parse(o.observedAt)<Date.parse(o.startAt))t.pregameTimestampVerified++;if(o.originalPlatformVerified===true)t.originalPlatformVerified++;if(o.eligibleForLockedModel===true)t.eligibleForLockedModel++;}
  t.researchFields+=n.researchObservations.length;t.missingResearchValues+=n.researchObservations.filter(x=>x.value===null).length;
 }
 return {sports:output,independentIdentityAndResultJoinVerified:false,modelInputsApproved:false,modelPromoted:false,rawRowsPublished:0};
}
// Evidence classification is not price recovery. Preserve historical observations unchanged.
function missingDisposition(data,batches){
 const historical=audit(data);
 const counts={originalMissingAppEvidence:historical.partitions.reduce((n,p)=>n+p.noApps-p.evidenceRetained,0),historicalPricesRecovered:0,newRows:0,tierOnly:0,missingBook:0,other:0,explicitLineBadgeEvidence:0};
 for(const b of batches)for(const p of b.pages)for(const r of p.rows){
  if(r.sport!==b.sport||!Array.isArray(r.apps)||r.apps.some(a=>valid(b.book,a)))continue;
  counts.newRows++;
  const a=Array.isArray(r.appEvidence)?r.appEvidence:[];
  if(!a.length)counts.missingBook++;
  else if(a.some(e=>e.book===b.book&&['goblin','demon'].includes(e.tier)&&Number.isFinite(e.line)&&Array.isArray(e.icons)&&e.icons.filter(i=>i===b.book).length===1&&e.icons.every(i=>[b.book,'goblin','demon'].includes(i))&&!e.icons.includes(e.tier==='goblin'?'demon':'goblin'))){counts.tierOnly++;counts.explicitLineBadgeEvidence++;}
  else counts.other++;
 }
 return {...counts,pricesInferred:0,sidesInferred:0,modelInputsApproved:false,rawRowsPublished:0};
}
function loadVerifiedAttempt(root,sha){
 const cp=require('node:child_process'),crypto=require('node:crypto');
 const run=args=>cp.execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']});
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('revision');
 run(['merge-base','--is-ancestor',sha,'HEAD']);
 const paths=run(['diff-tree','--no-commit-id','--name-only','-r',sha]).trim().split('\n').filter(p=>/^research\/pickfinder-premium\/2026-11-25\/manual\/[a-z-]+\/[a-z0-9-]+\/[a-z0-9-]+\/source\.json$/.test(p));
 if(paths.length!==28)throw Error('unexpected prior partition count');
 return paths.map(p=>{const raw=run(['show',sha+':'+p]),n=JSON.parse(run(['show',sha+':'+p.replace(/source\.json$/,'normalized.json')]));
 if(crypto.createHash('sha256').update(raw).digest('hex')!==n.sourceDigest)throw Error('digest mismatch');
 return JSON.parse(raw);});
}
module.exports={audit,loadPilot,compare,inputAudit,missingDisposition,loadVerifiedAttempt};
if(require.main===module){try{const root=fs.realpathSync(process.argv[2]);const file=path.join(root,relative);const data=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(file,'utf8'),'base64')));console.log(JSON.stringify(audit(data)));}catch{console.error('Private pilot audit failed');process.exitCode=1;}}
