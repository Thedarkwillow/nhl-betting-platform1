'use strict';
// Public sporting evidence only; derived board observations are NOT native push/Discord notifications.
const fs=require('node:fs'),path=require('node:path');
const {load,coverage,git}=require('./pickfinder-public-evidence-audit.cjs');
const {read,sha}=require('./pickfinder-public-archive.cjs');
const cache=require('./pickfinder-public-history-cache.cjs');
const {history,gradingQueue}=require('./pickfinder-public-model-validation.cjs');
const dt=Date.parse,valid=x=>Number.isFinite(dt(x)),digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const sports=new Set(['nba','nhl','nfl','cs2','dota2','valorant','lol','cod','mlb','wnba','college-football','college-basketball','tennis','soccer']);
const core=['nba','nhl','nfl','cs2','dota2','valorant','lol','cod'];
const books=new Set(['prizepicks','underdog']);
function usable(a,at){
 return a&&digest(a.digest)&&sports.has(a.m?.sport)&&books.has(a.m?.book)&&valid(a.m.lastObservedAt)&&valid(a.first)&&dt(a.m.lastObservedAt)<=at&&dt(a.first)<=at&&dt(a.m.lastObservedAt)<=dt(a.first)+999;
}
function build(archive,clock,{cacheSummary=null,researchCoverage=null,grading=null}={}){
 const at=dt(clock);if(!Number.isFinite(at))throw Error('clock');
 const eligible=(archive.manifests||[]).filter(a=>usable(a,at)).sort((a,b)=>dt(a.m.lastObservedAt)-dt(b.m.lastObservedAt)||a.digest.localeCompare(b.digest));
 const latest=new Map(),events=new Map(),invalid=archive.invalid.length;
 if(!invalid)for(const a of eligible){
  const m=a.m,k=m.sport+'/'+m.book,old=latest.get(k);
  const observedState=['populated','empty','disabled','partial'].includes(m.boardState)?m.boardState:'unknown';
  const event={kind:'board_observation',sport:m.sport,book:m.book,observedAt:m.lastObservedAt,archivedAt:a.first,manifestDigest:a.digest,state:observedState,offers:Array.isArray(a.offers)?a.offers.length:0,slot:['06:00','09:00','manual'].includes(m.slot)?m.slot:'unknown',nativeNotificationVerified:false};
  event.id=sha(JSON.stringify([event.kind,a.digest]));events.set(event.id,event);
  // A newly observed populated board is not a release event unless a separately verified native alert exists.
  latest.set(k,{a,event});
 }
 const readiness={};
 for(const sport of core)for(const book of books){
  const k=sport+'/'+book,x=latest.get(k),a=x?.a,offers=a?.offers||[];
  const age=a?Math.max(0,at-dt(a.m.lastObservedAt)):null;
  const current=!!a&&age<=15*60000&&a.m.boardState==='populated'&&a.m.pageTraversalComplete===true;
  const fresh=offers.filter(o=>o.sport===sport&&o.book===book&&valid(o.observedAt)&&dt(o.observedAt)<=at&&at-dt(o.observedAt)<=15*60000&&valid(o.startAt)&&dt(o.startAt)>at+900000&&o.detailId&&o.eventId&&o.player&&Number.isFinite(o.line)&&['Higher','Lower'].includes(o.side));
  readiness[k]={observedAt:a?.m.lastObservedAt??null,ageMs:age,boardState:x?.event.state??'unknown',freshCompleteBoard:current,observedOffers:offers.length,freshClockScopedOffers:current?fresh.length:0,reason:invalid?'invalid_archive':!a?'no_observation':!current?'fresh_complete_populated_board_missing':!fresh.length?'exact_pregame_source_clock_missing':'independent_identity_and_result_validation_required'};
 }
 return {kind:'public_pickfinder_activity_readiness_v1',generatedAt:clock,archiveInvalid:invalid,events:[...events.values()].sort((a,b)=>dt(b.observedAt)-dt(a.observedAt)||a.id.localeCompare(b.id)).slice(0,100),readiness,cache:cacheSummary,coverage:researchCoverage,grading,delivery:{website:'public_derived_activity',nativePickFinder:'unverified',discord:'destination_not_configured',nativeMobile:'unverified'},paidRequests:0,originalPlatformVerified:false,modelApproved:false};
}
function run(root,clock=new Date().toISOString()){
 const archive=load(root);
 const cached=cache.audit(read(root,'profiles'),new Date(clock));
 const c=coverage(root);
 const frames=history(root,'nba-forecasts'),grades=history(root,'nba-grades');
 const prior=new Set(grades.flatMap(x=>(x.doc.rows||[]).map(y=>y.id)));
 const g=gradingQueue(frames,prior,clock);
 const report=build(archive,clock,{cacheSummary:cached,researchCoverage:{profileAttempts:c.profileAttempts??null,namedDashboardSnapshots:c.namedDashboardSnapshots??null,gameDialogObservations:c.gameDialogObservations??null},grading:{archivedPregameRows:g.archived,pendingNotDue:g.pendingNotDue,dueForIndependentGrade:g.selected.length,alreadyGraded:g.alreadyGraded,invalidPregameRows:g.invalid,gradeFrames:grades.length}});
 fs.writeFileSync(path.join(root,'data/pickfinder-public-activity.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({kind:report.kind,events:report.events.length,archiveInvalid:report.archiveInvalid,readiness:report.readiness,cache:report.cache,coverage:report.coverage,grading:report.grading,paidRequests:0}));
 return report;
}
module.exports={build,run};
if(require.main===module)try{run(fs.realpathSync(process.argv[2]||'.'));}catch{console.error('Public PickFinder activity failed closed');process.exitCode=1;}
