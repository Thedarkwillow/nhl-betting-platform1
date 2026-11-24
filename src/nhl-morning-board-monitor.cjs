"use strict";
/**
 * Read-only source archive checks and morning-capture watchdog.
 * Third-party board rows are not authenticated first-party PrizePicks offers.
 */
const {pacificSlot}=require("./nhl-morning-source-delta.cjs");
function stampFromFilename(filename){
 const m=String(filename||"").match(/(?:^|\/)(\d{8}T\d{6}Z)\.json$/);
 if(!m)return null;
 const v=m[1];
 const iso=v.slice(0,4)+"-"+v.slice(4,6)+"-"+v.slice(6,8)+"T"+
   v.slice(9,11)+":"+v.slice(11,13)+":"+v.slice(13,15)+"Z";
 const ms=Date.parse(iso);
 return Number.isFinite(ms)&&new Date(ms).toISOString()===iso.replace("Z",".000Z")?iso:null;
}
function validBoard(board,iso,day,slot){
 const stamped=pacificSlot(iso),actual=pacificSlot(board?.generatedAt);
 const difference=Date.parse(board?.generatedAt)-Date.parse(iso);
 return !!(stamped&&actual&&stamped.day===day&&stamped.slot===slot&&
  actual.day===day&&actual.slot===slot&&difference>=0&&difference<1000&&
  board.completePagination===true&&board.sourceStatus==="fresh"&&
  board.provider==="prizepicksapi.com"&&Array.isArray(board.rows)&&board.rows.length>0);
}
function findCompleteSourceArchive(files,readFile,{day,slot}){
 if(typeof readFile!=="function")throw Error("Source archive reader required");
 const matches=[];
 for(const file of files||[]){
  const iso=stampFromFilename(file),meta=iso&&pacificSlot(iso);
  if(!meta||meta.day!==day||meta.slot!==slot)continue;
  try{
   const board=JSON.parse(readFile(file));
   if(validBoard(board,iso,day,slot))
    matches.push({file,at:board.generatedAt,rows:board.rows.length});
  }catch{/* Corrupt or absent archive cannot establish a valid capture. */}
 }
 return matches.sort((a,b)=>a.at.localeCompare(b.at)).at(-1)||null;
}
function findCompletedScheduledCapture(files,readFile,{day,slot}){
 const matches=[];
 for(const file of files||[]){
  const iso=stampFromFilename(file),stamp=iso&&pacificSlot(iso);
  if(!stamp||stamp.day!==day)continue;
  try{
   const board=JSON.parse(readFile(file));
   const time=Date.parse(board?.generatedAt)-Date.parse(iso);
   if(board.requestedScheduledSlotPacific!==slot||
      board.provider!=="prizepicksapi.com"||board.sourceStatus!=="fresh"||
      board.completePagination!==true||!Array.isArray(board.rows)||
      board.rows.length===0||!Number.isFinite(time)||time<0||time>=1000)continue;
   matches.push({file,at:board.generatedAt,rows:board.rows.length});
  }catch{/* Invalid prior data must not suppress source retry. */}
 }
 return matches.sort((a,b)=>a.at.localeCompare(b.at)).at(-1)||null;
}
function captureGate({now,eventName,runAttempt=1,files=[],readFile}={}){
 const at=pacificSlot(now),reasons=[];
 if(!at)throw Error("Invalid clock");
 if(eventName!=="schedule"&&eventName!=="workflow_dispatch")
  reasons.push("not_scheduled_or_manual");
 if(runAttempt!==1)reasons.push("rerun_not_allowed");
 // Late GitHub cron is a catch-up, not a historical 09:00 observation.
 if(at.minute<540||at.minute>=1020)
  reasons.push("outside_safe_0900_catchup_window");
 const within=findCompleteSourceArchive(files,readFile,{day:at.day,slot:"09:00"});
 const tagged=findCompletedScheduledCapture(files,readFile,{day:at.day,slot:"09:00"});
 const prior=within||tagged;
 if(prior)reasons.push("already_archived_complete_0900_board");
 return {allow:reasons.length===0,datePacific:at.day,reasons,
  alreadyArchived:!!prior,late:at.minute>=625,
  existingArchiveAt:prior?.at||null,noPaidCallsByGate:true};
}
function watchdog({now,files=[],readFile,movement=null}={}){
 const at=pacificSlot(now);
 if(!at)throw Error("Invalid clock");
 const six=findCompleteSourceArchive(files,readFile,{day:at.day,slot:"06:00"});
 const nine=findCompleteSourceArchive(files,readFile,{day:at.day,slot:"09:00"});
 const taggedSix=findCompletedScheduledCapture(files,readFile,{day:at.day,slot:"06:00"});
 const taggedNine=findCompletedScheduledCapture(files,readFile,{day:at.day,slot:"09:00"});
 // A delayed slot-intent capture is useful operational evidence, but does
 // not replace a genuine clock-window observation or validate morning delta.
 const lateSix=!six&&taggedSix?{at:taggedSix.at,rows:taggedSix.rows}:null;
 const lateNine=!nine&&taggedNine?{at:taggedNine.at,rows:taggedNine.rows}:null;
 const delta=movement?.morningDelta;
 const pair=!!(six&&nine&&delta?.status==="valid_independent_source_delta_only"&&
  Date.parse(delta.previousAt)===Date.parse(six.at)&&
  Date.parse(delta.currentAt)===Date.parse(nine.at));
 return {kind:"nhl_morning_board_watchdog_v1",datePacific:at.day,checkedAt:now,
  source:"independent_prizepicksapi_nhl",
  six:{complete:!!six,at:six?.at||null,rows:six?.rows||0},
  nine:{complete:!!nine,at:nine?.at||null,rows:nine?.rows||0},
  lateSlotIntentCaptures:{six:lateSix,nine:lateNine},
  lateCatchupIsNotAnOnTimeMorningSnapshot:true,
  validSameDayDelta:pair,missingSix:!six,missingNine:!nine,missingDelta:!pair,
  noPaidCallsByWatchdog:true};
}
module.exports={stampFromFilename,validBoard,findCompleteSourceArchive,findCompletedScheduledCapture,captureGate,watchdog};
