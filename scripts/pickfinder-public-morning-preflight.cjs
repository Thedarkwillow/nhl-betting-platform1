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
 const proceed=gate.allowed&&gate.clock.minute<55; // The existing board loop stops before :55.
 return {proceed,state:gate.allowed&&!proceed?'board_collection_cutoff':gate.state,
  expected:gate.expected,clock:gate.clock,providerRequests:0,originalSixToNineCaptureClaim:false};
}
if(require.main===module){
 const response=preflight();
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'proceed='+response.proceed+'\n');
 if(!response.proceed&&process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  `No ${response.expected} Pacific capture. The actual clock was ${response.clock.day} ${response.clock.hour}:${String(response.clock.minute).padStart(2,'0')} Pacific. No provider requests.\n`);
 console.log(JSON.stringify(response));
}
module.exports={preflight};
