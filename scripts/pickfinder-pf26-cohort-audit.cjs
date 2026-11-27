'use strict';
// Read-only comparison of the exact original PF-26 cohort to reviewed evidence.
const {resolve,join}=require('node:path');
const {execFileSync}=require('node:child_process');
const ORIGINAL='09380e73204ac1eda0423f690928db121b694f04';
const ORIGINAL_CLOCK='2026-11-26T03:51:23.888Z';
const PROOF='43df7cc9efbabd9b76c6f5ec0f6eb502476d122a';
const PROOF_CLOCK='2026-11-27T15:36:00.000Z';
const isDigest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function compare(original, latest, asOf){
 const bySport={};const cutoff=Date.parse(asOf);
 if(!Number.isFinite(cutoff))throw Error('audit cutoff');
 let exactReviewed=0;
 for(const [key,fact] of original){
  const sport=String(fact.sport);
  if(!['nhl','nfl'].includes(sport))throw Error('unexpected original sport');
  const r=bySport[sport]??={original:0,exactReviewed:0,currentUnreviewed:0,absent:0,conflicted:0};r.original++;
  const proof=latest.reviewedCache.get(key),cand=latest.cache.get(key);
  if(proof&&proof.value===fact.value&&proof.providerIdentityReviewed===true&&
     proof.modelApproved===false&&proof.collectionSkipAuthorized===false&&isDigest(proof.reviewDigest)&&
     isDigest(proof.nativeDigest)&&isDigest(proof.profileDigest)&&Date.parse(proof.availableAt)<=cutoff){
   exactReviewed++;r.exactReviewed++;
  }else if(proof||cand&&cand.value!==fact.value)r.conflicted++;
  else if(cand)r.currentUnreviewed++;
  else r.absent++;
 }
 return {original:original.size,exactReviewed,bySport,qualifiedModelInputs:0,modelApproved:false,networkCalls:0};
}
const revision=root=>execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
function audit(oldRoot, proofRoot){
 const old=resolve(oldRoot),latest=resolve(proofRoot);
 if(revision(old)!==ORIGINAL||revision(latest)!==PROOF)throw Error('immutable archive revision mismatch');
 const {committedProfiles}=require(join(latest,'scripts/pickfinder-archived-model-inputs.cjs'));
 const scan=(root,cut)=>require(join(root,'scripts/pickfinder-native-history-reconciliation.cjs')).fromArchive(root,committedProfiles(root),cut);
 const original=scan(old,ORIGINAL_CLOCK);
 if(original.cache.size!==462||original.summary.candidates!==5096)throw Error('original 462-key cohort not reproduced');
 const newer=scan(latest,PROOF_CLOCK);
 return {kind:'pickfinder_pf26_original_cohort_replay_v1',originalRevision:ORIGINAL,originalClock:ORIGINAL_CLOCK,
  proofRevision:PROOF,proofClock:PROOF_CLOCK,currentReviewedUniverse:newer.reviewedCache.size,
  ...compare(original.cache,newer,PROOF_CLOCK)};
}
module.exports={compare,audit};
if(require.main===module){
 try{const report=audit(process.argv[2],process.argv[3]);console.log(JSON.stringify(report,null,2));
 if(report.exactReviewed!==462)process.exitCode=1;}
 catch(e){console.error(e.message);process.exitCode=1;}
}
