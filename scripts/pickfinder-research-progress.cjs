'use strict';
const fs=require('node:fs');
const sportName=s=>typeof s==='string'&&/^[a-z0-9-]{1,35}$/.test(s)?s:'other';
const bookName=b=>['prizepicks','underdog'].includes(b)?b:'other';
const validCount=n=>Number.isSafeInteger(n)&&n>=0;
const percent=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
// Latest verified snapshot per partition, not a prediction of future board size.
function boardInventory(batches){
 const latest=new Map();
 for(const b of batches){
  const k=sportName(b.sport)+'/'+bookName(b.book);
  const stamp=Date.parse(b.endedAt||b.finishedAt||b.startedAt)||0;
  if(!latest.has(k)||stamp>=latest.get(k).stamp)latest.set(k,{b,stamp});
 }
 return [...latest.values()].map(({b})=>{
  const pages=new Set((b.pages||[]).map(p=>p.number).filter(n=>validCount(n)&&n>0)).size;
  const total=validCount(b.displayedPageCount)?b.displayedPageCount:['disabled','empty'].includes(b.boardState)?0:null;
  return {sport:sportName(b.sport),book:bookName(b.book),pagesCollected:pages,pagesDisplayed:total,rowsObserved:(b.pages||[]).reduce((n,p)=>n+(p.rows||[]).length,0),traversalComplete:b.lastPageReached===true,boardState:['partial','populated','empty','disabled'].includes(b.boardState)?b.boardState:'unknown'};
 }).sort((a,b)=>(a.sport+a.book).localeCompare(b.sport+b.book));
}
function progressTracker({scopes,completed=new Set(),legacy=new Set(),attempted=new Map(),boards=[],version,log=console.log,summaryPath=process.env.GITHUB_STEP_SUMMARY}){
 const known=new Map(scopes.map(s=>[s.key,{sport:sportName(s.sport),book:bookName(s.book)}]));
 const done=new Set([...completed].filter(k=>known.has(k))),old=new Set([...legacy].filter(k=>known.has(k))),ever=new Set([...attempted.keys()].filter(k=>known.has(k)));
 const thisRun=new Set(),newDone=new Set(),dashboard=new Map(),started=Date.now();let partialAttempts=0,failedAttempts=0,observations=0;
 function snapshot(phase){
  const groups=new Map();
  for(const [k,s] of known){const label=s.sport+'/'+s.book;const x=groups.get(label)||{...s,total:0,completed:0,legacyCompleted:0,attemptedThisRun:0};x.total++;if(done.has(k))x.completed++;if(old.has(k))x.legacyCompleted++;if(thisRun.has(k))x.attemptedThisRun++;groups.set(label,x);}
  const byPartition=[...groups.values()].map(x=>({...x,remaining:x.total-x.completed,percent:percent(x.completed,x.total)})).sort((a,b)=>(a.sport+a.book).localeCompare(b.sport+b.book));
  const bySport={};for(const x of byPartition){const y=bySport[x.sport]??={total:0,completed:0,legacyCompleted:0,attemptedThisRun:0};for(const k of ['total','completed','legacyCompleted','attemptedThisRun'])y[k]+=x[k];}
  for(const y of Object.values(bySport)){y.remaining=y.total-y.completed;y.percent=percent(y.completed,y.total);}
  const byDashboard={};for(const x of dashboard.values()){const d=byDashboard[x.name]??={pagesArchived:0,knownScopePages:0,knownScopeTotal:0,unknownTotalScopes:0};d.pagesArchived+=x.pages.size;if(x.total===null)d.unknownTotalScopes++;else{d.knownScopePages+=x.pages.size;d.knownScopeTotal+=x.total;}}
  return {state:'deep_research_progress',phase,coverageVersion:version,totalPropScopes:known.size,completedPropScopes:done.size,remainingPropScopes:known.size-done.size,percentComplete:percent(done.size,known.size),legacyCompletedScopes:old.size,uniqueCompletedAnyVersion:new Set([...old,...done]).size,attemptedCurrentVersion:ever.size,attemptedThisRun:thisRun.size,completedThisRun:newDone.size,partialAttemptsThisRun:partialAttempts,failedAttemptsThisRun:failedAttempts,observationsArchivedThisRun:observations,elapsedSeconds:Math.floor((Date.now()-started)/1000),bySport,byPartition,latestBoardSnapshots:boards,byDashboard,allDashboardFilterPageTotalsKnown:false,rawRowsPublished:0};
 }
 function report(phase,write=false){const x=snapshot(phase);log(JSON.stringify(x));if(write&&summaryPath){
  const n=v=>v===null?'Unknown':String(v);
  const md=['## PickFinder deep research progress','', 'Coverage: '+version+' — '+phase,'', '| Metric | Count |','|---|---:|', '| Prop research scopes | '+x.totalPropScopes+' |','| Completed (current version) | '+x.completedPropScopes+' |','| Remaining | '+x.remainingPropScopes+' |','| Percent complete | '+n(x.percentComplete)+'% |','| Legacy completed | '+x.legacyCompletedScopes+' |','| Unique complete across versions | '+x.uniqueCompletedAnyVersion+' |','| Attempted this run | '+x.attemptedThisRun+' |','| Completed this run | '+x.completedThisRun+' |','| New observations archived | '+x.observationsArchivedThisRun+' |','','### Research by sport and platform','','| Sport | Platform | Completed | Total | Remaining |','|---|---|---:|---:|---:|',...x.byPartition.map(y=>'| '+y.sport+' | '+y.book+' | '+y.completed+' | '+y.total+' | '+y.remaining+' |'),'','### Latest archived prop boards','','| Sport | Platform | Pages collected | Displayed pages | Rows observed |','|---|---|---:|---:|---:|',...boards.map(y=>'| '+y.sport+' | '+y.book+' | '+y.pagesCollected+' | '+n(y.pagesDisplayed)+' | '+y.rowsObserved+' |'),'','### Dashboard pages this run','','| Dashboard | Archived pages | Known-scope pages | Known-scope total | Unknown-total scopes |','|---|---:|---:|---:|---:|',...Object.entries(x.byDashboard).map(([k,y])=>'| '+k+' | '+y.pagesArchived+' | '+y.knownScopePages+' | '+y.knownScopeTotal+' | '+y.unknownTotalScopes+' |'),'','Counts are archived observations, not guaranteed distinct live offers. The queue is frozen at run start; new boards can expand it. Dashboard/filter totals are not exhaustive. Legacy profiles do not count as completed under the current collector version. No raw Premium data published.',''].join('\n');
  fs.appendFileSync(summaryPath,md+'\n');
 }return x;}
 function record(r){
  if(!known.has(r.key))return;
  thisRun.add(r.key);ever.add(r.key);observations+=Array.isArray(r.research)?r.research.length:0;
  if(r.status==='sampled'&&r.profileCollection?.coverageVersion===version&&r.profileCollection?.truncated===false&&r.research?.length&&!r.profileCollection?.tabAudit?.some(t=>t.state==='failed')){if(!done.has(r.key))newDone.add(r.key);done.add(r.key);}
  else if(r.status==='failed')failedAttempts++;else partialAttempts++;
  const s=known.get(r.key);log(JSON.stringify({state:'deep_scope_checkpoint_verified',...s,completed:done.size,total:known.size,remaining:known.size-done.size,attemptedThisRun:thisRun.size,percentComplete:percent(done.size,known.size),uniqueCompletedAnyVersion:new Set([...old,...done]).size,rawRowsPublished:0}));
  if(thisRun.size%10===0)report('profiles');
 }
 function page(s){
  if(!['Games','Popular','Discrepancies'].includes(s.name))return;
  const k=JSON.stringify([s.name,s.filterSelection||null]);const x=dashboard.get(k)||{name:s.name,pages:new Set(),total:null};
  const p=[...new Map((s.pagination||[]).filter(y=>validCount(y.page)&&validCount(y.total)&&y.page>=1&&y.total>=y.page).map(y=>[y.page+':'+y.total,y])).values()];
  if(p.length===1){if(x.total!==null&&x.total!==p[0].total)x.total=null;else x.total=p[0].total;x.pages.add(p[0].page);}else{x.total=null;x.pages.add('unknown-'+x.pages.size);}
  dashboard.set(k,x);log(JSON.stringify({state:'deep_dashboard_page_verified',dashboard:s.name,scopePagesArchived:x.pages.size,scopeDisplayedPages:x.total,rawRowsPublished:0}));
 }
 return {report,record,page,snapshot};
}
module.exports={boardInventory,progressTracker};
