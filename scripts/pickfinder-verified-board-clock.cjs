'use strict';
// Registry is an index, never authority. Rebuild each requested event from its
// original three controlled timezone receipts and official schedule/roster.
const {git}=require('./pickfinder-public-evidence-audit.cjs');
const {sha}=require('./pickfinder-public-archive.cjs');
const {replay}=require('./pickfinder-durable-identities.cjs');
const {target}=require('./pickfinder-public-nba-context.cjs');
const dt=Date.parse, hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const key=(...x)=>JSON.stringify(x), indexPath='data/pickfinder-current-identity-registry.json';
const identity='research/pickfinder-public-identity-v1/native-facts/';
function immutable(root,rel,digest){
 if(!hash(digest))return null;
 try{
  const commits=git(root,['log','--format=%H','--',rel]).split('\n');
  if(commits.length!==1||!/^[a-f0-9]{40}$/.test(commits[0]))return null;
  const raw=require('node:child_process').execFileSync('git',['-C',root,'show',commits[0]+':'+rel],{maxBuffer:8e6,timeout:12000});
  if(sha(raw)!==digest)return null;
  return {doc:JSON.parse(raw),digest,first:git(root,['show','-s','--format=%cI',commits[0]])};
 }catch{return null;}
}
function plan(o,proof){
 if(!proof||o.eventId!==proof.sourceEventId||o.sport!==proof.sport||dt(proof.proofAvailableAt)>dt(o.observedAt)||
  !Number.isFinite(dt(o.observedAt))||!target(o))return o;
 if(o.startAt!=null)return dt(o.startAt)===dt(proof.startAt)?o:{...o,startAt:null,clockConflict:true};
 return {...o,startAt:proof.startAt,boardClockProof:proof};
}
function recoverArchiveClocks(root,archive,at){
 const stamp=dt(at),wanted=new Set(archive.latest.flatMap(b=>
  b.m.sport==='nhl'&&b.m.book==='prizepicks'&&b.m.pageTraversalComplete===true&&dt(b.first)<=stamp
  ?b.offers.filter(o=>o.market==='player_shots_on_goal'&&dt(o.observedAt)<=stamp&&stamp-dt(o.observedAt)<=300000).map(o=>o.eventId):[]));
 if(!wanted.size)return archive;
 let index,rev;
 try{if(git(root,['rev-parse','--is-shallow-repository'])!=='false')return archive;rev=git(root,['rev-parse','HEAD']);index=JSON.parse(git(root,['show',rev+':'+indexPath]));}catch{return archive;}
 if(index.kind!=='pickfinder_current_identity_registry_v1')return archive;
 const byEvent=new Map();
 for(const r of index.eventRegistry??[]){
  if(r.sport!=='nhl'||r.namespace!=='nhl:official'||!wanted.has(r.sourceEventId)||dt(r.startAt)<=stamp+900000||
    !Array.isArray(r.timezoneReceiptDigests)||new Set(r.timezoneReceiptDigests).size!==3||r.timezoneReceiptDigests.length!==3)continue;
  const facts=immutable(root,identity+r.nativeReceiptDigest+'.json',r.nativeReceiptDigest);
  if(!facts||facts.doc.kind!=='independent_public_sport_identity_facts_v1'||facts.doc.source!=='nhl:official')continue;
  const controls=r.timezoneReceiptDigests.map(d=>immutable(root,'research/pickfinder-public-v1/directory/'+d+'.json',d));
  if(controls.some(d=>!d||d.doc.schema!=='pickfinder-controlled-clock-v1'))continue;
  const rebuilt=replay({facts:[facts],controls,profiles:[],clock:at,revision:rev}).events.filter(x=>
   x.sourceEventId===r.sourceEventId&&x.eventId===r.eventId&&x.namespace===r.namespace&&
   dt(x.startAt)===dt(r.startAt)&&x.nativeReceiptDigest===r.nativeReceiptDigest&&
   key(...x.timezoneReceiptDigests)===key(...r.timezoneReceiptDigests.slice().sort()));
  if(rebuilt.length!==1)continue;
  const p=rebuilt[0],old=byEvent.get(p.sourceEventId);
  if(old===null||old&&key(old.eventId,old.startAt)!==key(p.eventId,p.startAt))byEvent.set(p.sourceEventId,null);
  else if(!old||dt(p.proofAvailableAt)<dt(old.proofAvailableAt))byEvent.set(p.sourceEventId,p);
 }
 return {...archive,latest:archive.latest.map(b=>b.m.sport==='nhl'&&b.m.book==='prizepicks'
  ?{...b,offers:b.offers.map(o=>o.market==='player_shots_on_goal'&&byEvent.has(o.eventId)
   ?byEvent.get(o.eventId)===null?{...o,startAt:null,clockConflict:true}:plan(o,byEvent.get(o.eventId)):o)}:b)};
}
function proofMatches(p,proof){
 return !!proof&&proof.namespace==='nhl:official'&&proof.sport==='nhl'&&proof.sourceEventId===p.sourceEventId&&
  String(proof.eventId)===String(p.gameId)&&dt(proof.startAt)===dt(p.startAt)&&dt(proof.proofAvailableAt)<=dt(p.sourceObservedAt)&&
  hash(proof.nativeReceiptDigest)&&Array.isArray(proof.timezoneReceiptDigests)&&proof.timezoneReceiptDigests.length===3&&
  new Set(proof.timezoneReceiptDigests).size===3&&proof.timezoneReceiptDigests.every(hash);
}
module.exports={recoverArchiveClocks,plan,proofMatches};
