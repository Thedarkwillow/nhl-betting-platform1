'use strict';
const t=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {publish,validate}=require('../scripts/publish-pickfinder-derived.cjs');
const {createHash}=require('node:crypto');
const file='data/prizepicks-model-rankings.json';
const healthFile='data/pickfinder-public-research-health.json';
const root='research/pickfinder-public-validation-v1/';
const at=Date.parse('2026-11-27T08:00:00Z');
const ranking=(generatedAt='2026-11-27T07:55:00Z')=>JSON.stringify({kind:'public_prizepicks_model_ranking_v1',generatedAt,paidRequests:0,modelApproved:false,originalPlatformVerified:false,privateRepoUsed:false,calibrated:false,researchOnly:true,rows:[]});
const health=(generatedAt='2026-11-27T07:55:00Z')=>JSON.stringify({schema:'pickfinder_public_research_health_v1',generatedAt,paidRequests:0,modelApproved:false,originalPlatformVerified:false,privateRepoUsed:false,bySport:{},independentGrading:{}});
const git=(d,...args)=>execFileSync('git',['-C',d,...args],{stdio:['ignore','pipe','pipe']}).toString().trim();
const commit=(d,msg)=>git(d,'-c','user.name=fixture','-c','user.email=fixture@example.org','commit','-qm',msg);
const write=(d,p,s)=>{const f=path.join(d,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);};
const receipt=(d,k,doc)=>{
 const raw=JSON.stringify(doc)+'\n',p=root+k+'/'+createHash('sha256').update(raw).digest('hex')+'.json';
 write(d,p,raw);git(d,'add','--',p);return {p,raw};
};
function fixture(work){
 return async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pf-val-pub-'));
  try{
   const remote=path.join(dir,'bare'),peer=path.join(dir,'peer'),primary=path.join(dir,'primary');
   git(dir,'init','--bare','-q','-b','main',remote);git(dir,'clone','-q',remote,peer);
   write(peer,healthFile,health('2026-11-27T07:50:00Z'));git(peer,'add',healthFile);commit(peer,'initial');
   git(peer,'push','-q','origin','main');git(dir,'clone','-q',remote,primary);
   write(primary,healthFile,health());
   await work({remote,peer,primary});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 };
}
t('only expected non-promoted generated reports can be published',()=>{
 a.throws(()=>validate(ranking(),'data/frozen-forecasts.json',at),/allowlist/);
 a.throws(()=>validate(ranking().replace('"paidRequests":0','"paidRequests":1'),file,at),/contract/);
 a.throws(()=>validate(ranking('2026-11-27T08:01:00Z'),file,at),/contract/);
});
t('validation retains the newer concurrent report and appends exact immutable receipts once',fixture(async({remote,peer,primary})=>{
 const {p,raw}=receipt(primary,'nba-schedule',{kind:'nba_official_schedule_v1',games:[]});
 const newer=health('2026-11-27T07:58:00Z');
 const run=await publish(primary,healthFile,{now:()=>at,backoff:()=>{},beforePush:({i})=>{
  if(i!==0)return;
  write(peer,healthFile,newer);write(peer,'unrelated.txt','preserved');
  git(peer,'add',healthFile,'unrelated.txt');commit(peer,'newer concurrent report');git(peer,'push','-q','origin','main');
 }});
 a.equal(run.status,'published_and_verified');
 a.equal(git(remote,'show','main:'+healthFile),newer);
 a.equal(git(remote,'show','main:'+p),raw.trimEnd());
 a.equal(git(remote,'show','main:unrelated.txt'),'preserved');
 a.equal((await publish(primary,healthFile,{now:()=>at})).status,'already_current_or_newer');
 a.equal(git(remote,'log','--format=%H','main','--',p).split('\n').length,1);
}));
t('validation fails closed on invalid staged paths and immutable receipt conflicts',fixture(async({remote,peer,primary})=>{
 write(primary,'unrelated.txt','not an evidence receipt');git(primary,'add','unrelated.txt');
 await a.rejects(publish(primary,healthFile,{now:()=>at}),/only new allowlisted/);
 git(primary,'reset','--','unrelated.txt');
 const {p}=receipt(primary,'nba-schedule',{kind:'nba_official_schedule_v1',games:[]});
 write(peer,p,'different immutable bytes');git(peer,'add','--',p);commit(peer,'conflicting receipt');git(peer,'push','-q','origin','main');
 await a.rejects(publish(primary,healthFile,{now:()=>at}),/immutable receipt conflict/);
 a.equal(git(remote,'show','main:'+p),'different immutable bytes');
}));
t('validation rechecks the pregame freeze deadline before every push retry',fixture(async({remote,peer,primary})=>{
 const {p}=receipt(primary,'nba-forecasts',{kind:'pickfinder_public_nba_shadow_forecasts_v1',generatedAt:'2026-11-27T07:55:00Z',rows:[{gameStartAt:'2026-11-27T08:16:00Z'}]});
 let clock=at;
 await a.rejects(publish(primary,healthFile,{now:()=>clock,backoff:()=>{clock+=60_000;},beforePush:({i})=>{
  if(i!==0)return;
  write(peer,'unrelated.txt','racing write');git(peer,'add','unrelated.txt');commit(peer,'race');git(peer,'push','-q','origin','main');
 }}),/forecast archive gate rejected/);
 a.equal(git(remote,'ls-tree','main','--',p),'');
}));
t('rejects overlapping model evidence from a stale generation revision',fixture(async({remote,peer,primary})=>{
 const local=receipt(primary,'nba-grades',{kind:'pickfinder_public_nba_independent_grades_v1',rows:[{id:'x'}]});
 const competing=receipt(peer,'nba-grades',{kind:'pickfinder_public_nba_independent_grades_v1',rows:[{id:'x',candidate:false}]});
 commit(peer,'independent grade arrived');git(peer,'push','-q','origin','main');
 await a.rejects(publish(primary,healthFile,{now:()=>at}),/model archive advanced/);
 a.equal(git(remote,'ls-tree','main','--',local.p),'');
 a.equal(git(remote,'show','main:'+competing.p),competing.raw.trimEnd());
}));
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

t('NBA shadow statistics can publish only with the matching committed independent schedule and roster crosswalk',()=>{
 const digest='a'.repeat(64),registryFile='data/pickfinder-current-identity-registry.json';
 const row={sport:'nba',playerId:'123',evidenceKind:'verified_current_identity_and_independent_final_stat',
  productionModelEligible:false,shadowResearchEligible:true,operatorOfferVerified:false,settlementVerified:false,
  nativeDigest:digest,profileDigest:digest,identityReceiptDigest:digest,crosswalkReceiptDigest:digest,timezoneReceiptDigests:[],
  availableAt:'2026-11-27T07:50:00Z',value:0};
 const crosswalk={sport:'nba',namespace:'nba:official',evidenceKind:'independent_nba_schedule_and_roster_review',
  crosswalkReceiptDigest:digest,nativeReceiptDigest:digest,playerId:'123',proofAvailableAt:'2026-11-27T07:00:00Z',startAt:'2026-11-27T09:00:00Z'};
 const doc={kind:'pickfinder_current_identity_registry_v1',generatedAt:'2026-11-27T07:55:00Z',
  paidRequests:0,modelApproved:false,originalPlatformVerified:false,rows:[],registry:[],archiveRevision:'f'.repeat(40),
  statisticalCrosswalks:[crosswalk],qualifiedShadowStatistics:[row]};
 a.doesNotThrow(()=>validate(JSON.stringify(doc),registryFile,at));
 for(const revision of [{statisticalCrosswalks:[]},{statisticalCrosswalks:[{...crosswalk,playerId:'456'}]},
  {qualifiedShadowStatistics:[{...row,settlementVerified:true}]},{qualifiedShadowStatistics:[{...row,sport:'nfl'}]}])
  a.throws(()=>validate(JSON.stringify({...doc,...revision}),registryFile,at),/shadow statistic evidence contract/);
});
