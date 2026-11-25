'use strict';
// Independent, counts-only monitor of committed public checkpoints. Never connects to PickFinder or reads Actions logs.
const fs=require('node:fs'),path=require('node:path');
const {ROOT}=require('./pickfinder-public-archive.cjs');
const {read,list,git}=require('./pickfinder-public-evidence-audit.cjs');
const {queue}=require('./pickfinder-public-runner.cjs');
const {VERSION}=require('./pickfinder-research-coverage.cjs');
function summarize(boards,profiles){
 const q=queue(boards,profiles),sports=[...new Set(boards.map(b=>b.sport))].sort(),bySport={};
 for(const sport of sports){
  const x=queue(boards.filter(b=>b.sport===sport),profiles.filter(p=>p.records.some(r=>r.sport===sport)).map(p=>({records:p.records.filter(r=>r.sport===sport)})));
  bySport[sport]={total:x.total,completedSampledScopes:x.done,remaining:x.pending.length,sharedAcrossBooks:x.sharedAcrossBooks};
 }
 const rows=profiles.flatMap(p=>p.records);
 return {total:q.total,completedSampledScopes:q.done,remaining:q.pending.length,offerReferences:q.offerReferences,sharedAcrossBooks:q.sharedAcrossBooks,profileAttempts:rows.length,nontruncatedSampleAttempts:rows.filter(r=>r.status==='sampled'&&r.coverageVersion===VERSION&&r.truncated===false&&r.research?.length).length,bySport};
}
function scan(root){
 const boards=[],profiles=[],invalid={boardParts:0,profiles:0};let latestCheckpointAt=null;
 const partIds=list(root,'board-parts'),profileIds=list(root,'profiles');
 for(const digest of partIds)try{
  const p=read(root,'board-parts',digest);
  if(p.schema!=='pickfinder-public-board-part-v1'||!Array.isArray(p.rows)||!['prizepicks','underdog'].includes(p.book)||typeof p.sport!=='string')throw Error('part schema');
  if(['offers','unpricedTierObservations'].includes(p.field))boards.push({sport:p.sport,book:p.book,field:p.field,rows:p.rows.map(({player,market,eventId,detailId,period,mapRange,gameMode})=>({player,market,eventId,detailId,period,mapRange,gameMode}))});
 }catch{invalid.boardParts++;}
 for(const digest of profileIds)try{
  const p=read(root,'profiles',digest);
  if(p.schema!=='pickfinder-public-profiles-v1'||!Array.isArray(p.records)||!p.records.every(r=>r&&typeof r==='object'))throw Error('profile schema');
  if(Number.isFinite(Date.parse(p.observedAt))&&(!latestCheckpointAt||Date.parse(p.observedAt)>Date.parse(latestCheckpointAt)))latestCheckpointAt=p.observedAt;
  profiles.push({records:p.records.map(({sport,player,market,eventId,detailId,period,mapRange,gameMode,status,coverageVersion,truncated,research})=>({sport,player,market,eventId,detailId,period,mapRange,gameMode,status,coverageVersion,truncated,research:Array.isArray(research)&&research.length?[true]:[]}))});
 }catch{invalid.profiles++;}
 const revision=git(root,['rev-parse','HEAD']);
 let archiveTree=null;try{archiveTree=git(root,['rev-parse','HEAD:'+ROOT]);}catch{}
 const counts=summarize(boards,profiles),complete=invalid.boardParts===0&&invalid.profiles===0;
 return {schema:'pickfinder_public_checkpoint_progress_v1',generatedAt:new Date().toISOString(),archiveRevision:revision,archiveTree,latestCheckpointAt,boardPartFiles:partIds.length,profileCheckpointFiles:profileIds.length,invalid,countsComplete:complete,...counts,scope:'all committed public board parts, deduplicated by collector queue; sampled completion is not exhaustive research',liveJobLogsRequired:false,allFiltersVerified:false,originalOffersVerified:false,modelApproved:false};
}
if(require.main===module){
 try{
  const root=fs.realpathSync(process.argv[2]||'.'),report=scan(root),out=path.join(root,'data/pickfinder-public-checkpoint-progress.json');
  let prior=null;try{prior=JSON.parse(fs.readFileSync(out,'utf8'));}catch{}
  if(!prior||prior.archiveTree!==report.archiveTree||prior.countsComplete!==report.countsComplete||prior.schema!==report.schema){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
  const summary=['## PickFinder archived checkpoint progress','','Archive snapshot: '+report.archiveRevision,'Last checkpoint: '+(report.latestCheckpointAt||'none'),'Total scopes: '+report.total,'Completed sampled scopes: '+report.completedSampledScopes,'Remaining: '+report.remaining,'Attempts: '+report.profileAttempts,'Counts complete: '+report.countsComplete,'','Counts are committed archive observations, not live job logs or exhaustive model verification.'].join('\n')+'\n';
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
  console.log(JSON.stringify(report));if(!report.countsComplete)process.exitCode=1;
 }catch{console.error('Checkpoint progress audit failed closed');process.exitCode=1;}
}
module.exports={summarize,scan};
