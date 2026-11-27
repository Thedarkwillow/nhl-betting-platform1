'use strict';
// Publish allowlisted public reports, plus staged immutable NBA receipts for the
// validation workflow only. Build atop the current remote tree without a rebase.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {canArchive}=require('./pickfinder-forecast-archive-gate.cjs');
const validationReport='data/pickfinder-public-research-health.json';
const archiveRoot='research/pickfinder-public-validation-v1/';
const files={
 'data/pickfinder-public-activity.json':'public_pickfinder_activity_readiness_v1',
 'data/pickfinder-current-identity-registry.json':'pickfinder_current_identity_registry_v1',
 'data/prizepicks-model-rankings.json':'public_prizepicks_model_ranking_v1',
 [validationReport]:'pickfinder_public_research_health_v1'
};
const receiptKinds={
 'nba-forecasts':['pickfinder_public_nba_shadow_forecasts_v1'],
 'nba-grades':['pickfinder_public_nba_independent_grades_v1'],
 'nba-schedule':['nba_official_schedule_v1'],
 'nba-history':['nba_official_stats_regular_season_log_v1'],
 'nba-final-history':['nba_official_cdn_final_history_v1','nba_official_web_final_history_v1'],
 'nba-identity-candidates':['public_nba_identity_candidates_v1'],
 'nba-official-availability':['nba_public_official_pregame_availability_v1']
};
const git=(root,args,opts={})=>execFileSync('git',['-C',root,...args],{stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024,timeout:120000,...opts});
const sha=x=>/^[a-f0-9]{40}$/.test(x);
function validate(raw,file,at){
 if(!Object.hasOwn(files,file)||raw.length>8e6)throw Error('report allowlist');
 const x=JSON.parse(raw),t=Date.parse(x.generatedAt);
 if((file===validationReport?x.schema:x.kind)!==files[file]||x.paidRequests!==0||x.modelApproved!==false||x.originalPlatformVerified!==false||!Number.isFinite(t)||t>at)throw Error('public report contract');
 if(file===validationReport){
  if(x.privateRepoUsed!==false||!x.bySport||!x.independentGrading)throw Error('validation report contract');
 }else if(file==='data/pickfinder-public-activity.json'){
  if(!Array.isArray(x.events)||!x.readiness||!x.delivery||x.delivery.nativePickFinder!=='unverified')throw Error('activity contract');
 }else if(file==='data/pickfinder-current-identity-registry.json'){
  const validDigest=d=>/^[a-f0-9]{64}$/.test(d||'');
  const reviewedNba=new Set((x.statisticalCrosswalks||[]).filter(r=>
   r.sport==='nba'&&r.namespace==='nba:official'&&r.evidenceKind==='independent_nba_schedule_and_roster_review'&&
   validDigest(r.crosswalkReceiptDigest)&&r.crosswalkReceiptDigest===r.nativeReceiptDigest&&/^\d+$/.test(String(r.playerId))&&
   Number.isFinite(Date.parse(r.proofAvailableAt))&&Date.parse(r.proofAvailableAt)<Date.parse(r.startAt)).
   map(r=>JSON.stringify([String(r.playerId),r.crosswalkReceiptDigest])));
  const reviewedPaths=new Map((x.reviewedStatIdentities||[]).filter(r=>
   r.evidenceKind==='archived_independently_reviewed_player_identity'&&validDigest(r.nativeReceiptDigest)&&
   validDigest(r.identityEvidenceSha256)&&Number.isFinite(Date.parse(r.proofAvailableAt))&&Date.parse(r.proofAvailableAt)<=t
  ).map(r=>[JSON.stringify([r.sport,String(r.playerId),r.nativeReceiptDigest,r.identityEvidenceSha256]),Date.parse(r.proofAvailableAt)]));
  const archiveIdentity=r=>r.timezoneReceiptDigests.length===0&&validDigest(r.archivedIdentityEvidenceSha256)&&
   (reviewedPaths.get(JSON.stringify([r.sport,String(r.playerId),r.identityReceiptDigest,r.archivedIdentityEvidenceSha256]))??Infinity)<=Date.parse(r.availableAt);
  const identityEvidence=r=>Array.isArray(r.timezoneReceiptDigests)&&(
   r.timezoneReceiptDigests.length===3&&new Set(r.timezoneReceiptDigests).size===3&&r.timezoneReceiptDigests.every(validDigest)||
   r.sport==='nba'&&r.timezoneReceiptDigests.length===0&&r.crosswalkReceiptDigest===r.identityReceiptDigest&&
   reviewedNba.has(JSON.stringify([String(r.playerId),r.crosswalkReceiptDigest]))||archiveIdentity(r));
  if(x.qualifiedShadowStatistics!==undefined&&(!Array.isArray(x.qualifiedShadowStatistics)||x.qualifiedShadowStatistics.some(r=>
   r.evidenceKind!=='verified_current_identity_and_independent_final_stat'||r.productionModelEligible!==false||
   r.shadowResearchEligible!==true||r.operatorOfferVerified!==false||r.settlementVerified!==false||
   !validDigest(r.nativeDigest)||!validDigest(r.profileDigest)||!validDigest(r.identityReceiptDigest)||
   !identityEvidence(r)||!Number.isFinite(r.value)||!Number.isFinite(Date.parse(r.availableAt))||Date.parse(r.availableAt)>t)))throw Error('shadow statistic evidence contract');
  if(!Array.isArray(x.rows)||!Array.isArray(x.registry)||!sha(x.archiveRevision)||x.rows.some(r=>r.operatorOfferVerified!==false||r.settlementVerified!==false||r.statisticalModelEligible!==false))throw Error('identity registry contract');
 }else if(!Array.isArray(x.rows)||x.researchOnly!==true||x.privateRepoUsed!==false||x.calibrated!==false){
  throw Error('ranking contract');
 }
 return {t};
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function stagedReceipts(root){
 const changes=git(root,['diff','--cached','--name-status','--no-renames','-z','HEAD']).toString().split('\0').filter(Boolean);
 if(changes.length%2||changes.length>256)throw Error('staged receipt diff');
 const result=[];
 for(let i=0;i<changes.length;i+=2){
  const [status,file]=changes.slice(i,i+2),m=file.startsWith(archiveRoot)&&/^([a-z-]+)\/([a-f0-9]{64})\.json$/.exec(file.slice(archiveRoot.length));
  if(status!=='A'||!m||!Object.hasOwn(receiptKinds,m[1]))throw Error('only new allowlisted NBA receipt paths may be archived');
  const index=git(root,['ls-files','-s','--',file]).toString().trim();
  const staged=/^100644 ([a-f0-9]{40}) 0\t/.exec(index);
  if(!staged)throw Error('immutable receipt mode');
  const raw=git(root,['cat-file','blob',staged[1]]);
  if(raw.length>12e6||createHash('sha256').update(raw).digest('hex')!==m[2])throw Error('immutable receipt hash');
  const doc=JSON.parse(raw);
  if(!receiptKinds[m[1]].includes(doc.kind))throw Error('immutable receipt schema');
  result.push({file,blob:staged[1],kind:m[1],doc});
 }
 return result;
}
async function publish(root,file,{now=Date.now,backoff=ms=>sleep(ms),beforePush=()=>{}}={}){
 if(!Object.hasOwn(files,file))throw Error('report allowlist');
 const report=fs.readFileSync(path.join(root,file));
 const wanted=validate(report,file,now());
 const checkout=git(root,['rev-parse','HEAD']).toString().trim();
 const receipts=file===validationReport?stagedReceipts(root):[];
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-derived-index-'));
 const env={...process.env,GIT_INDEX_FILE:path.join(tmp,'index')};
 const remote=()=>{git(root,['fetch','--no-tags','origin','main']);return git(root,['rev-parse','FETCH_HEAD']).toString().trim();};
 const read=(rev)=>{try{return git(root,['show',rev+':'+file]);}catch{return null;}};
 const equivalentOrNewer=old=>{
  if(!old)return false;
  if(report.equals(old))return true;
  try{return validate(old,file,now()).t>=wanted.t;}catch{return false;}
 };
 try{
  const blob=git(root,['hash-object','-w','--stdin'],{input:report,stdio:['pipe','pipe','pipe']}).toString().trim();
  for(let i=0;i<8;i++){
   const parent=remote();
   if(!sha(parent)||!sha(blob))throw Error('git revision');
   git(root,['merge-base','--is-ancestor',checkout,parent]);
   const publishReport=!equivalentOrNewer(read(parent)), adds=[];
   for(const receipt of receipts){
    const entry=git(root,['ls-tree',parent,'--',receipt.file]).toString().trim();
    if(!entry)adds.push(receipt);
    else if(!entry.startsWith('100644 blob '+receipt.blob+'\t'))throw Error('immutable receipt conflict');
   }
   if(!publishReport&&!adds.length)return {status:'already_current_or_newer',commit:parent};
   // If another writer committed model-lock evidence after our input checkout,
   // do not archive an overlapping forecast or grade computed from stale inputs.
   for(const kind of ['nba-forecasts','nba-grades'])if(adds.some(r=>r.kind===kind)&&
     git(root,['diff','--name-only',checkout,parent,'--',archiveRoot+kind+'/']).toString().trim())
    throw Error('model archive advanced; rebuild forecasts or grades on current main');
   git(root,['read-tree',parent],{env});
   if(publishReport)git(root,['update-index','--add','--cacheinfo','100644,'+blob+','+file],{env});
   for(const a of adds)git(root,['update-index','--add','--cacheinfo','100644,'+a.blob+','+a.file],{env});
   const tree=git(root,['write-tree'],{env}).toString().trim();
   const commit=git(root,['-c','user.name=Public PickFinder reporting','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit-tree',tree,'-p',parent,'-m','Publish validated PickFinder website report']).toString().trim();
   const paths=[...(publishReport?[file]:[]),...adds.map(a=>a.file)].sort();
   const diff=git(root,['diff-tree','--no-commit-id','--name-only','-r',commit]).toString().trim().split('\n').sort();
   if(JSON.stringify(diff)!==JSON.stringify(paths))throw Error('report staged paths');
   await beforePush({i,parent,commit});
   for(const a of adds)if(a.kind==='nba-forecasts'&&!canArchive(a.doc,now()))throw Error('forecast archive gate rejected an invalid or late frame');
   try{git(root,['push','origin',commit+':refs/heads/main']);}
   catch{if(i<7)await backoff(1000*(i+1));continue;}
   const confirmed=remote();
   git(root,['merge-base','--is-ancestor',commit,confirmed]);
   if(!equivalentOrNewer(read(confirmed)))throw Error('remote report changed after publication');
   for(const a of receipts)if(!git(root,['ls-tree',confirmed,'--',a.file]).toString().startsWith('100644 blob '+a.blob+'\t'))throw Error('remote receipt changed after publication');
   return {status:'published_and_verified',commit};
  }
  throw Error('concurrent main update exhausted publication retries');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
module.exports={publish,validate};
if(require.main===module)publish(process.cwd(),process.argv[2]).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('Public PickFinder publisher failed closed: '+e.message.split('\n')[0]);process.exitCode=1;});
