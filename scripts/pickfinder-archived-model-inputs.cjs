'use strict';
// Offline, point-in-time research input extraction. No provider calls or model promotion.
const fs=require('node:fs'),path=require('node:path');
const {ROOT,sha}=require('./pickfinder-public-archive.cjs');
const {load,quotes,features,scope,git}=require('./pickfinder-public-evidence-audit.cjs');
const {candidate}=require('./pickfinder-public-history-cache.cjs');
const dt=Date.parse, valid=x=>Number.isFinite(dt(x)), key=x=>JSON.stringify(x);
function classify(f){
 if(f.origin==='prop_history')return 'historical_prop';
 if(f.origin==='line_movement')return 'line_movement';
 const s=[f.tab,f.scope,f.metric].join(' ').toLowerCase();
 if(/injur|depth chart|lineup|availability|minutes|workload/.test(s))return 'availability_workload';
 if(/game log|historical stats|player stats/.test(s))return 'game_logs';
 if(/map|agent|champion|hero|mode|round/.test(s))return 'esports_scope';
 if(/split|home|away|matchup|opponent|defense|h2h/.test(s))return 'matchup_splits';
 return 'other_profile';
}
function auditProfiles(documents,clock){
 const bySport={},cache=new Map();let records=0,fields=0,invalid=0;
 for(const {doc,digest} of documents)for(const r of doc.records||[]){
  records++;const a=bySport[r.sport]??={records:0,fields:0,observed:{},cacheCandidates:0};a.records++;
  for(const f of r.research||[]){fields++;a.fields++;
   if(!valid(f.observedAt)||dt(f.observedAt)>dt(clock)){invalid++;continue;}
   const k=classify(f);a.observed[k]=(a.observed[k]||0)+1;
   const c=candidate(r,f,new Date(clock));if(!c)continue;a.cacheCandidates++;
   const old=cache.get(c.key);if(!old)cache.set(c.key,{digest:c.digest,sourceDigest:digest,field:f,conflict:false});else if(old.digest!==c.digest)old.conflict=true;
  }
 }
 return {summary:{records,fields,invalid,bySport,cacheKeys:cache.size,usableCacheKeys:[...cache.values()].filter(x=>!x.conflict).length,conflictedCacheKeys:[...cache.values()].filter(x=>x.conflict).length},cache};
}
function auditBoards(archive,clock){
 const bySport={},history=new Map();let observations=0,quoteMatches=0,featureMatches=0;
 for(const b of archive.manifests){
  if(!valid(b.first)||dt(b.first)>dt(clock))continue;
  const a=bySport[b.m.sport]??={offers:0,quotes:0,features:0,explicitPregame:0};
  const q=new Map(),f=new Map();
  for(const x of b.sportsbookQuotes||[]){const k=scope(x),v=q.get(k)||[];v.push(x);q.set(k,v);}
  for(const x of b.researchObservations||[]){const k=key([x.detailId,x.eventId,x.market,x.observedAt]),v=f.get(k)||[];v.push(x);f.set(k,v);}
  for(const o of b.offers||[]){
   if(!o.detailId||!o.eventId||!Number.isFinite(o.line)||!valid(o.observedAt)||dt(o.observedAt)>dt(b.first)+999)continue;
   observations++;a.offers++;
   // Use archive availability clock, not a later observation, for retrospective comparisons.
   const cut=b.first,bs=quotes(o,q.get(scope(o))||[],cut),fs=features(o,f.get(key([o.detailId,o.eventId,o.market,o.observedAt]))||[]);
   if(bs.length){quoteMatches++;a.quotes++;}
   if(Object.keys(fs).length){featureMatches++;a.features++;}
   const pregame=valid(o.startAt)&&dt(cut)+900000<dt(o.startAt);
   if(pregame)a.explicitPregame++;
   const k=key([scope(o),o.book,o.side,o.tier??null,o.line,o.observedAt]);
   if(!history.has(k))history.set(k,{offer:o,manifestDigest:b.digest,archiveFirst:cut,features:fs,quotes:bs,explicitPregame:pregame,originalPlatformVerified:false,modelApproved:false});
  }
 }
 return {summary:{observations,distinctObservations:history.size,quoteMatches,featureMatches,bySport},history};
}
function* committedProfiles(root){
 const dir=ROOT+'/profiles';
 for(const rel of git(root,['ls-tree','-r','--name-only','HEAD','--',dir]).split('\n')){
  const digest=path.basename(rel,'.json');if(!/^[a-f0-9]{64}$/.test(digest))continue;
  const raw=fs.readFileSync(path.join(root,rel));if(sha(raw)!==digest||git(root,['status','--porcelain','--',rel]))throw Error('profile archive integrity');
  yield {doc:JSON.parse(raw),digest};
 }
}
function run(root,clock=new Date().toISOString()){
 const p=auditProfiles(committedProfiles(root),clock),b=auditBoards(load(root),clock);
 return {kind:'pickfinder_archived_model_input_audit_v1',generatedAt:clock,profiles:p.summary,boards:b.summary,modelApproved:false,paidRequests:0,requestsSkipped:0,rawRowsPublished:0};
}
module.exports={classify,auditProfiles,auditBoards,run};
if(require.main===module)console.log(JSON.stringify(run(process.cwd())));
