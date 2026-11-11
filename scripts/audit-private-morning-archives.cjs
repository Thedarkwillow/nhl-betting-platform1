"use strict";
/**
 * Independent dual-sport ORIGINAL-source audit. No network requests.
 * Check the private committed source files, not the outcome of a GitHub
 * workflow, and fail the watchdog when a real Pacific slot is missing.
 * Public logs contain only counts and status. No player IDs/lines emitted.
 */
const fs=require("node:fs"),path=require("node:path"),
 cp=require("node:child_process");
const {pacific}=require("./pacific-morning-capture-gate.cjs");
const SPORTS=Object.freeze({NHL:200,NFL:1000});
function validate(root,localDate,slot,{requireGit=false}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(localDate)||!["06:00","09:00"].includes(slot))
  throw Error("Invalid original Pacific day/slot");
 const dir=path.join(root,"outputs/manual-board-captures",localDate);
 const status={localDate,requestedSlot:slot,verified:false,
  sourceCounts:null,matchingArchiveCount:0,privateOriginalOnly:true,
  actualProviderCalls:0};
 if(!fs.existsSync(dir))return {...status,reason:"no_private_capture_directory"};
 const good=[];
 for(const name of fs.readdirSync(dir)){
  if(!/^\d{8}T\d{6}Z$/.test(name))continue;
  const folder=path.join(dir,name),filename=path.join(folder,"manifest.json");
  if(!fs.existsSync(filename))continue;
  let d;
  try{d=JSON.parse(fs.readFileSync(filename,"utf8"))}catch{continue}
  if(d.source!=="partner-api.prizepicks.com"||
    d.schemaVersion!==1||d.snapshotMode!=="direct_live_board"||
    d.completePagination!==true||d.captureSlotPacific!==slot||
    d.notSixOrNineAmSlot!==false||
    d.actualCaptureInRequestedHour!==true||
    d.pacificDate!==localDate||
    d.hasBelowMorningMinimumInventory!==false||
    !Array.isArray(d.columns)||d.columns.length!==22||
    !Array.isArray(d.sports))continue;
  const a=pacific(d.captureStartedUTC),b=pacific(d.captureFinishedUTC),
   start=Date.parse(d.captureStartedUTC),end=Date.parse(d.captureFinishedUTC),
   hour=Number(slot.slice(0,2));
  if(a.day!==localDate||b.day!==localDate||a.hour!==hour||b.hour!==hour||
    !Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
  let valid=true;
  const counts={};
  for(const [sport,min] of Object.entries(SPORTS)){
   const entry=d.sports.find(x=>x.sport===sport);
   if(!entry||!Number.isInteger(entry.rawCount)||entry.rawCount<min||
    !Number.isInteger(entry.parts)||entry.parts<1||
    entry.belowMorningMinimumInventory!==false||
    entry.missingPlayers!==0||entry.missingGames!==0||
    !Number.isFinite(Date.parse(entry.sourceObservedAt))||
    Date.parse(entry.sourceObservedAt)<start||
    Date.parse(entry.sourceObservedAt)>end){valid=false;break}
   const seen=new Set();let total=0;
   for(let i=1;i<=entry.parts;i++){
    const child=path.join(folder,sport.toLowerCase()+"-"+String(i).padStart(2,"0")+".json");
    if(!fs.existsSync(child)){valid=false;break}
    let x;try{x=JSON.parse(fs.readFileSync(child,"utf8"))}catch{valid=false;break}
    if(x.sport!==sport||x.startIndex!==total||
       x.observedAtUTC!==entry.sourceObservedAt||
       !Array.isArray(x.rows)){valid=false;break}
    for(const row of x.rows){
     if(!Array.isArray(row)||row.length!==d.columns.length||
       typeof row[0]!=="string"||seen.has(row[0])){valid=false;break}
     seen.add(row[0]);
    }
    if(!valid)break;
    total+=x.rows.length;
   }
   if(!valid||total!==entry.rawCount){valid=false;break}
   counts[sport]=total;
  }
  if(!valid)continue;
  const relative=path.relative(root,folder).split(path.sep).join("/");
  if(requireGit){
   const git=args=>cp.execFileSync("git",args,{cwd:root,
    encoding:"utf8",timeout:15000}).trim();
   const relativeManifest=relative+"/manifest.json";
   try{
    const commitCount=Number(git(["rev-list","--count","HEAD","--",relativeManifest]));
    const commit=git(["log","--diff-filter=A","-1","--format=%cI","--",relativeManifest]);
    if(commitCount!==1||!Number.isFinite(Date.parse(commit))||
       Date.parse(commit)<end)continue;
   }catch{continue}
  }
  good.push({capturedAt:d.captureFinishedUTC,counts});
 }
 if(!good.length)return {...status,reason:"no_complete_original_NHL_and_NFL_archive_in_actual_slot"};
 good.sort((x,y)=>Date.parse(y.capturedAt)-Date.parse(x.capturedAt));
 return {...status,verified:true,reason:"complete_original_dual_sport_source_git_verified",
  sourceCounts:good[0].counts,observedAt:good[0].capturedAt,
  matchingArchiveCount:good.length};
}
function main({root,slot,now=new Date(),day=null,requireGit=true}={}){
 if(!root||!slot)throw Error("Required private repo root and original slot");
 const today=pacific(now),localDate=day||today.day;
 const result=validate(root,localDate,slot,{requireGit});
 console.log(JSON.stringify(result));
 if(!result.verified)process.exitCode=1;
 return result;
}
if(require.main===module){
 try{main({root:process.argv[2],slot:process.argv[3],
  day:process.argv[4]||null})}catch(e){
  console.error("Actual-source archive self-test: "+e.message);process.exitCode=1;
 }
}
module.exports={validate,main,SPORTS};
