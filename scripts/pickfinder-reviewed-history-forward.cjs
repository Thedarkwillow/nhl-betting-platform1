'use strict';

// Append-only shadow forecast and grading, with no provider requests.
const fs=require('node:fs'),path=require('node:path');
const {git,load}=require('./pickfinder-public-evidence-audit.cjs');
const {history,save}=require('./pickfinder-public-model-validation.cjs');
const {committedProfiles}=require('./pickfinder-archived-model-inputs.cjs');
const {indexFromArchive,fromArchive}=require('./pickfinder-native-history-reconciliation.cjs');
const {fromArchive:nativeContext}=require('./prizepicks-native-context-readiness.cjs');
const {generate}=require('./native-individual-research.cjs');
const {finalFor,policy}=require('./pickfinder-reviewed-history-model.cjs');

const dt=Date.parse,hash=x=>/^[a-f0-9]{64}$/.test(x||'');
const revision=x=>/^[a-f0-9]{40}$/.test(x||'');
const forecastFolder='nhlnfl-reviewed-history-forecasts',gradeFolder='nhlnfl-reviewed-history-grades';
const forecastKind='pickfinder_nhlnfl_reviewed_history_shadow_forecasts_v1';
const gradeKind='pickfinder_nhlnfl_reviewed_history_shadow_grades_v1';
const methods=['existing','reviewed','challenger','neutral'],sports=new Set(['NHL','NFL']);
const scopeId=p=>JSON.stringify([p.sport,String(p.gameId),String(p.playerId),p.market,p.line,p.side]);
const secureProb=q=>Number.isFinite(q)&&q>=0&&q<=1;
const time=x=>Number.isFinite(dt(x));
const now=()=>new Date().toISOString();

function eligibleCurrent(archive,clock){
 const at=dt(clock);
 return archive.latest.filter(b=>sports.has(b.m.sport.toUpperCase())&&hash(b.digest)&&time(b.first)&&dt(b.first)<=at)
  .map(b=>({...b,offers:b.offers.filter(o=>o.sport===b.m.sport&&o.book===b.m.book&&time(o.startAt)&&dt(o.startAt)>at+900000&&
   time(o.observedAt)&&dt(o.observedAt)<=at&&at-dt(o.observedAt)<=300000&&dt(o.observedAt)<=dt(b.first)+999)}))
  .filter(b=>b.offers.length);
}

function currentFromArchive(root,sport,clock){
 const archive=load(root,sport);
 if(archive.invalid.length)throw Error('invalid public archive');
 return eligibleCurrent(archive,clock);
}

function validPair(p){
 const a=p.reviewedHistoryPair;
 return sports.has(p.sport)&&p.gameId&&p.playerId&&p.market&&p.team&&p.opponent&&p.team!==p.opponent&&
  ['Higher','Lower'].includes(p.side)&&Number.isFinite(p.line)&&p.line>=0&&p.line%1===.5&&p.researchOnly===true&&
  p.modelApproved===false&&p.originalPlatformVerified===false&&time(p.startAt)&&time(p.forecastAt)&&
  time(p.sourceObservedAt)&&dt(p.sourceObservedAt)<=dt(p.forecastAt)&&dt(p.forecastAt)-dt(p.sourceObservedAt)<=300000&&
  dt(p.forecastAt)+900000<dt(p.startAt)&&hash(p.manifestDigest)&&revision(p.modelRevision)&&
  a?.policy===policy&&a.modelApproved===false&&methods.every(m=>secureProb(a[m]))&&a.neutral===.5&&
  a.challenger===(a.existing+a.reviewed)/2&&typeof a.nativeMetric==='string'&&
  Number.isSafeInteger(a.reviewedObservations)&&a.reviewedObservations>=5&&
  Array.isArray(a.reviewDigests)&&a.reviewDigests.length>0&&a.reviewDigests.every(hash);
}

function committedForecasts(frames,clock){
 const found=new Map(),conflict=new Set();
 for(const f of frames){
  if(f.doc.kind!==forecastKind||!hash(f.digest)||!time(f.first)||dt(f.first)>dt(clock))continue;
  for(const p of f.doc.rows||[]){
   if(!validPair(p)||dt(p.forecastAt)>dt(f.first)+999||dt(f.first)+900000>=dt(p.startAt))continue;
   const id=scopeId(p),old=found.get(id);
   if(old&&dt(old.first)===dt(f.first)&&JSON.stringify(old.p.reviewedHistoryPair)!==JSON.stringify(p.reviewedHistoryPair))conflict.add(id);
   else if(!old||dt(f.first)<dt(old.first)){found.set(id,{id,p,first:f.first,digest:f.digest});conflict.delete(id);}
  }
 }
 for(const id of conflict)found.delete(id);
 return found;
}

function newRows(rows,existing,clock){
 const at=dt(clock);
 const groups=new Map(),conflicts=new Set();
 for(const p of rows){
  if(!validPair(p)||dt(p.forecastAt)>at||at-dt(p.sourceObservedAt)>300000||dt(p.startAt)<=at+900000)continue;
  const id=scopeId(p),old=groups.get(id);
  if(existing.has(id))continue;
  if(old&&JSON.stringify(old.reviewedHistoryPair)!==JSON.stringify(p.reviewedHistoryPair))conflicts.add(id);
  else if(!old||dt(p.sourceObservedAt)<dt(old.sourceObservedAt))groups.set(id,p);
 }
 return [...groups].filter(([id])=>!conflicts.has(id)).map(([,p])=>p);
}

function results(forecasts,independent,clock){
 const rows=[];
 for(const f of forecasts.values()){
  if(dt(f.p.startAt)>=dt(clock))continue;
  const final=finalFor(f.p,independent,clock);
  if(!final)continue;
  rows.push({id:f.id,forecastDigest:f.digest,officialFinalDigest:final.digest,officialFinalAvailableAt:final.availableAt,
   actual:final.actual,outcome:Number(f.p.side==='Higher'?final.actual>f.p.line:final.actual<f.p.line)});
 }
 return rows;
}

function scoreboard(forecasts,grades){
 const bySport={NHL:{},NFL:{}};
 for(const g of grades){
  const f=forecasts.get(g.id),p=f?.p;
  if(!p)continue;
  const row=bySport[p.sport][p.market]??={graded:0,games:new Set(),scores:Object.fromEntries(methods.map(m=>[m,{brier:0,logLoss:0}]))};
  row.graded++;row.games.add(String(p.gameId));
  for(const m of methods){
   const q=p.reviewedHistoryPair[m];
   row.scores[m].brier+=(q-g.outcome)**2;
   row.scores[m].logLoss-=Math.log(Math.max(.0001,g.outcome?q:1-q));
  }
 }
 for(const sport of Object.values(bySport))for(const row of Object.values(sport)){
  row.distinctGames=row.games.size;delete row.games;
  for(const m of methods){row.scores[m].brier/=row.graded;row.scores[m].logLoss/=row.graded;}
 }
 return bySport;
}

function run(root,clock=now){
 const at=clock(),commit=git(root,['rev-parse','HEAD']);
 const candidates=[...currentFromArchive(root,'nhl',at),...currentFromArchive(root,'nfl',at)];
 const forecasts=committedForecasts(history(root,forecastFolder),at);
 const needFinals=[...forecasts.values()].some(f=>dt(f.p.startAt)<dt(at));
 const native=candidates.length||needFinals?indexFromArchive(root,at):null;
 const official=native?results(forecasts,native,at):[];
 const officialById=new Map(official.map(g=>[g.id,g])),committed=new Map();
 for(const frame of history(root,gradeFolder)){
  if(frame.doc.kind!==gradeKind||!time(frame.first)||dt(frame.first)>dt(at))continue;
  for(const g of frame.doc.rows||[]){
   const verified=officialById.get(g.id);
   if(verified&&verified.forecastDigest===g.forecastDigest&&verified.officialFinalDigest===g.officialFinalDigest&&
     verified.actual===g.actual&&verified.outcome===g.outcome&&dt(verified.officialFinalAvailableAt)<=dt(frame.first))committed.set(g.id,g);
  }
 }
 let freezes=[];
 if(candidates.length){
  const context=nativeContext(root,at,commit,{manifests:candidates,latest:candidates,invalid:[]});
  if(context.scopes.length){
   const reviewed=fromArchive(root,committedProfiles(root),at,native).reviewedCache;
   freezes=newRows(generate(context,[],reviewed).rows,forecasts,clock());
  }
 }
 const newGrades=official.filter(g=>!committed.has(g.id)),generatedAt=clock();
 if(freezes.length)save(root,forecastFolder,{kind:forecastKind,generatedAt,rows:freezes,modelApproved:false});
 if(newGrades.length)save(root,gradeFolder,{kind:gradeKind,generatedAt,rows:newGrades,modelApproved:false});
 const report={kind:'pickfinder_nhlnfl_reviewed_history_performance_v1',policy,generatedAt,
  explicitCurrentOfferReferences:candidates.reduce((n,x)=>n+x.offers.length,0),
  pregameCommitted:forecasts.size,newlyStagedForecasts:freezes.length,independentCommittedGrades:committed.size,
  newlyStagedGrades:newGrades.length,bySport:scoreboard(forecasts,committed.values()),
  retrospective:false,productionChanged:false,modelApproved:false,paidRequests:0};
 const dir=path.join(root,'data');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'pickfinder-reviewed-history-performance.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
module.exports={eligibleCurrent,committedForecasts,newRows,results,scoreboard,run};
if(require.main===module)try{console.log(JSON.stringify(run(process.cwd())));}catch{console.error('NHL/NFL PickFinder shadow verification failed closed');process.exitCode=1;}
