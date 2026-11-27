'use strict';
const t=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {publish,validate}=require('../scripts/publish-pickfinder-derived.cjs');
const file='data/prizepicks-model-rankings.json';
const at=Date.parse('2026-11-27T08:00:00Z');
const ranking=(generatedAt='2026-11-27T07:55:00Z')=>JSON.stringify({kind:'public_prizepicks_model_ranking_v1',generatedAt,paidRequests:0,modelApproved:false,originalPlatformVerified:false,privateRepoUsed:false,calibrated:false,researchOnly:true,rows:[]});
const git=(d,...args)=>execFileSync('git',['-C',d,...args],{stdio:['ignore','pipe','pipe']}).toString().trim();
const commit=(d,msg)=>git(d,'-c','user.name=fixture','-c','user.email=fixture@example.org','commit','-qm',msg);
const write=(d,p,s)=>{const f=path.join(d,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);};
t('only expected non-promoted generated reports can be published',()=>{
 a.throws(()=>validate(ranking(),'data/frozen-forecasts.json',at),/allowlist/);
 a.throws(()=>validate(ranking().replace('"paidRequests":0','"paidRequests":1'),file,at),/contract/);
 a.throws(()=>validate(ranking('2026-11-27T08:01:00Z'),file,at),/contract/);
});
t('racing a new main commit retries without reverting it, then never overwrites a newer report',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-pub-test-'));try{
  const remote=path.join(dir,'bare'),peer=path.join(dir,'peer'),primary=path.join(dir,'primary');
  git(dir,'init','--bare','-q','-b','main',remote);git(dir,'clone','-q',remote,peer);
  write(peer,'immutable.txt','original');git(peer,'add','immutable.txt');commit(peer,'initial');git(peer,'push','-q','origin','main');
  git(dir,'clone','-q',remote,primary);
  write(primary,file,ranking());write(primary,'immutable.txt','private local modification must not publish');
  const now=()=>at,backoff=()=>{};
  const outcome=await publish(primary,file,{now,backoff,beforePush:({i})=>{if(i===0){
   write(peer,'immutable.txt','independent concurrent change');
   git(peer,'add','immutable.txt');commit(peer,'concurrent');git(peer,'push','-q','origin','main');
  }}});
  a.equal(outcome.status,'published_and_verified');a.equal(git(remote,'show','main:immutable.txt'),'independent concurrent change');
  a.equal(git(remote,'show','main:'+file),ranking());
  git(peer,'pull','-q','--ff-only');
  write(peer,file,ranking('2026-11-27T07:58:00Z'));git(peer,'add',file);commit(peer,'newer');git(peer,'push','-q','origin','main');
  const after=await publish(primary,file,{now,backoff});
  a.equal(after.status,'already_current_or_newer');a.equal(git(remote,'show','main:'+file),ranking('2026-11-27T07:58:00Z'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
