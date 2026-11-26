'use strict';
// Offline, point-in-time research input extraction. No provider calls or model promotion.
const fs=require('node:fs'),path=require('node:path');
const {ROOT,sha}=require('./pickfinder-public-archive.cjs');
const {load,quotes,features,scope,git}=require('./pickfinder-public-evidence-audit.cjs');
const {candidate}=require('./pickfinder-public-history-cache.cjs');
const nativeHistory=require('./pickfinder-native-history-reconciliation.cjs');
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
// Exact archived quote shape counts; no guessing missing book thresholds from fantasy lines.
function quoteInventory(rows){
 const out={observed:0,explicitThreshold:0,missingThreshold:0,missingBook:0,invalidSideOrPrice:0,exactPairs:0,conflictingPairs:0};
 const pairs=new Map();
 for(const q of rows){
  if(['prizepicks','underdog'].includes(q.book))continue;
  out.observed++;
  if(!Number.isFinite(q.quoteLine)||q.quoteLine<0){out.missingThreshold++;continue;}
  out.explicitThreshold++;
  if(!q.book){out.missingBook++;continue;}
  if(!['Higher','Lower'].includes(q.side)||typeof q.price!=='string'||!/^[+-]\d{2,4}$/.test(q.price)||Math.abs(Number(q.price))<100||!valid(q.observedAt)){out.invalidSideOrPrice++;continue;}
  const k=key([scope(q),q.book,q.quoteLine,q.observedAt]),p=pairs.get(k)||{prices:{},conflict:false};
  if(p.prices[q.side]&&p.prices[q.side]!==q.price)p.conflict=true;
  p.prices[q.side]=q.price;pairs.set(k,p);
 }
 for(const p of pairs.values()){if(p.conflict)out.conflictingPairs++;else if(p.prices.Higher&&p.prices.Lower)out.exactPairs++;}
 return out;
}
// Parse explicitly displayed map ordinals only. A source scope is not a native map crosswalk.
function esportsScope(o){
 const title={cs2:'CS2',valorant:'VALORANT',dota2:'DOTA2',lol:'LOL',cod:'COD'}[o.sport];
 if(!title)return null;
 const match=/^((?:maps?_[1-7](?:[_-][1-7])?|[1-7](?:[_-][1-7])?_maps?|1st_[1-7]_maps))_player_(.+)$/.exec(o.market||'');
 if(!match||o.period!=null||o.mapRange!=null&&match[1]!==o.mapRange)return null;
 if(o.mapRange==null){let u;try{u=new URL(o.detailId,'https://www.pickfinder.app');}catch{return null;}const p=u.searchParams.getAll('prop');if(u.origin!=='https://www.pickfinder.app'||!u.pathname.startsWith('/players/')||p.length!==1||p[0].split(':')[1]!==o.market)return null;}
 const first=/^1st_([1-7])_maps$/.exec(match[1]);
 const nums=first?(Number(first[1])===1?[1]:[1,Number(first[1])]):match[1].match(/[1-7]/g).map(Number);
 if(nums.length===2&&nums[0]>=nums[1])return null;
 const maps=nums.length===1?nums:Array.from({length:nums[1]-nums[0]+1},(_,i)=>nums[0]+i);
 const market={kills:'kills',headshots:'headshotKills',headshot_kills:'headshotKills',assists:'assists',deaths:'deaths','kills_+_assists':'killsPlusAssists',creep_score:'creepScore',last_hits:'lastHits'}[match[2]];
 if(!require('../src/esports-research-v1.cjs').TITLES[title].stats.includes(market)||title==='COD'&&!o.gameMode)return null;
 return {title,maps,market,identityReviewed:false,mapScopeReviewed:false,modelApproved:false};
}
function auditBoards(archive,clock){
 const bySport={},history=new Map();let observations=0,quoteMatches=0,featureMatches=0;const quoteEvidence={},esportsEvidence={};
 for(const b of archive.manifests){
  if(!valid(b.first)||dt(b.first)>dt(clock))continue;
  const a=bySport[b.m.sport]??={offers:0,quotes:0,features:0,explicitPregame:0};
  const z=quoteInventory(b.sportsbookQuotes||[]),inv=quoteEvidence[b.m.sport]??={};for(const [k,v] of Object.entries(z))inv[k]=(inv[k]||0)+v;
  const q=new Map(),f=new Map();
  for(const x of b.sportsbookQuotes||[]){const k=scope(x),v=q.get(k)||[];v.push(x);q.set(k,v);}
  for(const x of b.researchObservations||[]){const k=key([x.detailId,x.eventId,x.market,x.observedAt]),v=f.get(k)||[];v.push(x);f.set(k,v);}
  for(const o of b.offers||[]){
   if(!o.detailId||!o.eventId||!Number.isFinite(o.line)||!valid(o.observedAt)||dt(o.observedAt)>dt(b.first)+999)continue;
   observations++;a.offers++;
   if(['cs2','valorant','dota2','lol','cod'].includes(o.sport)){const e=esportsEvidence[o.sport]??={offerObservations:0,explicitSupportedScopes:0,unresolvedScopes:0,qualifiedModelInputs:0,unresolvedMarketSlugs:{}};e.offerObservations++;if(esportsScope(o))e.explicitSupportedScopes++;else {e.unresolvedScopes++;const slug=/^[a-z0-9_+ -]{1,100}$/i.test(o.market||'')?o.market:'other';const k=Object.hasOwn(e.unresolvedMarketSlugs,slug)||Object.keys(e.unresolvedMarketSlugs).length<30?slug:'other';e.unresolvedMarketSlugs[k]=(e.unresolvedMarketSlugs[k]||0)+1;}}
   // Archive availability gates eligibility; quote freshness is relative to the offer observation.
   // A later quote in the same manifest must never enter an earlier offer's feature set.
   const cut=b.first,bs=quotes(o,q.get(scope(o))||[],new Date(Math.min(dt(cut),dt(o.observedAt))).toISOString()),fs=features(o,f.get(key([o.detailId,o.eventId,o.market,o.observedAt]))||[]);
   if(bs.length){quoteMatches++;a.quotes++;}
   if(Object.keys(fs).length){featureMatches++;a.features++;}
   const pregame=valid(o.startAt)&&dt(cut)+900000<dt(o.startAt);
   if(pregame)a.explicitPregame++;
   const k=key([scope(o),o.book,o.side,o.tier??null,o.line,o.observedAt]);
   if(!history.has(k))history.set(k,{offer:o,manifestDigest:b.digest,archiveFirst:cut,features:fs,quotes:bs,explicitPregame:pregame,originalPlatformVerified:false,modelApproved:false});
  }
 }
 return {summary:{observations,distinctObservations:history.size,quoteMatches,featureMatches,bySport,quoteEvidence,esportsEvidence},history};
}
function* committedProfiles(root){
 const dir=ROOT+'/profiles';
 for(const rel of git(root,['ls-tree','-r','--name-only','HEAD','--',dir]).split('\n')){
  const digest=path.basename(rel,'.json');if(!/^[a-f0-9]{64}$/.test(digest))continue;
  const raw=fs.readFileSync(path.join(root,rel));if(sha(raw)!==digest||git(root,['status','--porcelain','--',rel]))throw Error('profile archive integrity');
  const commits=git(root,['log','--format=%H','--',rel]).split('\n');
  if(commits.length!==1||! /^[a-f0-9]{40}$/.test(commits[0]))throw Error('profile archive not immutable');
  const first=git(root,['show','-s','--format=%cI',commits[0]]);
  if(!valid(first))throw Error('profile archive clock');
  yield {doc:JSON.parse(raw),digest,first};
 }
}
// The packet is an inspection artifact, not a review receipt. It contains
// only already-authorized sporting facts and pointers to their immutable archives.
// Group exact provider series/player/market scopes for independent esports review.
function esportsReviewQueue(history){
 const groups=new Map();
 for(const x of history.values()){
  const o=x.offer,e=esportsScope(o);if(!e||!o.eventId||!o.player||!o.detailId)continue;
  let u;try{u=new URL(o.detailId,'https://www.pickfinder.app');}catch{continue;}
  if(u.origin!=='https://www.pickfinder.app'||!u.pathname.startsWith('/players/'))continue;
  const k=key([o.sport,o.eventId,u.pathname,o.player,e.market,e.maps,o.gameMode??null]),g=groups.get(k)||{sport:o.sport,title:e.title,sourceEventId:o.eventId,profilePath:u.pathname,sourcePlayer:o.player,market:e.market,maps:e.maps,gameMode:o.gameMode??null,offerObservations:0,manifestDigests:new Set(),independentReviewVerified:false,modelApproved:false};
  g.offerObservations++;g.manifestDigests.add(x.manifestDigest);groups.set(k,g);
 }
 return [...groups.values()].map(x=>({...x,manifestDigests:[...x.manifestDigests].sort()}));
}
function reviewPacket(h,clock,boards=null){
 const by=new Map();
 for(const x of h.rows.values()){
  const p=nativeHistory.profilePath(x.sport,x.sourceDetailId);if(!p)continue;
  const k=key([x.sport,p,x.playerId]),a=by.get(k)||new Map();
  const fact=key([x.eventId,x.market,x.value,x.nativeDigest,x.profileDigest]);
  if(!a.has(fact))a.set(fact,{eventId:x.eventId,market:x.market,value:x.value,officialStartAt:x.officialStartAt,officialGameDate:x.officialGameDate,sourceDate:x.sourceDate,nativeDigest:x.nativeDigest,profileDigest:x.profileDigest,nativeAvailableAt:x.nativeAvailableAt,profileAvailableAt:x.profileAvailableAt});
  by.set(k,a);
 }
 return {kind:'pickfinder_historical_identity_review_packet_v1',generatedAt:clock,rows:h.identityCandidates.map(c=>({...c,facts:[...(by.get(key([c.sport,c.profilePath,c.nativePlayerId]))||new Map()).values()],independentReviewVerified:false})),esportsScopes:boards?esportsReviewQueue(boards.history):[],modelApproved:false,reviewReceipt:false};
}
function run(root,clock=new Date().toISOString(),{packetPath=null}={}){
 const p=auditProfiles(committedProfiles(root),clock),b=auditBoards(load(root),clock),h=nativeHistory.fromArchive(root,committedProfiles(root),clock);
 if(packetPath)fs.writeFileSync(packetPath,JSON.stringify(reviewPacket(h,clock,b),null,2)+'\n',{flag:'wx'});
 return {kind:'pickfinder_archived_model_input_audit_v1',generatedAt:clock,profiles:p.summary,boards:b.summary,nativeHistory:h.summary,modelApproved:false,paidRequests:0,requestsSkipped:0,rawRowsPublished:0};
}
module.exports={classify,auditProfiles,auditBoards,quoteInventory,esportsScope,committedProfiles,reviewPacket,esportsReviewQueue,run};
if(require.main===module)console.log(JSON.stringify(run(process.cwd(),new Date().toISOString(),{packetPath:process.argv[2]||null})));
