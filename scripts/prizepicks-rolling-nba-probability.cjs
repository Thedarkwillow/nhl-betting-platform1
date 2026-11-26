'use strict';
// Dedicated vault only. First observed independently before kickoff; never backdate.
const crypto=require('node:crypto');
const {openVault,officialFinal,cohort}=require('./prizepicks-vault-grade-cohort.cjs');
const {gradeFrame}=require('./prizepicks-restricted-nba-grade.cjs');
const {score}=require('./rolling-probability-performance.cjs');
const dt=Date.parse,hash=b=>crypto.createHash('sha256').update(b).digest('hex'),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const id=p=>JSON.stringify([p.nativeGameId,p.nativePlayerId,p.market,p.line,p.tier,p.side]);
const slate=x=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
const num=x=>typeof x==='number'&&Number.isFinite(x);
function eligible(p,at){return p.sport==='NBA'&&p.restricted===true&&p.calibrated===false&&p.modelApproved===false&&Number.isInteger(p.nativePlayerId)&&Number.isInteger(p.nativeGameId)&&!!p.team&&!!p.market&&!!p.tier&&['Higher','Lower'].includes(p.side)&&num(p.line)&&num(p.rawConditionalEstimate)&&p.rawConditionalEstimate>=0&&p.rawConditionalEstimate<=1&&/^[a-f0-9]{40}$/.test(p.modelRevision||'')&&Number.isFinite(dt(p.sourceObservedAt))&&dt(p.sourceObservedAt)<=dt(p.forecastAt)&&dt(p.forecastAt)<=at&&at+900000<dt(p.gameStartAt);}
async function pinned(vault,path){const first=await vault.first(path),p=await vault.read(path,first.sha),current=await vault.read(path);if(!p.bytes.equals(current.bytes)||p.sha!==current.sha)throw Error('immutable_bytes');return {...p,first};}
async function frame(vault,digest){if(!hex(digest))throw Error('frame_digest');const f=await pinned(vault,'forecasts/'+digest+'.json');if(hash(f.bytes)!==digest||f.doc.kind!=='restricted_individual_forecast_v1'||f.doc.modelApproved!==false||f.doc.originalPlatformVerified!==false||!Array.isArray(f.doc.rows))throw Error('frame_invalid');return f;}
function witnessValid(f,w,digest,clock){
 const d=w.doc,at=Math.max(dt(w.first.at),dt(d.observedAt));
 if(d.kind!=='independent_rolling_nba_pregame_witness_v1'||d.forecastDigest!==digest||d.forecastCommit!==f.first.sha||d.gitBlobSha!==f.sha||d.serverPushTimestampVerified!==false||!Number.isFinite(at)||dt(d.observedAt)>dt(w.first.at)+999||dt(f.first.at)>dt(d.observedAt)||at>dt(clock))throw Error('witness_invalid');
 return at;
}
function acceptedGrade(r,p,digest,clock){
 if(r.id!==id(p)||r.forecastDigest!==digest||r.modelRevision!==p.modelRevision||r.estimate!==p.rawConditionalEstimate||!num(r.actual)||!hex(r.officialDigest)||!Number.isFinite(dt(r.officialObservedAt))||dt(r.officialObservedAt)<=dt(p.gameStartAt)||dt(r.officialObservedAt)>dt(clock))return false;
 return r.result===(r.actual===p.line?'push':(p.side==='Higher'?r.actual>p.line:r.actual<p.line)?'correct':'incorrect');
}
async function run(vault,{clock=()=>new Date().toISOString(),getFinal=officialFinal}={}){
 await vault.privateRepo();
 const original=await cohort(vault,clock()),originalDigests=new Set(original.frames.map(f=>f.digest));
 // Original 547-direction cohort remains on its existing independent workflow.
 const files=(await vault.list('forecasts')).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));
 const witnesses=new Set(await vault.list('witnesses/auto')),gradeFiles=await vault.list('grades/nba-rolling');
 const eligibleFrames=[],counts={forecasts:files.length,originalCohortFramesExcluded:originalDigests.size,unwitnessedFrames:0,newWitnesses:0,witnessedFrames:0,due:0,notDue:0,duplicateDirections:0,unresolved:0,officialRequests:0,newGradeReceipts:0,conflicts:0,pushes:0};
 for(const name of files){
  const digest=name.slice(0,-5);if(originalDigests.has(digest))continue;
  const f=await frame(vault,digest);
  if(!witnesses.has(name)){
   const observedAt=clock();if(!f.doc.rows.some(p=>eligible(p,dt(observedAt)))||dt(f.first.at)>dt(observedAt)){counts.unwitnessedFrames++;continue;}
   if(await vault.append('witnesses/auto/'+name,{kind:'independent_rolling_nba_pregame_witness_v1',forecastDigest:digest,forecastCommit:f.first.sha,gitBlobSha:f.sha,observedAt,serverPushTimestampVerified:false}))counts.newWitnesses++;
  }
  const w=await pinned(vault,'witnesses/auto/'+name),at=witnessValid(f,w,digest,clock());
  eligibleFrames.push({digest,f,w,at,rows:f.doc.rows.filter(p=>eligible(p,at))});counts.witnessedFrames++;
 }
 const seen=new Set(),data=[],finals=new Map();eligibleFrames.sort((a,b)=>dt(a.f.first.at)-dt(b.f.first.at)||a.digest.localeCompare(b.digest));
 for(const x of eligibleFrames){
  const groups=new Map();for(const p of x.rows){
   const k=JSON.stringify([p.modelRevision,id(p)]);
   if(seen.has(k)){counts.duplicateDirections++;continue;}seen.add(k);
   if(dt(clock())-dt(p.gameStartAt)<3*3600000){counts.notDue++;continue;}
   counts.due++;const a=groups.get(p.nativeGameId)||[];a.push(p);groups.set(p.nativeGameId,a);
  }
  for(const [game,ps] of groups){
   const prefix=x.digest+'-'+game+'-',results=new Map(),bad=new Set(),byId=new Map(ps.map(p=>[id(p),p]));
   const add=r=>{const p=byId.get(r.id);if(!p)return;if(!acceptedGrade(r,p,x.digest,clock())){bad.add(r.id);return;}const old=results.get(r.id);if(old&&(old.actual!==r.actual||old.result!==r.result))bad.add(r.id);else if(!old)results.set(r.id,r);};
   for(const n of gradeFiles.filter(n=>n.startsWith(prefix)&&/^[a-f0-9]{64}\.json$/.test(n.slice(prefix.length)))){
    const d=await pinned(vault,'grades/nba-rolling/'+n),r=d.doc;
    if(r.kind!=='rolling_nba_independent_grade_v1'||r.forecastDigest!==x.digest||r.witnessCommit!==x.w.first.sha||r.gameId!==game||r.appSettlementVerified!==false||!Array.isArray(r.rows)||r.rows.some(z=>z.officialDigest!==n.slice(prefix.length,-5)))throw Error('grade_receipt');
    r.rows.forEach(add);
   }
   if(ps.some(p=>!results.has(id(p)))&&!bad.size){
    if(!finals.has(game)&&finals.size<12){counts.officialRequests++;finals.set(game,await getFinal(game,ps[0].gameStartAt,clock()));}
    const final=finals.get(game);if(final){
     const d=hash(final.bytes),name=prefix+d+'.json';
     if(!gradeFiles.includes(name)){
      const g=await gradeFrame({archiveBytes:x.f.bytes,receipt:x.w.first.sha,verifyReceipt:async(receipt,h)=>receipt===x.w.first.sha&&h===x.digest?{digest:h,archivedAt:new Date(x.at).toISOString()}:null,officialFinals:new Map([[game,final]]),clock:clock()});
      const rows=g.rows.filter(r=>byId.has(r.id)&&acceptedGrade(r,byId.get(r.id),x.digest,clock()));
      if(rows.length){if(await vault.append('grades/nba-rolling/'+name,{kind:'rolling_nba_independent_grade_v1',forecastDigest:x.digest,witnessCommit:x.w.first.sha,gameId:game,rows,appSettlementVerified:false,modelApproved:false}))counts.newGradeReceipts++;rows.forEach(add);}
     }
    }
   }
   for(const p of ps){const k=id(p),r=results.get(k);if(bad.has(k)){counts.conflicts++;continue;}if(!r){counts.unresolved++;continue;}if(r.result==='push'){counts.pushes++;continue;}data.push({p:r.estimate,y:Number(r.result==='correct'),gameId:game,slate:slate(p.gameStartAt),tier:p.tier,side:p.side,revision:p.modelRevision});}
  }
 }
 const grouped=key=>Object.fromEntries([...new Set(data.map(key))].sort().map(k=>[k,score(data.filter(r=>key(r)===k))]));
 const report={kind:'private_rolling_nba_probability_scorecard_v1',originalCohortSeparate:true,counts:{...counts,decided:data.length},byRevision:grouped(r=>r.revision),bySlateAndRevision:grouped(r=>JSON.stringify([r.slate,r.revision])),byTierAndRevision:grouped(r=>JSON.stringify([r.tier,r.revision])),calibrated:false,modelApproved:false,serverPushTimestampVerified:false,appSettlementVerified:false,paidRequests:0};
 const content=JSON.stringify(report)+'\n',key=hash(content);
 if(!(await vault.list('reports/auto')).includes(key+'.json'))await vault.append('reports/auto/'+key+'.json',report);
 return {...counts,decided:data.length,paidRequests:0,rawRowsPublished:0};
}
module.exports={run,eligible,witnessValid,acceptedGrade};
if(require.main===module)Promise.resolve().then(()=>run(openVault({token:process.env.PRIZEPICKS_FORECAST_VAULT_TOKEN,grant:process.env.PRIZEPICKS_FORECAST_STORAGE_GRANT}))).then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('Rolling private research audit failed closed');process.exitCode=1;});
