"use strict";
/**
 * Public safe-only 6/9 AM NHL+NFL capture/freeze monitor. Reads PRIVATE
 * manifest summaries inside trusted runner; never reads or exports player
 * projections. No misleading health-only GREEN = actual captured board.
 */
const fs=require("node:fs"),path=require("node:path");
const TO="America/Los_Angeles";
const clock=t=>{
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:TO,year:"numeric",month:"2-digit",
  day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(t));
 const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return {day:x.year+"-"+x.month+"-"+x.day,hour:Number(x.hour)};
};
function validCapture(m,slot,day){
 if(m?.schemaVersion!==1||m?.source!=="partner-api.prizepicks.com"||
    m.captureSlotPacific!==slot||m.pacificDate!==day||
    m.completePagination!==true||m.actualCaptureInRequestedHour!==true||
    m.sourceAuthenticatedFirstParty!==false||
    !Array.isArray(m.sports))return false;
 const started=Date.parse(m.captureStartedUTC),finished=Date.parse(m.captureFinishedUTC);
 if(!Number.isFinite(started)||!Number.isFinite(finished)||started>finished||
    clock(started).day!==day||clock(finished).day!==day||
    clock(started).hour!==Number(slot.slice(0,2))||
    clock(finished).hour!==Number(slot.slice(0,2)))return false;
 return ["NHL","NFL"].every(s=>m.sports.some(x=>x.sport===s&&
  Number.isInteger(x.rawCount)&&x.rawCount>0&&
  x.missingPlayers===0&&x.missingGames===0));
}
function summarize(manifests,freeze,{now=new Date().toISOString()}={}){
 const current=Date.parse(now);
 if(!Number.isFinite(current))throw Error("Collector health clock invalid");
 const {day}=clock(current);
 const slots={};
 for(const slot of ["06:00","09:00"]){
  const sorted=(manifests||[]).filter(x=>validCapture(x,slot,day))
   .sort((a,b)=>Date.parse(b.captureFinishedUTC)-Date.parse(a.captureFinishedUTC));
  const m=sorted[0]||null;
  slots[slot]={status:m?"privately_archived_complete":"no_verified_full_capture",
    observedAt:m?.captureFinishedUTC||null,nhlOffers:m?
     m.sports.find(x=>x.sport==="NHL").rawCount:null,
    nflOffers:m?m.sports.find(x=>x.sport==="NFL").rawCount:null};
 }
 const verified=freeze?.kind==="public_safe_nhl_nfl_original_pregame_freeze_status_v1"&&
   freeze.firstGitAdditionVerified===true&&
   freeze.sameCommitForBothSports===true&&
   freeze.originalModelDirectionsBeforeKickoff===true&&
   Object.values(slots).some(x=>x.observedAt===freeze.sourceCaptureFinishedUTC)&&
   Number.isFinite(Date.parse(freeze.originalPrivateGitCommitUTC))&&
   Date.parse(freeze.originalPrivateGitCommitUTC)>Date.parse(freeze.sourceCaptureFinishedUTC);
 const newest=Object.values(slots).filter(x=>x.observedAt)
  .sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
 const recent=!!newest&&current>=Date.parse(newest.observedAt)&&
   current-Date.parse(newest.observedAt)<=30*60000;
 return {schemaVersion:1,kind:"public_nhl_nfl_pacific_morning_collection_health_v1",
  generatedAt:now,pacificDate:day,slots,
  latestCompleteSourceAt:newest?.observedAt||null,
  latestSourceFreshWithin30Minutes:recent,
  originalPregameFreezeVerifiedForToday:verified,
  frozenSelectionCounts:verified?{
   NHL:freeze.pregameSelections.NHL.count,NFL:freeze.pregameSelections.NFL.count}:null,
  sixToNineChangesVerified:slots["06:00"].observedAt!==null&&
    slots["09:00"].observedAt!==null,
  allMorningCapturesVerified:Object.values(slots).every(x=>x.status==="privately_archived_complete"),
  publicWorkflowGreenDoesNotImplyBoardCaptured:true,
  missingSlots:Object.entries(slots).filter(([,s])=>s.observedAt===null).map(([k])=>k),
  sourceOriginalPlatformAppAuthenticated:false,
  calibratedBettingProbabilities:false,payoutEVVerified:false,rawPlayerRowsPublic:0};
}
function loadManifests(root,day){
 const parent=path.join(root,"outputs/manual-board-captures",day);
 if(!fs.existsSync(parent))return [];
 return fs.readdirSync(parent).flatMap(d=>{
  const file=path.join(parent,d,"manifest.json");
  try{return fs.existsSync(file)?[JSON.parse(fs.readFileSync(file,"utf8"))]:[]}
  catch{return [];}
 });
}
function main(args=process.argv.slice(2),now=new Date().toISOString()){
 const [privateRoot,publicRoot]=args;
 if(!privateRoot||!publicRoot)throw Error("Pass private and public repo paths");
 const day=clock(now).day,manifests=loadManifests(privateRoot,day);
 const statusFile=path.join(publicRoot,"data/nhl-nfl-freeze-status.json");
 const freeze=fs.existsSync(statusFile)?JSON.parse(fs.readFileSync(statusFile,"utf8")):null;
 const result=summarize(manifests,freeze,{now});
 const output=path.join(publicRoot,"data/collection-health.json");
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({output:"data/collection-health.json",
  sixAm:result.slots["06:00"].status,nineAm:result.slots["09:00"].status,
  pregameFreezeVerified:result.originalPregameFreezeVerifiedForToday,
  successNotDeclaredWithoutArchive:true,rawRowsExported:0}));
 return result;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={clock,validCapture,summarize,loadManifests,main};
