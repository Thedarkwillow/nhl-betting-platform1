'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {traverseDashboardFilters,verifyDashboardSequence,dashboardSequenceSchema}=require('../scripts/pickfinder-dashboard-research.cjs');
const {ROOT,sha}=require('../scripts/pickfinder-public-archive.cjs');
const {coverage}=require('../scripts/pickfinder-public-evidence-audit.cjs');
const quotedPage=(i,total=2)=>({schema:'pickfinder-public-dashboard-v1',name:'Games',path:'/games',filterSelection:null,dataState:'data_observed',
 observedAt:'2026-11-27T21:00:0'+i+'Z',cards:[{text:'verified page '+i}],pagination:[{page:i,total}]});
const receipt=(pageDigests)=>({schema:dashboardSequenceSchema,name:'Games',path:'/games',filterSelection:null,
 observedAt:'2026-11-27T21:00:05Z',allDashboardDataVerified:false,filtersExhausted:false,pageDigests});
const digest=x=>sha(JSON.stringify(x));

test('traversal checkpoints a terminal receipt only after all observed page hashes are available',async()=>{
 const mock=(stopAfter=2)=>{
  let i=1;const page={url:()=> 'https://www.pickfinder.app/games',evaluate:async fn=>
   typeof fn==='function'&&fn.name?[]:{tables:[],cards:[{page:i}],clocks:[],controls:[],pagination:[{page:i,total:2}]},
   getByRole:()=>({count:async()=>1,isVisible:async()=>true,isEnabled:async()=>i<stopAfter,click:async()=>{i++;}}),waitForFunction:async()=>{}};
  return page;
 };
 for(const [page,hashes,expected] of [[mock(),true,1],[mock(),false,0],[mock(1),true,0]]){
  const pages=new Map(),proofs=[];
  await traverseDashboardFilters(page,'Games',{
   onSnapshot:x=>{const d={schema:'pickfinder-public-dashboard-v1',...x},id=digest(d);pages.set(id,d);return hashes?id:null;},
   onSequence:r=>{proofs.push(r);}
  });
  assert.equal(proofs.length,expected);
  if(expected)assert.equal(verifyDashboardSequence(proofs[0],pages),true);
 }
});
test('sequence replays reject wrong filter or path, replayed content, bad clocks and skipped pages',()=>{
 const p=quotedPage(1),q=quotedPage(2),pd=digest(p),qd=digest(q),r=receipt([pd,qd]);
 assert.equal(verifyDashboardSequence(r,new Map([[pd,p],[qd,q]])),true);
 for(const obj of [
  {...q,filterSelection:[]},{...q,path:'/game-lines'},{...q,cards:p.cards,clocks:[{datetime:'2026-11-27T21:00:02Z'}]},
  {...q,observedAt:'2026-11-27T20:58:00Z'},{...q,observedAt:'2026-11-27T21:00:06Z'},{...q,pagination:[{page:2,total:3}]},
  {...q,pagination:[{page:2,total:2},{page:2,total:3}]},{...q,cards:[],dataState:'explicit_empty'}
 ]){
  const id=digest(obj);assert.equal(verifyDashboardSequence(receipt([pd,id]),new Map([[pd,p],[id,obj]])),false);
 }
 for(const ids of [[qd,pd],[qd],[pd,pd],[pd,'a'.repeat(64)]])assert.equal(verifyDashboardSequence({...r,pageDigests:ids},new Map([[pd,p],[qd,q]])),false);
});
test('archive report distinguishes verified sequences from sampled data, explicit emptiness and proof failures',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-dashboard-'));
 try{
  const dir=path.join(tmp,ROOT,'dashboards');fs.mkdirSync(dir,{recursive:true});
  const add=d=>{const raw=JSON.stringify(d),id=sha(raw);fs.writeFileSync(path.join(dir,id+'.json'),raw);return id;};
  const p=add(quotedPage(1)),q=add(quotedPage(2));
  add(receipt([p,q]));
  add({...receipt([p,q]),observedAt:'2026-11-27T21:00:06Z'});
  add(receipt([q]));
  add({...quotedPage(1),name:'Discrepancies',path:'/discrepancies',cards:[],pagination:[],empty:true,dataState:'explicit_empty'});
  add({...quotedPage(1),name:'Popular',path:'/popular',cards:[],pagination:[],dataState:'unverified'});
  const c=coverage(tmp);
  assert.equal(c.dashboardSnapshots,4);assert.equal(c.namedDashboardSnapshots,4);
  assert.equal(c.verifiedDashboardSequences,1);assert.equal(c.unverifiedDashboardSequences,1);
  assert.deepEqual(c.dashboardEvidence.Games,{dataSnapshots:2,explicitEmptySnapshots:0,unverifiedSnapshots:0,withExplicitPage:2,verifiedSequences:1});
  assert.equal(c.dashboardEvidence.Discrepancies.explicitEmptySnapshots,1);
  assert.equal(c.dashboardEvidence.Popular.unverifiedSnapshots,1);
  assert.equal(c.allFiltersVerified,false);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('public website renders archive limitations and quote clocks in an offline DOM harness',async()=>{
 const {runInNewContext}=require('node:vm');
 class Item {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.value='all';}
  append(item){this.children.push(item);}
  setAttribute(){}
  addEventListener(){}
 }
 const mount=new Item('div'),stats={dataSnapshots:6,explicitEmptySnapshots:0,unverifiedSnapshots:4,withExplicitPage:0,verifiedSequences:0};
 const source=fs.readFileSync(path.join(__dirname,'../assets/pickfinder-public-evidence.js'),'utf8');
 const docs={
  './data/pickfinder-public-research-health.json':{schema:'pickfinder_public_research_health_v1',generatedAt:'2026-11-27T21:00:04Z',
   researchCoverage:{allFiltersVerified:false,dashboardEvidence:{Games:stats}}},
  './data/pickfinder-public-activity.json':{kind:'public_pickfinder_activity_readiness_v1',modelApproved:false,
   profileMarketEvidence:{historicalRows:52,distinctUnconflictedPairedGroups:44,unzonedPairedGroups:44,offsetBoundNoVigPairedGroups:0}}
 };
 await runInNewContext(source,{
  document:{getElementById:()=>mount,createElement:x=>new Item(x)},
  fetch:async key=>({ok:key in docs,json:async()=>docs[key]})
 });
 const findAll=(x,tag)=>[...(x.tag===tag?[x]:[]),...x.children.flatMap(c=>findAll(c,tag))];
 assert.ok(findAll(mount,'p').some(x=>x.textContent.includes('44 unzoned pairs withheld')&&x.textContent.includes('0 offset-backed')));
 assert.ok(findAll(mount,'p').some(x=>x.textContent.includes('not evidence of offseason or full filter coverage')));
 assert.deepEqual(findAll(mount,'tbody').at(-1).children[0].children.map(x=>x.textContent),['Games','6','0','4','0','0']);
});
