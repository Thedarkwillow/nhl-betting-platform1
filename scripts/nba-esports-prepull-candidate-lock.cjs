"use strict";
// Pre-pull immutable research candidate lock, never a validated forecast or betting approval.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{execFileSync}=require("node:child_process");
const pin="f063be9e64f19028c59efbdcaf5b28f35210ea3d";
const required=["NBA","CS2","VALORANT","LOL","DOTA2","COD"];
const dt=Date.parse,sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const git=(root,args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:20000,maxBuffer:16*1024*1024}).trim();
function pacific(at){const f=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});return f.format(new Date(at));}
function window(at,slot){
 if(!Number.isFinite(dt(at))||!["06:00","09:00"].includes(slot))return null;
 const [day,time]=pacific(at).split(" "),h=Number(slot.slice(0,2)),hh=Number(time.slice(0,2)),mm=Number(time.slice(3,5));
 if(hh!==h-1||mm>45)return null;
 return {day,slot,minutesBeforePull:60-mm};
}
function readArchive(root,dir){
 const base=path.join(root,dir);if(!fs.existsSync(base))return [];
 const out=[];
 for(const n of fs.readdirSync(base).filter(x=>/^[A-Za-z0-9_-]{1,120}\.json$/.test(x)).sort().slice(-200)){
  const rel=dir+"/"+n,p=path.join(root,rel);
  try{
   if(fs.lstatSync(p).isSymbolicLink()||fs.statSync(p).size>8_000_000)continue;
   const c=git(root,["log","--format=%H","--",rel]).split("\n").filter(Boolean);if(c.length!==1||git(root,["status","--porcelain","--",rel]))continue;
   const first=git(root,["show","-s","--format=%cI",c[0]]),raw=git(root,["show",c[0]+":"+rel]);if(!Number.isFinite(dt(first)))continue;
   out.push({doc:JSON.parse(raw),first,digest:sha(raw),commit:c[0]});
  }catch{}
 }
 return out;
}
function report({at,slot,revision,root,archive,authorized,diagnostic=false}){
 if(revision!==pin||git(root,["rev-parse","HEAD"])!==pin)throw Error("wrong candidate revision");
 const w=window(at,slot);if(!diagnostic&&!w)throw Error("late or wrong slot");
 const esports=require(path.join(root,"scripts/esports-prospective-archive.cjs"));
 const offers=esports.originalOffers(readArchive(archive,"outputs/esports/authorized-original-offers"));
 const maps=esports.collectMaps(readArchive(archive,"outputs/esports/authorized-map-statistics"));
 const prior=readArchive(archive,"outputs/esports/prospective-frozen");
 const next=esports.build(offers,maps,prior,at,revision);
 const latest=(dir)=>readArchive(archive,dir).filter(x=>dt(x.first)<=dt(at)).sort((a,b)=>dt(a.first)-dt(b.first)).at(-1);
 const history=latest("outputs/nba/history/2026-27"),schedule=latest("outputs/nba/schedule"),board=latest("outputs/nba/boards");
 const nba={candidateLocked:true,sourceAuthorized:authorized,immutableHistory:!!history,priorScheduleArchive:!!schedule,priorBoardArchive:!!board,boardFresh:!!board&&dt(board.doc.capturedAt)<=dt(at)&&dt(at)-dt(board.doc.capturedAt)<=900000,forecastFreezeVerified:false,productionApproved:false};
 const sports={NBA:nba};for(const title of required.slice(1)){
  const o=offers.filter(x=>x.offer.title===title&&dt(x.offer.capturedAt)<=dt(at)&&dt(at)-dt(x.offer.capturedAt)<=900000&&dt(x.offer.seriesStartAt)>=dt(at)+900000);
  sports[title]={candidateLocked:true,eligibleFreshOffers:o.length,verifiedMapRows:maps.filter(x=>x.title===title&&dt(x.archiveFirstGitAt)<=dt(at)).length,eligibleForecasts:next.rows.filter(x=>x.offer.title===title).length,forecastFreezeVerified:false,productionApproved:false};
 }
 return {kind:"nba_esports_pre_pull_research_candidate_lock_v1",candidateRevision:revision,candidateTree:git(root,["rev-parse","HEAD^{tree}"]),archiveRevision:git(archive,["rev-parse","HEAD"]),generatedAt:at,slot:w?.slot??null,pacificDate:w?.day??null,diagnosticOnly:diagnostic,sports,formalNbaUntouchedStartUTC:"2026-12-01T00:00:00Z",candidateLockDoesNotFreezeForecasts:true,forecastFreezeVerified:false,modelPromoted:false,paidRequests:0,rawRowsPublished:0};
}
if(require.main===module){try{
 const [rootArg,archiveArg,slot,mode,out]=process.argv.slice(2),root=fs.realpathSync(rootArg),archive=fs.realpathSync(archiveArg);
 if(root===archive||!fs.existsSync(path.join(archive,".git"))||!["diagnostic","lock"].includes(mode))throw Error();
 const at=new Date().toISOString(),diagnostic=mode==="diagnostic";
 const r=report({at,slot,revision:pin,root,archive,authorized:process.env.NBA_DIRECT_SOURCE_AUTHORIZED==="1",diagnostic});
 if(!diagnostic){if(!out)throw Error();fs.writeFileSync(out,JSON.stringify(r)+"\n",{flag:"wx",mode:0o600});}
 console.log(JSON.stringify(r));
}catch{console.error("Morning candidate lock failed closed; no freeze certified");process.exitCode=1}}
module.exports={window,pacific,report,pin,required};
