'use strict';
// Count-only source-to-actual-model bridge. The frozen model stays unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {extractQuotes,comparator}=require('./pickfinder-quote-features.cjs');
const {frames,grade}=require('./grade-nba-parallel-paper-pilot.cjs');
const {market}=require('../src/nba-research-pipeline-v1.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),dt=Date.parse;
const git=(root,args)=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe'],maxBuffer:96e6,timeout:30000});
function load(root,rel){
 const allowed=/^(?:research\/pickfinder-premium\/\d{4}-\d{2}-\d{2}\/(?:manual|0600|0900)\/(?:prizepicks|underdog)\/[a-z0-9-]+\/[a-z0-9_-]+\/(?:source|normalized)\.json|research\/pickfinder-reviewed-crosswalks\/[a-f0-9]{64}\.json|outputs\/nba\/parallel-paper-grades\/[a-f0-9]{64}\.json)$/;
 if(!allowed.test(rel))throw Error('path');const p=path.join(root,rel),s=fs.lstatSync(p);
 if(!s.isFile()||s.isSymbolicLink()||s.size>64e6||git(root,['status','--porcelain','--',rel]).length)throw Error('archive file');
 const cs=git(root,['log','--format=%H','--',rel]).toString().trim().split('\n');if(cs.length!==1||!/^[a-f0-9]{40}$/.test(cs[0]))throw Error('not immutable');
 const raw=git(root,['show',cs[0]+':'+rel]),first=git(root,['show','-s','--format=%cI',cs[0]]).toString().trim();
 if(!raw.equals(fs.readFileSync(p))||!Number.isFinite(dt(first)))throw Error('archive bytes');
 return {doc:JSON.parse(raw),digest:sha(raw),commit:cs[0],first,rel};
}
function sourceBatches(root){
 const paths=git(root,['ls-tree','-r','--name-only','HEAD','--','research/pickfinder-premium']).toString().trim().split('\n').filter(p=>p.endsWith('/source.json'));
 const out=[];for(const p of paths)try{
  const f=load(root,p),n=load(root,p.replace(/source\.json$/,'normalized.json'));
  if(n.commit!==f.commit||n.doc.sourceDigest!==f.digest||f.doc.schema!=='pickfinder-premium-export-v1'||!Array.isArray(f.doc.pages)||dt(f.doc.endedAt)>dt(f.first)+999)continue;
  out.push(f);
 }catch{}
 return out;
}
function crosswalks(root){
 const dir='research/pickfinder-reviewed-crosswalks',base=path.join(root,dir);if(!fs.existsSync(base))return [];
 const out=[];for(const n of fs.readdirSync(base).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)))try{
  const f=load(root,dir+'/'+n);if(n!==f.digest+'.json'||f.doc.kind!=='pickfinder_independently_reviewed_crosswalk_v1'||!Array.isArray(f.doc.rows))continue;
  for(const x of f.doc.rows)if(x.independentReviewVerified===true&&x.identityEvidenceSha256&&/^[a-f0-9]{64}$/.test(x.identityEvidenceSha256)&&Number.isFinite(dt(x.verifiedAt))&&dt(x.verifiedAt)<=dt(f.first)+999)out.push({...x,first:f.first});
 }catch{}
 return out;
}
const scope=(id,event)=>JSON.stringify([id,event]);
function audit({batches,reviewed,pilots,grades=[]}){
 const stats={},byNative=new Map(),quotesByScope=new Map(),matched=[];
 const inc=(s,k,n=1)=>{const a=stats[s]??={};a[k]=(a[k]||0)+n;};
 for(const x of reviewed){const k=scope(x.nativePlayerId,x.nativeEventId),a=byNative.get(k)||[];a.push(x);byNative.set(k,a);}
 for(const b of batches)for(const p of b.doc.pages)for(const row of p.rows||[]){
  const sport=b.doc.sport;if(row.sport!==sport)continue;inc(sport,'boardRows');
  const q=extractQuotes(row);inc(sport,'displayedQuotes',q.length);inc(sport,'explicitThresholdQuotes',q.filter(x=>x.quoteLine!==null).length);
  if(!Number.isFinite(dt(row.observedAt))||dt(row.observedAt)>dt(b.first)+999)continue;
  const k=scope(row.detailId,row.eventId),a=quotesByScope.get(k)||[];for(const x of q)a.push({...x,archiveFirst:b.first});quotesByScope.set(k,a);
 }
 const gradeMap=new Map(),bad=new Set();for(const g of grades){const k=g.id+'|'+g.sourceCommit;if(!['correct','incorrect'].includes(g.status))continue;const old=gradeMap.get(k);if(old&&old.status!==g.status)bad.add(k);else if(!old)gradeMap.set(k,g);}
 const used=new Set();let n=0,modelBrier=0,quoteBrier=0;
 for(const f of pilots)for(const p of f.doc.rows||[]){
  const sport='nba';inc(sport,'frozenModelRows');const cut=f.doc.generatedAt,ids=byNative.get(scope(p.playerId,p.gameId))||[];
  const verified=ids.filter(x=>x.sport===sport&&dt(x.first)<=dt(cut)&&dt(x.verifiedAt)<=dt(cut)&&market(x.sourceMarket)===p.market&&x.nativeMarket===p.market);
  const distinct=new Map(verified.map(x=>[scope(x.sourceDetailId,x.sourceEventId),x]));
  if(distinct.size!==1){inc(sport,distinct.size?'ambiguousCrosswalk':'noReviewedCrosswalk');continue;}
  const x=[...distinct.values()][0],qs=(quotesByScope.get(scope(x.sourceDetailId,x.sourceEventId))||[]).filter(q=>dt(q.archiveFirst)<=dt(cut));
  const o={...p,sport,detailId:x.sourceDetailId,eventId:x.sourceEventId,market:x.sourceMarket,period:x.sourcePeriod??null,mapRange:null,gameMode:null};
  const comparators=comparator({offer:o,quotes:qs,crosswalk:x,forecastAt:cut});
  if(!comparators.length){inc(sport,'noFreshExactTwoSidedQuote');continue;}
  // One freshest observed pair per sportsbook, not a collection-time-weighted average.
  const newest=new Map();for(const q of comparators){const old=newest.get(q.book);if(!old||dt(q.observedAt)>dt(old.observedAt))newest.set(q.book,q);}
  const higher=[...newest.values()].reduce((s,q)=>s+q.aggregatorNoVigHigher,0)/newest.size;
  const pSelected=p.offeredSide==='Higher'?higher:1-higher;
  const id=JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.tier,p.offeredSide]),k=id+'|'+f.commit;
  if(used.has(k))continue;used.add(k);inc(sport,'joinedModelRows');
  const g=gradeMap.get(k);
  if(g&&!bad.has(k)&&Number.isFinite(p.rawSelectedEstimate)){const y=Number(g.status==='correct');n++;modelBrier+=(p.rawSelectedEstimate-y)**2;quoteBrier+=(pSelected-y)**2;}
  matched.push({kind:'actual_frozen_model_comparison',sourceCommit:f.commit,id,forecastAt:cut,market:p.market,modelProbability:p.rawSelectedEstimate,aggregatorNoVigSelected:pSelected,books:newest.size,modelInputsApproved:false});
 }
 return {summary:{state:'pickfinder_model_input_evidence',bySport:stats,reviewedCrosswalks:reviewed.length,joinedActualModelRows:matched.length,independentlyDecidedComparisons:n,modelBrier:n?modelBrier/n:null,quoteBrier:n?quoteBrier/n:null,modelApproved:false,rawRowsPublished:0,paidRequests:0},matched};
}
function run(root,now=new Date().toISOString()){
 if(process.env.RESTRICTED_DESTINATION_VERIFIED!=='1')throw Error('private archive');
 const dir='outputs/nba/parallel-paper-grades',base=path.join(root,dir),grades=[];
 if(fs.existsSync(base))for(const n of fs.readdirSync(base).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)))try{const f=load(root,dir+'/'+n);if(f.doc.kind==='nba_conditional_pilot_grade_v1'&&f.doc.formalUntouchedCohort===false)grades.push(...f.doc.rows.filter(x=>x.finalEvidence?.source==='NBA official CDN'&&/^[a-f0-9]{64}$/.test(x.finalEvidence.sourceResponseSha256||'')));}catch{}
 const a=audit({batches:sourceBatches(root),reviewed:crosswalks(root),pilots:frames(root,now),grades});
 // Private joined rows are intentionally separate from the frozen forecasts.
 if(a.matched.length){const dest=path.join(root,'research/pickfinder-model-comparisons');fs.mkdirSync(dest,{recursive:true,mode:0o700});const raw=JSON.stringify({kind:'pickfinder_shadow_model_comparison_v1',rows:a.matched,modelApproved:false})+'\n',p=path.join(dest,sha(raw)+'.json');if(!fs.existsSync(p))fs.writeFileSync(p,raw,{flag:'wx',mode:0o600});}
 return a.summary;
}
module.exports={audit,run};
if(require.main===module){try{console.log(JSON.stringify(run(fs.realpathSync(process.argv[2]))));}catch{console.error('PickFinder model input evidence audit failed closed');process.exitCode=1;}}
