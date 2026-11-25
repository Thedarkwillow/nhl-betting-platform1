'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {PIN,DIR}=require('./nba-parallel-paper-pilot.cjs');
const {official,prospectiveSummary}=require('./grade-nba-frozen-research-v1.cjs');
const {gradePaper}=require('../src/nba-research-pipeline-v1.cjs');
const dt=Date.parse,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(root,args)=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe'],maxBuffer:64e6,timeout:30000});
function immutable(root,rel){
 if(!/^(?:outputs\/nba\/(?:parallel-paper-pilot|parallel-paper-grades|boards|schedule|history\/(?:2023-24|2024-25|2025-26|2026-27))\/)[a-zA-Z0-9.-]+\.json$/.test(rel))throw Error('path');
 const file=path.join(root,rel),st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size>32e6||git(root,['status','--porcelain','--',rel]).length)throw Error('file');
 const commits=git(root,['log','--format=%H','--',rel]).toString().trim().split('\n');
 if(commits.length!==1||!/^[a-f0-9]{40}$/.test(commits[0]))throw Error('mutable');
 const commit=commits[0],first=git(root,['show','-s','--format=%cI',commit]).toString().trim(),raw=git(root,['show',commit+':'+rel]);
 if(!raw.equals(fs.readFileSync(file))||!Number.isFinite(dt(first)))throw Error('bytes');
 return {rel,commit,first,sha256:sha(raw),doc:JSON.parse(raw)};
}
function grade(frame,finals,now){
 const f=frame.doc;if(f.kind!=='nba_parallel_conditional_pilot_v1'||f.modelRevision!==PIN||f.researchOnly!==true||f.formalUntouchedCohort!==false||f.originalAppAvailabilityVerified!==false||f.actualWagersPlaced!==0||!Array.isArray(f.rows)||!Number.isFinite(dt(f.generatedAt))||!Number.isFinite(dt(f.boardCapturedAt))||dt(f.boardCapturedAt)>dt(f.generatedAt)||dt(f.generatedAt)>dt(frame.first)+999||dt(frame.first)>dt(now))throw Error('invalid frozen frame');
 const out=[],seen=new Set();
 for(const p of f.rows){
  if(p.researchOnly!==true||p.sourceObservedAt!==f.boardCapturedAt||!Number.isFinite(dt(p.gameStartAt))||dt(frame.first)+900000>=dt(p.gameStartAt)||!Number.isInteger(p.playerId)||!Number.isInteger(p.gameId)||!Number.isFinite(p.line)||!['Higher','Lower'].includes(p.offeredSide)||!Number.isFinite(p.rawSelectedEstimate)||p.rawSelectedEstimate<=.5||p.rawSelectedEstimate>=1)continue;
  const id=JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.tier,p.offeredSide]);if(seen.has(id))continue;seen.add(id);
  const x=finals.get(p.gameId)?.get(p.playerId),status=gradePaper(p,x?.team===p.team?x:null);
  out.push({id,gameId:p.gameId,gameDate:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(p.gameStartAt)),gameStartAt:p.gameStartAt,playerId:p.playerId,market:p.market,line:p.line,tier:p.tier,side:p.offeredSide,status,officialStat:status==='pending'?null:x[p.market],rawSelectedEstimate:p.rawSelectedEstimate,sourceCommit:frame.commit,modelRevision:PIN,formalUntouchedCohort:false});
 }return out;
}
function frames(root,now){
 const dir=path.join(root,DIR);if(!fs.existsSync(dir))return [];
 const list=[];
 for(const name of fs.readdirSync(dir).filter(x=>/^[a-f0-9]{64}\.json$/.test(x))){
  try{const f=immutable(root,DIR+'/'+name),proofs=f.doc.sourceProofs;
   if(!Array.isArray(proofs)||proofs.length!==6||name!==proofs[0]?.sha256+'.json')continue;
   if(!proofs.every(p=>{const s=immutable(root,p.rel);return s.sha256===p.sha256&&s.commit===p.commit&&s.first===p.first&&dt(s.first)<=dt(f.doc.generatedAt);}))continue;
   grade(f,new Map(),now);list.push(f);
  }catch{}
 }return list.sort((a,b)=>dt(a.first)-dt(b.first)||a.rel.localeCompare(b.rel));
}
async function run(root,now=new Date().toISOString()){
 if(process.env.RESTRICTED_DESTINATION_VERIFIED!=='1')throw Error('private archive');
 const fsx=frames(root,now),registered=new Map();
 for(const f of fsx)for(const r of grade(f,new Map(),now)){const k=JSON.stringify([r.gameId,r.playerId,r.market,r.line,r.tier]);if(!registered.has(k))registered.set(k,{r,f});}
 const prior=new Map(),conflicts=new Set(),dir='outputs/nba/parallel-paper-grades',dest=path.join(root,dir);
 if(fs.existsSync(dest))for(const n of fs.readdirSync(dest).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)))try{
  const z=immutable(root,dir+'/'+n);if(z.doc.kind!=='nba_conditional_pilot_grade_v1'||z.doc.formalUntouchedCohort!==false)continue;
  for(const x of z.doc.rows||[]){if(!['correct','incorrect','push'].includes(x.status))continue;const k=x.id+'|'+x.sourceCommit,old=prior.get(k);if(old&&(old.status!==x.status||old.officialStat!==x.officialStat))conflicts.add(k);else if(!old)prior.set(k,x);}
 }catch{}
 const games=new Map();for(const {r} of registered.values()){if(dt(now)-dt(r.gameStartAt)>3*3600000&&dt(now)-dt(r.gameStartAt)<30*86400000&&!prior.has(r.id+'|'+r.sourceCommit))games.set(r.gameId,r.gameStartAt);}
 const finals=new Map(),evidence=new Map();let requests=0;
 for(const [id,start] of [...games].slice(0,12)){try{requests++;const resp=await fetch('https://cdn.nba.com/static/json/liveData/boxscore/boxscore_'+String(id).padStart(10,'0')+'.json',{redirect:'error',signal:AbortSignal.timeout(15000)});if(!resp.ok)continue;const raw=await resp.text(),at=new Date().toISOString();if(raw.length>4e6)continue;const final=official(JSON.parse(raw),id,start,at);if(final){finals.set(id,final);evidence.set(id,{source:'NBA official CDN',observedAt:at,sourceResponseSha256:sha(raw)});}}catch{}}
 const rows=[],newRows=[];
 for(const f of fsx)for(const r of grade(f,finals,now)){
  const k=JSON.stringify([r.gameId,r.playerId,r.market,r.line,r.tier]),selected=registered.get(k);if(selected?.f.commit!==f.commit||selected.r.id!==r.id)continue;
  const key=r.id+'|'+r.sourceCommit;if(conflicts.has(key))continue;
  const old=prior.get(key);if(old){if(r.status!=='pending'&&(r.status!==old.status||r.officialStat!==old.officialStat))continue;rows.push(old);}
  else{rows.push(r);if(r.status!=='pending')newRows.push({...r,finalEvidence:evidence.get(r.gameId)});}
 }
 if(newRows.length){fs.mkdirSync(dest,{recursive:true,mode:0o700});const raw=JSON.stringify({kind:'nba_conditional_pilot_grade_v1',formalUntouchedCohort:false,rows:newRows,researchOnly:true,appSettlementVerified:false})+'\n';const p=path.join(dest,sha(raw)+'.json');if(!fs.existsSync(p))fs.writeFileSync(p,raw,{flag:'wx',mode:0o600});}
 return {state:'nba_conditional_pilot_grading',immutableFrames:fsx.length,registered:registered.size,decided:rows.filter(r=>['correct','incorrect'].includes(r.status)).length,pushes:rows.filter(r=>r.status==='push').length,pending:rows.filter(r=>r.status==='pending').length,newGrades:newRows.length,officialFinalGames:finals.size,officialRequests:requests,conflicts:conflicts.size,formalUntouchedCohort:false,modelApproved:false,paidRequests:0,rawRowsPublished:0};
}
module.exports={grade,frames,run};
if(require.main===module)run(fs.realpathSync(process.argv[2])).then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('Conditional pilot grading failed closed');process.exitCode=1;});
