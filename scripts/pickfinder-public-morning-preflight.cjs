'use strict';
const fs=require('node:fs');
const {decide}=require('./pacific-morning-capture-gate.cjs');

function preflight(env=process.env,now=new Date()){
 const eventName=env.GITHUB_EVENT_NAME,schedule=env.GITHUB_EVENT_SCHEDULE,mode=env.REQUESTED_MODE;
 const morning=eventName==='schedule'&&/^[0-9]{1,2} (6|9) \* \* \*$/.test(schedule)||
  eventName==='workflow_dispatch'&&['capture_0600','capture_0900'].includes(mode);
 // The public runner retains its unrelated research modes and its own clock check.
 if(!morning)return {proceed:true,state:'not_a_morning_capture'};
 const gate=decide({eventName,mode,schedule,now});
 const earlyBackup=eventName==='schedule'&&/^29 [69] \* \* \*$/.test(schedule)&&gate.clock.minute<29;
 const proceed=gate.allowed&&!earlyBackup&&gate.clock.minute<55; // The existing board loop stops before :55.
 return {proceed,state:gate.allowed&&!proceed?(earlyBackup?'before_backup_minute':'board_collection_cutoff'):gate.state,
  expected:gate.expected,clock:gate.clock,providerRequests:0,originalSixToNineCaptureClaim:false};
}
function backupPreflight(root,env=process.env,now=new Date(),hasVerified=require('./pickfinder-public-morning-audit.cjs').hasVerifiedSlotPartition){
 const check=preflight(env,now);
 if(!check.proceed||env.GITHUB_EVENT_NAME!=='schedule'||!/^29 [69] \* \* \*$/.test(env.GITHUB_EVENT_SCHEDULE||''))return check;
 const exists=hasVerified(root,check.clock.day,check.expected);
 return {...check,proceed:!exists,state:exists?'backup_skipped_verified_partition_exists':'backup_actual_hour_no_verified_partition'};
}
if(require.main===module){
 const response=process.argv[2]==='--backup-archive'?backupPreflight(process.argv[3]):preflight();
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'proceed='+response.proceed+'\n');
 if(!response.proceed&&process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,response.state==='backup_skipped_verified_partition_exists'
  ?`Skipped duplicate backup for ${response.expected} Pacific because a verified partition already exists. No provider requests from this attempt.\n`
  :`No ${response.expected} Pacific capture from this attempt. The actual clock was ${response.clock.day} ${response.clock.hour}:${String(response.clock.minute).padStart(2,'0')} Pacific. No provider requests.\n`);
 console.log(JSON.stringify(response));
}
module.exports={preflight,backupPreflight};
