"use strict";
// Read-only morning archive health: observes immutable records, never certifies forecast quality.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{execFileSync}=require("node:child_process");
const {pacific,window,pin,required}=require("./nba-esports-prepull-candidate-lock.cjs");
const dt=Date.parse, validAt=x=>typeof x==="string"&&Number.isFinite(dt(x));
const git=(root,args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:15000,maxBuffer:16*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
function immutable(root,rel){
 try {
  const p=path.join(root,rel),s=fs.lstatSync(p);
  if(!s.isFile()||s.isSymbolicLink()||s.size>8e6||git(root,["status","--porcelain","--",rel]))return null;
  const commits=git(root,["log","--format=%H","--",rel]).split("\n").filter(Boolean);
  if(commits.length!==1)return null;
  const first=git(root,["show","-s","--format=%cI",commits[0]]);
  if(!validAt(first))return null;
  const raw=execFileSync("git",["show",commits[0]+":"+rel],{cwd:root,timeout:15000,maxBuffer:16*1024*1024,stdio:["ignore","pipe","pipe"]});
  if(!raw.equals(fs.readFileSync(p)))return null;
  return {first,commit:commits[0],rel,digest:crypto.createHash("sha256").update(raw).digest("hex"),doc:JSON.parse(raw)};
 }catch{return null;}
}
function slotTime(at,day,slot){
 if(!validAt(at))return false;
 const [d,t]=pacific(at).split(" ");return d===day&&t.slice(0,2)===slot.slice(0,2);
}
function validLock(x,day,slot){
 const d=x?.doc;
 return !!(d&&d.kind==="nba_esports_pre_pull_research_candidate_lock_v1"&&d.candidateRevision===pin&&d.pacificDate===day&&d.slot===slot&&d.diagnosticOnly===false&&d.candidateLockDoesNotFreezeForecasts===true&&d.forecastFreezeVerified===false&&validAt(d.generatedAt)&&validAt(x.first)&&dt(d.generatedAt)<=dt(x.first)&&window(d.generatedAt,slot)?.day===day&&window(x.first,slot)?.day===day&&required.every(k=>d.sports?.[k]?.candidateLocked===true));
}
function scan(root,dir){
 const base=path.join(root,dir);let names=[];
 try{names=fs.readdirSync(base).filter(n=>/^[A-Za-z0-9_-]{1,120}\.json$/.test(n)).sort().slice(-200);}catch{}
 return names.map(n=>immutable(root,dir+"/"+n)).filter(Boolean);
}
function validRankingReceipt(f,receipt,lock,day,slot,at){
 const d=receipt?.doc;
 return !!(d&&validLock(lock,day,slot)&&d.kind==="nba_locked_ranking_receipt_v1"&&d.rankingPath===f.rel&&d.rankingSha256===f.digest&&/^[a-f0-9]{64}$/.test(f.digest||"")&&receipt.commit===f.commit&&receipt.first===f.first&&d.pacificDate===day&&d.slot===slot&&d.modelRevision===pin&&d.candidateTree===lock.doc.candidateTree&&d.lockFirstGitAt===lock.first&&slotTime(d.generatedAt,day,slot)&&dt(f.doc.generatedAt)<=dt(d.generatedAt)&&dt(d.generatedAt)<=dt(receipt.first)&&dt(receipt.first)<=dt(at)&&d.originalAppAvailabilityVerified===false&&d.calibrationApproved===false&&d.forecastFreezeVerified===false&&(f.doc.modelCoreOnlyLock!==true?d.modelCoreOnlyLock!==true:d.modelCoreOnlyLock===true&&f.doc.modelCoreRevision===pin&&f.doc.modelCoreTree===d.candidateTree&&/^[a-f0-9]{40}$/.test(d.collectorRevision||'')&&d.collectorRevision===f.doc.collectorRevision));
}
function summarize({day,slot,lock,boards,rankings,offers,frozen,receipts=[],at}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!["06:00","09:00"].includes(slot)||!validAt(at))throw Error("invalid audit scope");
 const inSlot=(f,t)=>slotTime(f.first,day,slot)&&slotTime(t,day,slot)&&dt(t)<=dt(f.first)&&dt(f.first)<=dt(at);
 const ok=validLock(lock,day,slot)&&dt(lock.first)<=dt(at);
 const sports=Object.fromEntries(required.map(s=>[s,{observedSourceRows:0,observedArchiveRows:0,pinnedRevisionArchiveRows:0,slotForecastCertified:false}]));
 const rows=x=>Array.isArray(x)?x:[];
 for(const f of boards)if(inSlot(f,f.doc?.capturedAt))sports.NBA.observedSourceRows+=rows(f.doc.rows).length;
 for(const f of rankings)if(f.doc?.kind==="nba_private_research_rankings_v1"&&inSlot(f,f.doc.generatedAt)&&slotTime(f.doc.boardCapturedAt,day,slot)&&dt(f.doc.boardCapturedAt)<=dt(f.doc.generatedAt)){
  const n=rows(f.doc.rows).filter(r=>r.researchOnly===true&&validAt(r.gameStartAt)&&dt(f.first)+900000<dt(r.gameStartAt)&&r.sourceObservedAt===f.doc.boardCapturedAt).length;
  sports.NBA.observedArchiveRows+=n;
  if(f.doc.modelRevision===pin||receipts.some(r=>validRankingReceipt(f,r,lock,day,slot,at)))sports.NBA.pinnedRevisionArchiveRows+=n;
 }
 for(const f of offers)if(f.doc?.kind==="authorized_esports_original_offer_export_v1"&&inSlot(f,f.doc.capturedAt)){
  for(const r of rows(f.doc.rows))if(required.slice(1).includes(r.title)&&slotTime(r.capturedAt,day,slot))sports[r.title].observedSourceRows++;
 }
 for(const f of frozen)if(f.doc?.kind==="esports_prospective_frozen_v2"&&inSlot(f,f.doc.generatedAt)){
  for(const r of rows(f.doc.rows)){
   const o=r.offer;if(!required.slice(1).includes(o?.title)||!validAt(o.seriesStartAt)||dt(f.first)+900000>dt(o.seriesStartAt)||!slotTime(o.capturedAt,day,slot))continue;
   sports[o.title].observedArchiveRows++;
   if(f.doc.modelRevision===pin)sports[o.title].pinnedRevisionArchiveRows++;
  }
 }
 for(const s of required){const x=sports[s];x.status=!ok?"lock_missing_or_invalid":!x.observedSourceRows?"no_observed_source_rows":!x.observedArchiveRows?"no_observed_forecast_archive":!x.pinnedRevisionArchiveRows?"model_revision_unconfirmed":"slot_binding_not_verified";}
 return {kind:"morning_private_archive_health_v1",pacificDate:day,slot,generatedAt:at,lockVerified:ok,sports,allSlotForecastsCertified:false,observationCountsAreNotUniqueOffers:true,countsAreNotSourceAuthentication:true,paidRequests:0,rawRowsPublished:0};
}
function audit(root,day,slot,at){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!["06:00","09:00"].includes(slot))throw Error("invalid audit scope");
 return summarize({day,slot,at,lock:immutable(root,"research/nba-esports-prepull-locks/"+day+"/"+slot.replace(":","")+".json"),
  boards:scan(root,"outputs/nba/boards"),rankings:scan(root,"outputs/nba/rankings"),receipts:scan(root,"outputs/nba/ranking-provenance"),offers:scan(root,"outputs/esports/authorized-original-offers"),frozen:scan(root,"outputs/esports/prospective-frozen")});
}
if(require.main===module){try{
 const [rootArg,day,slot]=process.argv.slice(2),root=fs.realpathSync(rootArg);
 if(root===path.resolve(__dirname,"..")||!fs.existsSync(path.join(root,".git")))throw Error();
 const r=audit(root,day,slot,new Date().toISOString());console.log(JSON.stringify(r));
 // A green CI job must not be mistaken for certified data completeness.
 if(!r.lockVerified||Object.values(r.sports).some(x=>!x.observedSourceRows||!x.observedArchiveRows||!x.pinnedRevisionArchiveRows))process.exitCode=1;
}catch{console.error("Morning archive audit failed closed; no data certified");process.exitCode=1}}
module.exports={slotTime,validLock,validRankingReceipt,summarize,audit};
