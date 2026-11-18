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
  day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(t));
 const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return {day:x.year+"-"+x.month+"-"+x.day,hour:Number(x.hour),minute:Number(x.minute)};
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
/**
 * Source snapshot presence only; does not authenticate platform offers,
 * verified no-vig prices, odds bookability, or actual scheduler execution.
 * A completed GitHub workflow and a stale source JSON are NOT quote evidence.
 */
function sportsbookPreboard(archive,freeze,{now,slots}={}){
 const current=Date.parse(now),today=clock(now).day,
  hour=clock(now).hour,min=clock(now).minute;
 const scheduled=[["05:45","06:00"],["08:45","09:00"]];
 const results={};
 for(const [target,boardSlot] of scheduled){
  const targetMinutes=Number(target.slice(0,2))*60+Number(target.slice(3));
  const actualMinutes=hour*60+min;
  const boardAt=slots?.[boardSlot]?.observedAt||null;
  const captureAt=archive?.generatedAt,actual=Date.parse(captureAt);
  let status=actualMinutes<targetMinutes?"not_due":"no_fresh_preboard_odds_archive";
  if(archive?.kind==="bounded_sportsbook_capture_v1"&&
     archive.pacificDate===today&&
     Number.isFinite(actual)&&actual<=current&&
     clock(captureAt).day===today&&
     ["fresh_bounded_archive","fresh_two_sided_quotes"].includes(archive.status)&&
     Number.isInteger(archive.requests)&&archive.requests>0&&
     archive.newPurchase===false&&archive.verifiedLiveConsensus===false){
   const observedMin=clock(captureAt).hour*60+clock(captureAt).minute;
   if(observedMin>=targetMinutes-30&&observedMin<=targetMinutes+25&&
      actualMinutes>=targetMinutes){
    // The first observed board is 6:xx or 9:xx, not necessarily 6:00:00.
    // Quote data acquired at 06:02 is not a 05:45 preboard quote.
    if(boardAt!==null&&actual<Date.parse(boardAt))
     status="archived_before_board_unmatched";
    else if(actualMinutes<Number(boardSlot.slice(0,2))*60)
     status="archived_preboard_unmatched";
   }
  }
  results[target]={status,capturedAt:status.startsWith("archived_")?captureAt:null,
   boardSlot,verifiedExactPlayerGameMarketAndThreshold:false,
   independentConsensusVerified:false,paidProviderCallsMadeByAudit:0};
 }
 return {kind:"public_preboard_sportsbook_evidence_status_v1",
  slots:results,actualProviderRequestsMadeByAudit:0,
  liveAppOfferVerified:false,independentProbabilityBenchmarkVerified:false};
}
function summarize(manifests,freeze,{now=new Date().toISOString(),sportsbook=null}={}){
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
  sportsbookPreboard:sportsbookPreboard(sportsbook,freeze,{now,slots}),
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
 let sportsbook=null;
 const oddsFile=path.join(privateRoot,"outputs/sportsbooks/bounded-live/status-latest.json");
 if(fs.existsSync(oddsFile)){
  try{sportsbook=JSON.parse(fs.readFileSync(oddsFile,"utf8"))}catch{}
 }
 const result=summarize(manifests,freeze,{now,sportsbook});
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
module.exports={clock,validCapture,sportsbookPreboard,summarize,loadManifests,main};
