'use strict';
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),{ROOT,sha}=require('./pickfinder-public-archive.cjs'),{pacific}=require('./pacific-morning-capture-gate.cjs');
const REPOSITORY='Thedarkwillow/nhl-betting-platform1';
const AUDIT_PATH='.github/workflows/morning-private-archive-health.yml';
const AUDIT_CRONS={'20 7 * * *':{slot:'06:00',hour:7},'20 10 * * *':{slot:'09:00',hour:10}};
const CORE_PARTITIONS=['nba','nhl','nfl'].flatMap(s=>['prizepicks','underdog'].map(b=>s+'/'+b));
const validDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
const validRunId=id=>/^[1-9][0-9]{0,19}$/.test(id);
const validRevision=revision=>typeof revision==='string'&&/^[a-f0-9]{40}$/.test(revision);
function requestOptions(env){
 return {redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/vnd.github+json',...(env.GH_TOKEN?{Authorization:'Bearer '+env.GH_TOKEN}:{})}};
}
async function auditContext(slot,requestedDay,env=process.env,client=fetch,now=new Date()){
 if(!['06:00','09:00'].includes(slot))throw Error('unsupported_slot');
 if(env.GITHUB_EVENT_NAME!=='schedule'){
  if(requestedDay&&!validDay(requestedDay))throw Error('invalid_requested_day');
  return {day:requestedDay||pacific(now).day,dayBasis:requestedDay?'explicit_pacific_day':'current_pacific_day'};
 }
 const cron=AUDIT_CRONS[env.AUDIT_CRON],id=String(env.GITHUB_RUN_ID||'');
 if(requestedDay||!cron||cron.slot!==slot||!validRunId(id))throw Error('unverified_audit_trigger');
 let run;
 try{
  const response=await client('https://api.github.com/repos/'+REPOSITORY+'/actions/runs/'+id,requestOptions(env));
  if(response.ok)run=await response.json();
 }catch{}
 if(!run||String(run.id)!==id||run.event!=='schedule'||run.repository?.full_name!==REPOSITORY||
  run.head_branch!=='main'||run.path!==AUDIT_PATH||!Number.isFinite(Date.parse(run.created_at))||
  Date.parse(run.created_at)>Number(now))throw Error('unverified_scheduler_run_metadata');
 const time=pacific(run.created_at);
 if(time.hour<cron.hour||time.hour===cron.hour&&time.minute<20)throw Error('unverified_scheduler_day');
 // A runner may start after Pacific midnight. Never roll to the execution day.
 // This binds to GitHub's run creation clock, not a fabricated nominal cron date.
 return {day:time.day,dayBasis:'github_run_created_at',auditRunId:id};
}
const git=(root,args)=>execFileSync('git',['-C',root,...args],{stdio:['ignore','pipe','pipe'],maxBuffer:32e6,timeout:30000});
const resolveHead=root=>git(root,['rev-parse','HEAD']).toString().trim();
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
function load(root,revision,kind,required=null){
 const dir=ROOT+'/'+kind,files=git(root,['ls-tree','-r','--name-only',revision,'--',dir]).toString().trim().split('\n').filter(p=>new RegExp('^'+dir+'/[a-f0-9]{64}\\.json$').test(p)),out=new Map();
 for(const rel of files){if(required&&!required.has(path.basename(rel,'.json')))continue;try{const raw=git(root,['show',revision+':'+rel]),digest=path.basename(rel,'.json');if(sha(raw)!==digest)continue;const cs=git(root,['log','--format=%H',revision,'--',rel]).toString().trim().split('\n');if(cs.length!==1)continue;out.set(digest,{digest,doc:JSON.parse(raw),first:git(root,['show','-s','--format=%cI',cs[0]]).toString().trim(),firstCommit:cs[0]});}catch{}}
 return out;
}
function slotEvidence(root,day,slot,revision=resolveHead(root)){
 if(!validRevision(revision))throw Error('invalid_archive_revision');
 const boards=[...load(root,revision,'boards').values()].filter(({doc})=>doc.localDay===day&&doc.slot===slot);
 const needed=new Set(boards.flatMap(({doc})=>Array.isArray(doc.partDigests)?doc.partDigests:[]));
 return {revision,boards,parts:needed.size?load(root,revision,'board-parts',needed):new Map()};
}
function missingCoreSlotPartitions(root,day,slot,evidence=slotEvidence){
 if(!validDay(day)||!['06:00','09:00'].includes(slot))throw Error('slot');
 const {boards,parts}=evidence(root,day,slot),verified=new Set();
 for(const {doc,first} of boards){
  const key=doc.sport+'/'+doc.book;
  if(CORE_PARTITIONS.includes(key)&&assess({manifest:doc,first,parts,day,slot})!=='pending')verified.add(key);
 }
 return CORE_PARTITIONS.filter(key=>!verified.has(key));
}
function run(root,day,slot,now=new Date(),evidence=slotEvidence){
 const h=Number(slot.slice(0,2));if(!validDay(day)||!['06:00','09:00'].includes(slot))throw Error('slot');
 const t=pacific(now);if(t.day<day||t.day===day&&t.hour<=h)return {state:'slot_not_finished',day,slot};
 const {revision,boards,parts}=evidence(root,day,slot),results={};
 for(const {doc,first} of boards){if(doc.localDay!==day||doc.slot!==slot)continue;const k=doc.sport+'/'+doc.book,r=results[k]??={verified:0,pending:0,offers:0};const state=assess({manifest:doc,first,parts,day,slot});if(state==='pending')r.pending++;else{r.verified++;r.offers+=doc.health.distinctOfferKeys;}}
 return {state:'public_pickfinder_morning_audit',day,slot,archiveRevision:revision,archiveMissingCorePartitions:CORE_PARTITIONS.filter(key=>!(results[key]?.verified>0)),partitions:results,corePartitionsVerified:CORE_PARTITIONS.every(key=>results[key]?.verified>0),originalPlatformAvailabilityVerified:false,modelApproved:false,privateRepoUsed:false};
}
function scheduledRunMatches(origin,run,day,slot,first){
 const hour=Number(slot.slice(0,2)),cronMinute=[7,29].find(m=>origin?.cron===m+' '+hour+' * * *');
 return !!cronMinute&&origin.event==='schedule'&&/^[1-9][0-9]{0,19}$/.test(origin.runId)&&/^[1-9][0-9]{0,5}$/.test(origin.attempt)&&/^[a-f0-9]{40}$/.test(origin.revision)&&!!run&&String(run.id)===origin.runId&&String(run.run_attempt)===origin.attempt&&run.event==='schedule'&&run.head_sha===origin.revision&&run.head_branch==='main'&&run.repository?.full_name==='Thedarkwillow/nhl-betting-platform1'&&run.path==='.github/workflows/pickfinder-premium-hosted.yml'&&run.status==='completed'&&run.conclusion==='success'&&inHour(run.run_started_at,day,hour)&&pacific(run.run_started_at).minute>=cronMinute&&Date.parse(run.run_started_at)<=Date.parse(first);
}
async function verifyScheduled(root,report,env=process.env,client=fetch,evidence=slotEvidence){
 if(report.state!=='public_pickfinder_morning_audit')return report;
 const results={},cache=new Map(),receipts=[],{boards,parts,revision}=evidence(root,report.day,report.slot,report.archiveRevision);
 if(!validRevision(revision)||revision!==report.archiveRevision)throw Error('invalid_archive_revision');
 for(const {doc,first,digest,firstCommit} of boards){
  const archiveState=assess({manifest:doc,first,parts,day:report.day,slot:report.slot});
  if(doc.localDay!==report.day||doc.slot!==report.slot||archiveState==='pending')continue;
  const key=doc.sport+'/'+doc.book,r=results[key]??={scheduledVerified:0,manual:0,originUnknown:0,scheduledUnverified:0};
  const o=doc.captureOrigin;
  if(o?.event==='workflow_dispatch'||o?.event==='push'){r.manual++;continue;}
  if(o?.event!=='schedule'||!/^[1-9][0-9]{0,19}$/.test(o.runId)||!/^[1-9][0-9]{0,5}$/.test(o.attempt)){r.originUnknown++;continue;}
  const k=o.runId+'/'+o.attempt;
  if(!cache.has(k)){let data=null;try{
    const res=await client('https://api.github.com/repos/'+REPOSITORY+'/actions/runs/'+o.runId+'/attempts/'+o.attempt,requestOptions(env));
    if(res.ok)data=await res.json();
   }catch{}cache.set(k,data);}
  const attempt=cache.get(k);
  if(scheduledRunMatches(o,attempt,report.day,report.slot,first)){
   r.scheduledVerified++;
   receipts.push({partition:key,manifestDigest:digest,firstCommit,firstCommitAt:first,runId:o.runId,runAttempt:o.attempt,cron:o.cron,
    runStartedAt:attempt.run_started_at,firstObservedAt:doc.firstObservedAt,lastObservedAt:doc.lastObservedAt,archiveState,
    pagesTraversed:doc.health.pages,pagesDisplayed:doc.displayedPageCount??null,offers:doc.health.distinctOfferKeys,
    unresolvedRows:Number.isSafeInteger(doc.health.unresolvedRows)?doc.health.unresolvedRows:null});
  }else r.scheduledUnverified++;
 }
 const scheduledMissingCorePartitions=CORE_PARTITIONS.filter(key=>!(results[key]?.scheduledVerified>0));
 return {...report,scheduledPartitions:results,scheduledReceipts:receipts,scheduledMissingCorePartitions,scheduledCorePartitionsVerified:scheduledMissingCorePartitions.length===0,scheduledFullCoverageCertified:false};
}
function scheduledAuditExit(report){
 return report.state==='public_pickfinder_morning_audit'&&report.scheduledCorePartitionsVerified===true?0:1;
}
module.exports={assess,run,scheduledRunMatches,verifyScheduled,scheduledAuditExit,missingCoreSlotPartitions,auditContext};
if(require.main===module){(async()=>{
 const root=process.argv[2],slot=process.argv[3],now=new Date();
 const context=await auditContext(slot,process.env.AUDIT_DAY,process.env,fetch,now);
 let pinned;
 const read=(...args)=>pinned??=(slotEvidence(...args));
 const report={...await verifyScheduled(root,run(root,context.day,slot,now,read),process.env,fetch,read),...context,generatedAt:now.toISOString()};
 const evidence=JSON.stringify(report);
 if(process.env.AUDIT_OUTPUT)fs.writeFileSync(process.env.AUDIT_OUTPUT,evidence+'\n');
 console.log(evidence);
 if(process.argv.includes('--require-scheduled-core')&&scheduledAuditExit(report)!==0){
  console.error('::error::No independently verified complete scheduled core partitions for '+context.day+' '+report.slot+' Pacific. Audit only, no collection or retry.');
  process.exitCode=1;
 }
})().catch(error=>{
 const allowed=['unsupported_slot','invalid_requested_day','unverified_audit_trigger','unverified_scheduler_run_metadata','unverified_scheduler_day','invalid_archive_revision'];
 const report={state:'public_pickfinder_morning_audit_blocked',reason:allowed.includes(error.message)?error.message:'audit_failed_closed',generatedAt:new Date().toISOString(),scheduledCorePartitionsVerified:false,privateRepoUsed:false};
 const evidence=JSON.stringify(report);
 if(process.env.AUDIT_OUTPUT)try{fs.writeFileSync(process.env.AUDIT_OUTPUT,evidence+'\n',{flag:'wx'});}catch{}
 console.log(evidence);
 console.error('Public archive audit failed closed');process.exitCode=1;
});}
