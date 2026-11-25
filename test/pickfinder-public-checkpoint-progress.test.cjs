'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {summarize,scan}=require('../scripts/pickfinder-public-checkpoint-progress.cjs');
const {ROOT,sha}=require('../scripts/pickfinder-public-archive.cjs'),{VERSION}=require('../scripts/pickfinder-research-coverage.cjs');
const row={sport:'nba',player:'Example Player',market:'points',eventId:'evt1',detailId:'/players/nba/example?prop=points',period:null};
const board=(book,rows=[row])=>({schema:'pickfinder-public-board-part-v1',sport:'nba',book,field:'offers',rows});
const done={...row,status:'sampled',coverageVersion:VERSION,truncated:false,research:[{metric:'points'}]};
test('deduplicates book references and attempts; does not count truncated or stale versions',()=>{
 const x=summarize([board('prizepicks',[row,{...row,eventId:'evt2'}]),board('underdog')],[{records:[done,done,{...done,eventId:'evt2',truncated:true},{...done,eventId:'evt2',coverageVersion:'old'}]}]);
 assert.equal(x.total,2);assert.equal(x.completedSampledScopes,1);assert.equal(x.remaining,1);assert.equal(x.sharedAcrossBooks,1);assert.equal(x.profileAttempts,4);assert.equal(x.bySport.nba.remaining,1);
});
test('hash checks real archive, flags corruption and reports last checkpoint',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pf-progress-'));
 try{
 const git=args=>execFileSync('git',args,{cwd:root,stdio:'ignore'});
 git(['init','-q']);git(['-c','user.name=test','-c','user.email=test@example.com','commit','--allow-empty','-qm','init']);
 function put(kind,doc,corrupt=false){const dir=path.join(root,ROOT,kind);fs.mkdirSync(dir,{recursive:true});const raw=JSON.stringify(doc)+'\n';fs.writeFileSync(path.join(dir,(corrupt?'0'.repeat(64):sha(raw))+'.json'),raw);}
 put('board-parts',board('prizepicks'));put('profiles',{schema:'pickfinder-public-profiles-v1',observedAt:'2026-11-25T13:50:00Z',records:[done]});
 git(['add','.']);git(['-c','user.name=test','-c','user.email=test@example.com','commit','-qm','archive']);
 let x=scan(root);assert.equal(x.completedSampledScopes,1);assert.equal(x.countsComplete,true);assert.equal(x.latestCheckpointAt,'2026-11-25T13:50:00Z');
 put('profiles',{records:[]},true);x=scan(root);assert.equal(x.countsComplete,false);assert.equal(x.invalid.profiles,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
