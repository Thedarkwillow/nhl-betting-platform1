'use strict';
const fs=require('node:fs');
const {decide,pacific}=require('./pacific-morning-capture-gate.cjs');
const PUBLIC_MORNING_MINUTES=Object.freeze([7,29,41]);
const backupMinute=env=>env.GITHUB_EVENT_NAME==='schedule'?Number(/^(29|41) [69] \* \* \*$/.exec(env.GITHUB_EVENT_SCHEDULE||'')?.[1])||null:null;
const isBackup=env=>backupMinute(env)!==null;
const protectedMorningClock=clock=>[5,6,8,9].includes(clock.hour);

function preflight(env=process.env,now=new Date()){
 const eventName=env.GITHUB_EVENT_NAME,schedule=env.GITHUB_EVENT_SCHEDULE,mode=env.REQUESTED_MODE;
 const morning=eventName==='schedule'&&/^[0-9]{1,2} (6|9) \* \* \*$/.test(schedule)||
  eventName==='workflow_dispatch'&&['capture_0600','capture_0900'].includes(mode);
 if(!morning){
  const clock=pacific(now);
  if(protectedMorningClock(clock))return {proceed:false,state:'protect_morning_hour',clock,providerRequests:0};
  return {proceed:true,state:'not_a_morning_capture'};
 }
 const gate=decide({eventName,mode,schedule,now});
 const earlyBackup=isBackup(env)&&gate.clock.minute<backupMinute(env);
 const proceed=gate.allowed&&!earlyBackup&&gate.clock.minute<55; // The existing board loop stops before :55.
 return {proceed,state:gate.allowed&&!proceed?(earlyBackup?'before_backup_minute':'board_collection_cutoff'):gate.state,
  expected:gate.expected,clock:gate.clock,providerRequests:0,originalSixToNineCaptureClaim:false};
}
function backupPreflight(root,env=process.env,now=new Date(),missingCore=require('./pickfinder-public-morning-audit.cjs').missingCoreSlotPartitions){
 const check=preflight(env,now);
 if(!check.proceed||!isBackup(env))return check;
 const missingPartitions=missingCore(root,check.clock.day,check.expected);
 return {...check,missingPartitions,proceed:missingPartitions.length>0,
  state:missingPartitions.length?'backup_actual_hour_missing_core_partitions':'backup_skipped_all_core_partitions_verified'};
}
if(require.main===module){
 const response=process.argv[2]==='--backup-archive'?backupPreflight(process.argv[3]):preflight();
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'proceed='+response.proceed+'\n');
 if(!response.proceed&&process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,response.state==='backup_skipped_all_core_partitions_verified'
  ?`Skipped duplicate backup for ${response.expected} Pacific because all six core partitions are verified. No provider requests from this attempt.\n`
  :response.state==='protect_morning_hour'
  ?`Deferred non-morning browser work during a protected capture hour. No provider requests from this attempt.\n`
  :`No ${response.expected} Pacific capture from this attempt. The actual clock was ${response.clock.day} ${response.clock.hour}:${String(response.clock.minute).padStart(2,'0')} Pacific. No provider requests.\n`);
 console.log(JSON.stringify(response));
}
module.exports={preflight,backupPreflight,isBackup,protectedMorningClock,PUBLIC_MORNING_MINUTES};
