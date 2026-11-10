"use strict";
/**
 * A scheduled dispatch can be delayed for hours. We MUST bind the requested
 * schedule's own 6AM/9AM slot to the ACTUAL America/Los_Angeles clock,
 * never reroute a late 6AM run to 9AM, and never backdate a capture.
 *
 * This pure gate intentionally makes NO provider requests.
 */
const fs=require("node:fs");
const TZ="America/Los_Angeles";
const WINDOWS=Object.freeze({"6":"06:00","9":"09:00"});
const RETRIES=Object.freeze([7,17,29,41,53]);
const MAX_START_MINUTE=55;
function pacific(at){
 const date=at instanceof Date?at:new Date(at);
 if(!Number.isFinite(date.getTime()))throw Error("Invalid capture clock");
 const p=new Intl.DateTimeFormat("en-US",{timeZone:TZ,
  year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
 const n=Object.fromEntries(p.map(v=>[v.type,v.value]));
 return {day:n.year+"-"+n.month+"-"+n.day,
  hour:Number(n.hour),minute:Number(n.minute)};
}
function intendedScheduledSlot(cron){
 const match=typeof cron==="string"&&cron.match(/^([0-9]{1,2}) ([69]) \* \* \*$/);
 if(!match||!RETRIES.includes(Number(match[1])))
  throw Error("Unrecognized scheduled cron; refuse mislabelled board capture");
 return WINDOWS[match[2]];
}
function decide({eventName,mode="",schedule="",now=new Date()}={}){
 const clock=pacific(now),current=WINDOWS[String(clock.hour)]||null;
 let expected;
 if(eventName==="schedule")expected=intendedScheduledSlot(schedule);
 else if(eventName==="workflow_dispatch"){
  if(mode==="probe_now")return {allowed:false,state:"probe_only",expected:null,clock};
  if(!["capture_0600","capture_0900"].includes(mode))
   throw Error("Manual capture mode not recognized");
  expected=mode==="capture_0600"?"06:00":"09:00";
 }else throw Error("Unrecognized invocation; no source fetch");
 if(current!==expected||clock.minute>MAX_START_MINUTE)
  return {allowed:false,state:"skipped_late_or_outside_original_pacific_hour",
   expected,actualSlot:current,clock,providerRequests:0,
   originalSixToNineCaptureClaim:false};
 return {allowed:true,state:"eligible_actual_hour_only",
  expected,actualSlot:current,clock,providerRequests:0,
  originalSixToNineCaptureClaim:false};
}
function main({env=process.env,now=new Date()}={}){
 const d=decide({eventName:env.GITHUB_EVENT_NAME,
  mode:env.REQUESTED_MODE||"",schedule:env.GITHUB_EVENT_SCHEDULE||"",now});
 if(d.allowed&&(!env.PRIVATE_RESEARCH_REPO_TOKEN||
  !env.PRIVATE_RESEARCH_REPO_TOKEN.trim()))
  throw Error("Missing private research token for actual-hour full archive");
 if(env.GITHUB_OUTPUT)
  fs.appendFileSync(env.GITHUB_OUTPUT,
   "allowed="+String(d.allowed)+"\n"+
   "state="+d.state+"\n"+
   "slot="+(d.allowed?d.expected:"")+"\n"+
   "local_day="+d.clock.day+"\n");
 const response={state:d.state,eligible:d.allowed,
  requested:d.expected,actual:d.actualSlot,
  observedPacificDay:d.clock.day,observedPacificHour:d.clock.hour,
  observedPacificMinute:d.clock.minute,
  rawPlayerRowsWrittenPublicly:0,providerRequests:0,
  noRetroactiveCaptureClaims:true};
 console.log(JSON.stringify(response));
 return response;
}
if(require.main===module){
 try{main()}catch(e){console.error("Capture preflight: "+e.message);process.exitCode=1;}
}
module.exports={TZ,WINDOWS,RETRIES,MAX_START_MINUTE,pacific,intendedScheduledSlot,decide,main};
