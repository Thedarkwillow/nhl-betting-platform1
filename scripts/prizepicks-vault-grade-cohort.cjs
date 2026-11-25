'use strict';
// Dedicated private cohort only. No metered provider calls, no public individual data.
const crypto=require('node:crypto');
const {gradeFrame}=require('./prizepicks-restricted-nba-grade.cjs');
const {receipts,build}=require('./prizepicks-native-context-readiness.cjs');
const {REPO}=require('./prizepicks-forecast-vault.cjs');
const BASE='https://api.github.com/repos/'+REPO,ID=1472152822;
const WITNESS='witnesses/2026-11-25-1805-cohort.json';
const dt=Date.parse,hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),rev=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const sameSet=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
const norm=x=>typeof x==='string'?x.trim().toLowerCase():'';
function openVault({token,grant,client=fetch}={}){
 if(!token||grant!=='authorized_individual_forecast_retention_v1')throw Error('vault_not_authorized');
 async function request(method,route,body,optional=false){
  const res=await client(BASE+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});
  if(optional&&res.status===404)return null;
  if(!res.ok)throw Error('vault_http');
  return res.json();
 }
 async function privateRepo(){const j=await request('GET','');if(j.id!==ID||j.full_name?.toLowerCase()!==REPO.toLowerCase()||j.private!==true||j.visibility!=='private'||j.default_branch!=='main'||j.archived!==false||j.disabled===true)throw Error('vault_identity');}
 async function read(path,ref='main',optional=false){
  const j=await request('GET','/contents/'+path+'?ref='+ref,undefined,optional);
  if(j===null)return null;
  if(j.path!==path||j.type!=='file'||j.encoding!=='base64'||typeof j.content!=='string'||!rev(j.sha))throw Error('vault_file');
  const bytes=Buffer.from(j.content,'base64');if(bytes.length>900000)throw Error('vault_bound');
  return {bytes,sha:j.sha,doc:JSON.parse(bytes)};
 }
 async function first(path){
  const a=await request('GET','/commits?sha=main&per_page=2&path='+encodeURIComponent(path));
  if(!Array.isArray(a)||a.length!==1||!rev(a[0].sha)||!Number.isFinite(dt(a[0].commit?.committer?.date)))throw Error('not_single_commit');
  return {sha:a[0].sha,at:a[0].commit.committer.date};
 }
 async function append(path,doc){
  // Only derived reconciliation and independent grade paths are writable.
  if(!/^(?:reconciliation\/nfl\/[a-f0-9]{64}-[a-f0-9]{64}|grades\/nba\/[a-f0-9]{64}-\d{1,12})\.json$/.test(path))throw Error('write_path');
  const bytes=Buffer.from(JSON.stringify(doc)+'\n');if(bytes.length>900000)throw Error('write_bound');
  await privateRepo();
  const old=await read(path,'main',true);
  if(old){if(!old.bytes.equals(bytes))throw Error('existing_conflict');return false;}
  const result=await request('PUT','/contents/'+path,{message:'Append independent research receipt',content:bytes.toString('base64'),branch:'main'});
  if(!rev(result.commit?.sha)||result.content?.path!==path)throw Error('write_receipt');
  const back=await read(path,result.commit.sha);if(!back.bytes.equals(bytes))throw Error('write_readback');
  return true;
 }
 return {privateRepo,read,first,append};
}
async function cohort(vault,clock){
 await vault.privateRepo();
 const wfirst=await vault.first(WITNESS),w=await vault.read(WITNESS,wfirst.sha),current=await vault.read(WITNESS);
 if(!w.bytes.equals(current.bytes))throw Error('witness_changed');
 const d=w.doc,at=Math.max(dt(d.observedAt),dt(wfirst.at));
 if(d.kind!=='private_forecast_pregame_connector_witness_v1'||d.repositoryId!==ID||d.count!==547||d.originalFramesModified!==false||d.serverPushTimestampVerified!==false||!Array.isArray(d.frames)||d.frames.length!==7||!Number.isFinite(at)||dt(d.observedAt)>dt(wfirst.at)+999||at>dt(clock))throw Error('witness_invalid');
 const frames=[],seen=new Set();let count=0;
 for(const f of d.frames){
  if(!digest(f.digest)||!rev(f.commit)||!rev(f.gitBlobSha)||f.path!=='forecasts/'+f.digest+'.json'||seen.has(f.digest))throw Error('witness_frame');
  seen.add(f.digest);
  const first=await vault.first(f.path),pin=await vault.read(f.path,f.commit),latest=await vault.read(f.path);
  if(first.sha!==f.commit||dt(first.at)>dt(d.observedAt)+999||pin.sha!==f.gitBlobSha||!pin.bytes.equals(latest.bytes)||hash(pin.bytes)!==f.digest)throw Error('forecast_integrity');
  const p=pin.doc;if(p.kind!=='restricted_individual_forecast_v1'||p.modelApproved!==false||p.originalPlatformVerified!==false||!Array.isArray(p.rows)||p.rows.length!==f.rows)throw Error('forecast_schema');
  if(p.rows.some(x=>x.restricted!==true||x.calibrated!==false||x.modelApproved!==false||!Number.isFinite(dt(x.forecastAt))||!Number.isFinite(dt(x.sourceObservedAt))||dt(x.sourceObservedAt)>dt(x.forecastAt)||dt(x.forecastAt)>at||!Number.isFinite(dt(x.gameStartAt))||at+900000>=dt(x.gameStartAt)))throw Error('forecast_chronology');
  count+=p.rows.length;frames.push({digest:f.digest,bytes:pin.bytes,rows:p.rows});
 }
 if(count!==547)throw Error('cohort_count');
 return {frames,archivedAt:new Date(at).toISOString(),witnessCommit:wfirst.sha,serverPushTimestampVerified:false};
}
function reconcileNfl(rows,facts,seasons,cache=new Map()){
 const out=[];
 for(const p of rows){
  if(p.sport!=='NFL'||!digest(p.identityEvidenceSha256)||!Array.isArray(p.historyDigests)||!p.historyDigests.every(digest)||!rev(p.modelRevision))continue;
  const key=JSON.stringify([p.identityEvidenceSha256,[...p.historyDigests].sort(),p.forecastAt,p.modelRevision]);
  if(!cache.has(key)){
   const f=facts.filter(x=>x.digest===p.identityEvidenceSha256&&dt(x.first)<=dt(p.sourceObservedAt)),h=seasons.filter(x=>p.historyDigests.includes(x.digest)&&dt(x.first)<=dt(p.sourceObservedAt));
   if(f.length!==1||h.length!==3)cache.set(key,[]);
   else cache.set(key,build({facts:f,nhlFinals:[],nflSeasons:h,archive:{invalid:[],latest:[]},clock:p.forecastAt,revision:p.modelRevision}).scopes);
  }
  const candidates=cache.get(key).filter(s=>s.sport==='NFL'&&String(s.playerId)===String(p.nativePlayerId)&&String(s.gameId)===String(p.nativeGameId)&&norm(s.name)===norm(p.player)&&dt(s.startAt)===dt(p.gameStartAt)&&s.receiptDigest===p.identityEvidenceSha256&&sameSet(s.historyDigests,p.historyDigests)&&dt(s.firstGitAt)<=dt(p.sourceObservedAt)&&(!p.team||p.team===s.team)&&(!p.opponent||p.opponent===s.opponent));
  if(candidates.length!==1)continue;
  const s=candidates[0];out.push({nativePlayerId:p.nativePlayerId,nativeGameId:p.nativeGameId,market:p.market,period:p.period,line:p.line,side:p.side,tier:p.tier,providerOfferId:p.providerOfferId,team:s.team,opponent:s.opponent,identityEvidenceSha256:s.receiptDigest,historyDigests:s.historyDigests,contextFirstGitAt:s.firstGitAt});
 }
 return out;
}
async function officialFinal(id,start,clock,client=fetch){
 if(!Number.isSafeInteger(id)||!Number.isFinite(dt(start))||dt(clock)-dt(start)<3*3600000)return null;
 try{
  const r=await client('https://cdn.nba.com/static/json/liveData/boxscore/boxscore_'+String(id).padStart(10,'0')+'.json',{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
  if(!r.ok)return null;const declared=Number(r.headers.get('content-length'));if(declared>4e6)return null;
  const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>4e6)return null;
  const observedAt=new Date().toISOString();if(!require('./grade-nba-frozen-research-v1.cjs').official(JSON.parse(bytes),id,start,observedAt))return null;
  return {bytes,observedAt};
 }catch{return null;}
}
async function run({vault,root,clock=new Date().toISOString()}){
 const c=await cohort(vault,clock),summary={cohortRows:547,frames:c.frames.length,nflDirections:0,nflReconciled:0,nbaDirections:0,nbaNotDue:0,nbaGrades:0,nbaUnresolved:0,officialFinalRequests:0,privateReceiptsWritten:0,paidRequests:0,rawRowsPublished:0,modelApproved:false,serverPushTimestampVerified:false};
 const facts=receipts(root,'research/pickfinder-public-identity-v1/native-facts','independent_public_sport_identity_facts_v1',c.archivedAt),seasons=receipts(root,'research/pickfinder-public-nfl-v1/season','nflverse_public_native_history_v1',c.archivedAt);
 const cache=new Map(),finals=new Map();
 for(const f of c.frames){
  const nfl=f.rows.filter(p=>p.sport==='NFL'),nba=f.rows.filter(p=>p.sport==='NBA');summary.nflDirections+=nfl.length;summary.nbaDirections+=nba.length;
  if(nfl.length){
   const rows=reconcileNfl(nfl,facts,seasons,cache);summary.nflReconciled+=rows.length;
   if(rows.length){const doc={kind:'restricted_nfl_identity_sidecar_v1',forecastDigest:f.digest,rows,originalForecastModified:false,appSettlementVerified:false,modelApproved:false};
    if(await vault.append('reconciliation/nfl/'+f.digest+'-'+hash(JSON.stringify(doc))+'.json',doc))summary.privateReceiptsWritten++;}
  }
  for(const [id,start] of new Map(nba.map(p=>[p.nativeGameId,p.gameStartAt]))){
   const total=nba.filter(p=>p.nativeGameId===id).length;
   if(dt(clock)-dt(start)<3*3600000){summary.nbaNotDue+=total;continue;}
   const path='grades/nba/'+f.digest+'-'+id+'.json',existing=await vault.read(path,'main',true);
   if(existing){const d=existing.doc;if(d.kind!=='restricted_nba_cohort_game_grade_v1'||d.forecastDigest!==f.digest||d.gameId!==id||!Array.isArray(d.rows)||d.rows.length>total||d.appSettlementVerified!==false)throw Error('existing_grade_invalid');summary.nbaGrades+=d.rows.length;summary.nbaUnresolved+=total-d.rows.length;continue;}
   if(!finals.has(id)){summary.officialFinalRequests++;finals.set(id,await officialFinal(id,start,clock));}
   const final=finals.get(id);if(!final){summary.nbaUnresolved+=total;continue;}
   const result=await gradeFrame({archiveBytes:f.bytes,receipt:c.witnessCommit,verifyReceipt:async(receipt,d)=>receipt===c.witnessCommit&&d===f.digest?{digest:d,archivedAt:c.archivedAt}:null,officialFinals:new Map([[id,final]]),clock:new Date().toISOString()});
   if(result.rows.length){
    const doc={kind:'restricted_nba_cohort_game_grade_v1',forecastDigest:f.digest,gameId:id,witnessCommit:c.witnessCommit,rows:result.rows,unresolvedDirections:total-result.rows.length,appSettlementVerified:false,serverPushTimestampVerified:false,calibrated:false,modelApproved:false};
    if(await vault.append(path,doc))summary.privateReceiptsWritten++;
   }
   summary.nbaGrades+=result.rows.length;summary.nbaUnresolved+=total-result.rows.length;
  }
 }
 return summary;
}
module.exports={openVault,cohort,reconcileNfl,officialFinal,run};
if(require.main===module)Promise.resolve().then(()=>run({vault:openVault({token:process.env.PRIZEPICKS_FORECAST_VAULT_TOKEN,grant:process.env.PRIZEPICKS_FORECAST_STORAGE_GRANT}),root:process.cwd()})).then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('Private cohort audit failed closed');process.exitCode=1;});
