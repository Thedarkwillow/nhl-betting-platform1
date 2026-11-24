"use strict";
/**
 * Gate 06:00 Pacific NHL scheduled collection and delayed catch-up.
 * An actual 12:17 capture is not mislabeled as a 06:00 observation.
 * Verify complete source archive metadata before blocking a retry.
 */
const TZ="America/Los_Angeles";
function pacificDate(value){
 const parsed=Date.parse(value);
 if(!Number.isFinite(parsed))return null;
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(parsed));
 const val=k=>parts.find(x=>x.type===k)?.value;
 return [val("year"),val("month"),val("day")].join("-");
}
function pacificClockMinute(iso){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
 const part=k=>Number(parts.find(p=>p.type===k)?.value);
 return part('hour')*60+part('minute');
}
const isSixAmWindow=iso=>{
 const minute=pacificClockMinute(iso);return minute>=360&&minute<420;
};
function completePurposeSource({filename,board},today){
 const fileTime=utcArchiveDate(filename);
 const at=Date.parse(board?.generatedAt),ft=Date.parse(fileTime);
 return !!(fileTime&&Number.isFinite(at)&&at>=ft&&at<ft+1000&&
  pacificDate(board.generatedAt)===today&&
  board.requestedScheduledSlotPacific==="06:00"&&
  board.provider==="prizepicksapi.com"&&board.sourceStatus==="fresh"&&
  board.completePagination===true&&Array.isArray(board.rows)&&board.rows.length>0);
}
function utcArchiveDate(filename){
 const m=String(filename||"").match(/(?:^|\/)(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.json$/);
 if(!m)return null;
 const iso=m[1]+"-"+m[2]+"-"+m[3]+"T"+m[4]+":"+m[5]+":"+m[6]+"Z";
 const ms=Date.parse(iso);
 return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,19).replace(/[-:]/g,"")+"Z"===
  m[1]+m[2]+m[3]+"T"+m[4]+m[5]+m[6]+"Z"?iso:null;
}
function checkDailyCapture({now=new Date().toISOString(),eventName,runAttempt=1,
 externalTrigger=null,
 sourceArchiveFiles=[],researchArchiveFiles=[],sourceArchiveRecords=[]}={}){
 const today=pacificDate(now),reasons=[];
 if(!today)throw Error("Invalid NHL daily-capture clock");
 const externalDispatch=eventName==="workflow_dispatch"&&
  externalTrigger==="external_cloudflare_cron";
 if(eventName!=="schedule"&&!externalDispatch)
  reasons.push("not_the_daily_schedule_or_labeled_external_dispatch");
 if(runAttempt!==1)reasons.push("workflow_rerun_not_allowed");
 // Cron is often delayed. Permit an actual same-day capture from 06:00 up to
 // 17:00 Pacific; do not change the real source timestamp to 06:00.
 const minute=pacificClockMinute(now);
 if(minute<360||minute>=1020)reasons.push("outside_safe_0600_catchup_window");
 const olderSlots=[...sourceArchiveFiles,...researchArchiveFiles]
  .filter(x=>typeof x==="string").map(utcArchiveDate)
  .filter(Boolean).some(iso=>pacificDate(iso)===today&&isSixAmWindow(iso));
 const completedPurposes=sourceArchiveRecords.some(x=>completePurposeSource(x,today));
 const prior=olderSlots||completedPurposes;
 if(prior)reasons.push("already_archived_on_this_pacific_day");
 return {allow:reasons.length===0,datePacific:today,reasons,
  alreadyArchived:prior,late:minute>=420,
  maxDailySourceAttempts:1,providerQuotaPreflightRequired:true,
  newProviderCallsByGate:0,schedulePacific:"06:00 daily",actualClockMinute:minute,
  triggerKind:externalDispatch?"external_cloudflare_cron":"github_schedule"};
}
module.exports={TZ,pacificDate,utcArchiveDate,checkDailyCapture};
