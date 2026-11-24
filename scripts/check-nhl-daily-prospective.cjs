"use strict";
const fs=require("node:fs");
const {checkDailyCapture}=require("../src/nhl-daily-prospective-gate.cjs");
function files(dir){
 try{return fs.readdirSync(dir).map(file=>dir+"/"+file);}
 catch(e){if(e.code==="ENOENT")return [];throw e;}
}
function verifiedArchivedBoards(dir){
 return files(dir).flatMap(filename=>{
  try{return [{filename,board:JSON.parse(fs.readFileSync(filename,"utf8"))}];}
  catch{return [];}
 });
}
function main(){
 const result=checkDailyCapture({
  now:new Date().toISOString(),
  eventName:process.env.GITHUB_EVENT_NAME,
  externalTrigger:process.env.NHL_EXTERNAL_TRIGGER||null,
  runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT||1),
  // Do not trust existence of a JSON filename alone for duplicate prevention.
  sourceArchiveFiles:[],researchArchiveFiles:[],
  sourceArchiveRecords:verifiedArchivedBoards("outputs/free-source/nhl/snapshots")
 });
 console.log(JSON.stringify(result));
 if(process.env.GITHUB_OUTPUT)
  fs.appendFileSync(process.env.GITHUB_OUTPUT,
   "allow="+result.allow+"\nalready="+result.alreadyArchived+"\n");
 if(process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   "Pacific-day NHL source capture: "+(result.allow?"authorized once":"skipped")+
   "; date="+result.datePacific+"; reasons="+(result.reasons.join(",")||"none")+
   "; late="+result.late+"; no vendor requests made by gate.\n");
 return result;
}
if(require.main===module)try{main()}catch(e){
 console.error(e.message);process.exitCode=1;
}
module.exports={main};
