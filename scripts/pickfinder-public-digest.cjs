'use strict';
// On-demand summary of the same public observations used by the website.
// It does not dispatch a Discord message or contact PickFinder.
const manifestBase='https://github.com/Thedarkwillow/nhl-betting-platform1/blob/main/research/pickfinder-public-v1/boards/';
const reportUrl='https://github.com/Thedarkwillow/nhl-betting-platform1/blob/main/data/pickfinder-public-activity.json';
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const scope=/^[a-z0-9-]+\/(?:prizepicks|underdog)$/;
const ts=x=>typeof x==='string'?Date.parse(x):NaN;
const counter=x=>Number.isSafeInteger(x)&&x>=0?x:null;
function build(report,now,{limit=6}={}){
 const at=ts(now),observed=ts(report?.generatedAt);
 if(!Number.isFinite(at)||!Number.isFinite(observed)||at<observed||
  report.kind!=='public_pickfinder_activity_readiness_v1'||report.modelApproved!==false||
  report.originalPlatformVerified!==false||report.paidRequests!==0||report.archiveInvalid!==0||
  !report.readiness||Array.isArray(report.readiness)||!Array.isArray(report.events)||
  !Number.isInteger(limit)||limit<1||limit>12)throw Error('unverified digest input');
 const keys=Object.keys(report.readiness),states={recentNoDetectedGaps:0,recentUnproven:0,historical:0,noObservation:0};
 if(!keys.length||!keys.every(k=>scope.test(k)&&report.readiness[k]?.originalBoardCompletenessVerified===false))throw Error('invalid scope');
 for(const key of keys){
  const r=report.readiness[key],t=ts(r.observedAt);
  if(!Number.isFinite(t)||t>observed)states.noObservation++;
  else if(at-t>900000)states.historical++;
  else if(r.freshTraversal===true&&r.membership==='no_detected_membership_gaps')states.recentNoDetectedGaps++;
  else states.recentUnproven++;
 }
 const seen=new Set(),recent=[];
 const ordered=[...report.events].sort((a,b)=>ts(b?.observedAt)-ts(a?.observedAt));
 for(const e of ordered){
  const t=ts(e?.observedAt),archived=ts(e?.archivedAt);
  if(e?.kind!=='board_observation'||!Object.hasOwn(report.readiness,e.sport+'/'+e.book)||
   !digest(e.manifestDigest)||seen.has(e.manifestDigest)||!Number.isFinite(t)||!Number.isFinite(archived)||
   t>observed||archived>observed||t>archived+999||
   !['populated','empty','disabled','partial','unknown'].includes(e.state)||counter(e.offers)===null)continue;
  seen.add(e.manifestDigest);
  recent.push({sport:e.sport,platform:e.book,observedAt:e.observedAt,state:e.state,offers:e.offers,
   historical:at-t>900000,source:manifestBase+e.manifestDigest+'.json'});
  if(recent.length===limit)break;
 }
 return {kind:'pickfinder_on_demand_operational_digest_v1',reportAsOf:report.generatedAt,reportUrl,
  registeredScopes:keys.length,states,boardObservations:recent,
  research:{alreadyGraded:counter(report.grading?.alreadyGraded),awaitingIndependentGrade:counter(report.grading?.dueForIndependentGrade)},
  morningScheduleVerifiedFromThisReport:false,discordDeliveryVerifiedFromThisReport:false,
  originalPlatformVerified:false,modelApproved:false,paidRequests:0};
}
module.exports={build};
if(require.main===module)try{
 const fs=require('node:fs');
 const report=JSON.parse(fs.readFileSync(process.argv[2]||'data/pickfinder-public-activity.json','utf8'));
 console.log(JSON.stringify(build(report,new Date().toISOString()),null,2));
}catch{console.error('PickFinder digest unavailable: source report did not pass evidence checks');process.exitCode=1;}
