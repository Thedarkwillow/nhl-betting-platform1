'use strict';
// Bounded manual-only measurement. Benchmark reads never enter the production
// profile queue and never save player, account or provider payloads.
const {performance}=require('node:perf_hooks');
const {walkBoards}=require('./pickfinder-public-evidence-audit.cjs');
const {assertDestination,sha,persist}=require('./pickfinder-public-archive.cjs');
const {profileBenchmarkScope,publicProfile,waitPremium}=require('./pickfinder-public-runner.cjs');
const {target,readVisible}=require('./pickfinder-public-nba-context.cjs');
const {protectedMorningClock}=require('./pickfinder-public-morning-preflight.cjs');
const {pacific}=require('./pacific-morning-capture-gate.cjs');
const {openHostedBoard}=require('./pickfinder-unattended-runner.cjs');
const {enrich}=require('./pickfinder-player-research.cjs');
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const ORDER=[1,2,2,1],SIZE=4,MAX_MS=7*60000;

function select(archive){
 if(archive?.m?.authenticated!==true||archive.m.pageTraversalComplete!==true||archive.m.boardState!=='populated'||
 !['nba','nhl','nfl'].includes(archive.m.sport)||!['prizepicks','underdog'].includes(archive.m.book)||!hash(archive.digest))return [];
 const seen=new Set(),out=[];
 const entries=archive.offers.filter(o=>o.sport===archive.m.sport&&o.book===archive.m.book&&o.period==null&&o.mapRange==null&&o.gameMode==null&&Number.isFinite(o.line))
  .sort((a,b)=>sha(a.detailId||'').localeCompare(sha(b.detailId||'')));
 for(const row of entries){
  const t=target(row);if(!t||seen.has(t.playerPath))continue;
  seen.add(t.playerPath);out.push({...row,books:[row.book],key:sha(t.detailId)});
  if(out.length===SIZE)break;
 }
 return out;
}

// Report only fixed code-owned labels, never a provider field name or selector.
const PROFILE_GROUPS=new Map([
 ['Player overview','overview'],['Matchup','matchup'],['Defense','defense'],
 ['Shooting','shooting'],['Player Stats','player_stats'],
 ['Splits','splits'],['Season','season'],['Injuries','availability'],
 ['Depth Chart','availability'],['Lineups','availability']
]);
const GROUPS=[...new Set(PROFILE_GROUPS.values()),'other_profile','line_movement','prop_history'];
function fieldShapes(fields){
 const byGroup=Object.fromEntries(GROUPS.map(group=>[group,[]]));
 for(const f of fields){
  const group=f.origin==='profile'?PROFILE_GROUPS.get(f.tab)??'other_profile':f.origin;
  if(!Object.hasOwn(byGroup,group))continue;
  byGroup[group].push(JSON.stringify([f.origin,f.tab,f.scope,f.metric,f.period,f.mapRange,f.gameMode,f.window,f.filterSelection]));
 }
 return byGroup;
}
function difference(reference,candidate){
 if(!reference||!candidate||GROUPS.some(origin=>!Array.isArray(reference[origin])||!Array.isArray(candidate[origin])))return null;
 return Object.fromEntries(GROUPS.map(origin=>{
  const counts=new Map();
  for(const [direction,shapes] of [[1,reference[origin]],[-1,candidate[origin]]]){
   for(const shape of shapes)counts.set(shape,(counts.get(shape)??0)+direction);
  }
  const totals={missing:0,extra:0};
  for(const n of counts.values())if(n>0)totals.missing+=n;else totals.extra-=n;
  return [origin,totals];
 }));
}
function compareReadShapes(reference,profiles){
 const totals=Object.fromEntries(GROUPS.map(origin=>[origin,{missing:0,extra:0}]));
 let mismatchedReads=0;
 for(let i=0;i<reference.length;i++){
  const diff=difference(reference[i].shapesByGroup,profiles[i].shapesByGroup);
  if(!diff)return null;
  if(GROUPS.some(origin=>diff[origin].missing||diff[origin].extra))mismatchedReads++;
  for(const origin of GROUPS){
   totals[origin].missing+=diff[origin].missing;
   totals[origin].extra+=diff[origin].extra;
  }
 }
 return {mismatchedReads,byGroup:totals};
}
function publicArm(result){
 return {...result,profileResults:result.profileResults.map(({shapesByGroup,...summary})=>summary)};
}

function compare(arms,digest){
 if(!hash(digest)||arms.length!==ORDER.length)return {status:'incomplete_trial',parallelRecommended:false};
 const complete=arms.every((a,i)=>a.workers===ORDER[i]&&a.cohortDigest===digest&&a.profileResults?.length===SIZE&&
  Number.isFinite(a.wallMs)&&a.wallMs>0&&a.profileResults.every(r=>r.authenticated===true&&r.complete===true&&r.fields>0&&hash(r.fieldShape)));
 if(!complete)return {status:'incomplete_or_unauthenticated_arm',parallelRecommended:false};
 const reference=arms[0].profileResults;
 const parity=arms.every(a=>a.profileResults.every((r,i)=>r.fields===reference[i].fields&&r.fieldShape===reference[i].fieldShape));
 const means=Object.fromEntries([1,2].map(n=>[n,arms.filter(a=>a.workers===n).reduce((s,a)=>s+a.wallMs,0)/2]));
 const gain=1-means[2]/means[1];
 return {status:parity?'matched_abba_evidence':'field_parity_not_met',parity,meanByWorkerMs:means,gain,
  bothPairedRunsFaster:arms[1].wallMs<arms[0].wallMs&&arms[2].wallMs<arms[3].wallMs,
  shapeDiagnostics:arms.slice(1).map((a,i)=>({ordinal:i+2,workers:a.workers,counts:compareReadShapes(reference,a.profileResults)})),
  parallelRecommended:false,measurementOnly:true,productionConcurrencyChanged:false};
}

async function executeArm({context,cohort,workers,alive,current=performance.now.bind(performance),probe}){
 const pages=[],profileResults=[],opened=current();
 let wallStart=null;
 try{
  for(let i=0;i<workers&&alive();i++){
   const page=await context.newPage();page.setDefaultTimeout(5000);pages.push(page);
  }
  const tabSetupMs=current()-opened;
  wallStart=current();
  for(let i=0;pages.length===workers&&i<cohort.length&&alive();i+=workers){
   const result=await Promise.allSettled(cohort.slice(i,i+workers).map((row,j)=>probe(pages[j],row,alive)));
   profileResults.push(...result.map(r=>r.status==='fulfilled'?r.value:{authenticated:false,complete:false,fields:0,fieldShape:null,navMs:0,readMs:0,bytes:0}));
   if(result.some(r=>r.status==='rejected'||r.value.authenticated!==true))break;
  }
  const wallMs=Math.round(current()-wallStart);
  return {workers,wallMs,tabSetupMs:Math.round(tabSetupMs),profileResults,
   navigationAggregateMs:profileResults.reduce((sum,r)=>sum+r.navMs,0),featureReadAggregateMs:profileResults.reduce((sum,r)=>sum+r.readMs,0),
   normalizedProfileBytes:profileResults.reduce((sum,r)=>sum+r.bytes,0)};
 }finally{await Promise.allSettled(pages.map(p=>p.close()));}
}
async function probe(page,item,alive){
 const row={...item,research:[]},t=performance.now();let navMs=0,authenticated=false,route=false;
 try{
  await enrich(page,row,{expanded:true,fullSportingHeaders:true,maxFields:Infinity,includePropHistory:false,probeSportsbookMovement:false,shouldContinue:alive,
   navigate:async url=>{const start=performance.now();try{
    await page.goto(url,{timeout:10000});
    authenticated=await waitPremium(page);if(!authenticated)throw Error('session');
    // The intended player and prop route must remain bound in both arms.
    const visible=await page.evaluate(readVisible,{player:row.player,detailId:row.detailId});
    route=visible?.routeVerified===true&&visible?.playerLabelVerified===true;
    if(!route)throw Error('route');
   }finally{navMs=performance.now()-start;}}});
 }catch{row.profileCollection={truncated:true};}
 const safe=publicProfile(row),shapesByGroup=fieldShapes(safe.research),shape=Object.values(shapesByGroup).flat().sort();
 return {authenticated,complete:route&&safe.truncated===false&&safe.status==='sampled',fields:shape.length,
  fieldShape:shape.length?sha(JSON.stringify(shape)):null,navMs:Math.round(navMs),readMs:Math.round(Math.max(0,performance.now()-t-navMs)),
  bytes:Buffer.byteLength(JSON.stringify(safe)),shapesByGroup};
}
async function main(root,env){
 if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/main'||env.PICKFINDER_AUTOMATION_AUTHORIZED!=='1'||!hash(env.BOARD_DIGEST))throw Error('manual-only');
 if(protectedMorningClock(pacific(new Date())))return {state:'protected_morning_hour',providerRequests:0};
 assertDestination(root);
 const [board]=[...walkBoards(root,null,[env.BOARD_DIGEST])],cohort=select(board?.entry);
 if(cohort.length!==SIZE)throw Error('insufficient_cohort');
 const scope=profileBenchmarkScope(cohort,{currentProfiles:true});
 if(!hash(scope.cohortDigest))throw Error('invalid_cohort');
 const until=Date.now()+MAX_MS,alive=()=>Date.now()<until&&!protectedMorningClock(pacific(new Date()));
 if(!alive())return {state:'protected_morning_hour',providerRequests:0};
 const {chromium}=require('playwright');
 const {context}=await openHostedBoard(chromium,env);
 const arms=[],checkpoints=[];
 try{
  for(const workers of ORDER){
   if(!alive())break;
   const result={...await executeArm({context,cohort,workers,alive,probe}),cohortDigest:scope.cohortDigest};
   arms.push(result);
   const at=performance.now();
   const proof=await persist(root,'capabilities',{schema:'pickfinder-worker-benchmark-arm-v1',
    runId:env.GITHUB_RUN_ID??null,ordinal:arms.length,observedAt:new Date().toISOString(),scope,
    fixtureBoardDigest:env.BOARD_DIGEST,...publicArm(result),profileRowsPublished:false,accountMutations:0,paidApiRequests:0});
   checkpoints.push({digest:proof.digest,archiveMs:Math.round(performance.now()-at)});
   if(result.profileResults.length!==SIZE||result.profileResults.some(r=>!r.authenticated))break;
  }
 }finally{await context.close();}
 const result=compare(arms,scope.cohortDigest);
 const report={schema:'pickfinder-worker-benchmark-v1',observedAt:new Date().toISOString(),runId:env.GITHUB_RUN_ID??null,
  scope,fixtureBoardDigest:env.BOARD_DIGEST,experiment:'ABBA one and two tabs in one verified Premium session',order:ORDER,
  checkpoints,armResults:arms.map(({profileResults,...x})=>({...x,completedProfileCount:profileResults.filter(y=>y.complete).length})),
  ...result,archiveTimingMeasuresAggregateCheckpointsOnly:true,profileRowsPublished:false,accountMutations:0,paidApiRequests:0};
 const ref=await persist(root,'capabilities',report);
 return {...report,digest:ref.digest};
}
module.exports={select,executeArm,compare,fieldShapes,publicArm,ORDER,SIZE};
if(require.main===module)main(process.cwd(),process.env).then(r=>console.log(JSON.stringify(r))).catch(()=>{
 console.error('PickFinder manual worker benchmark withheld without a verified capture or checkpoint');process.exitCode=1;
});
