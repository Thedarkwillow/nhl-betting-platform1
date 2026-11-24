"use strict";
const fs=require("node:fs"),path=require("node:path");
const {captureGate}=require("../src/nhl-morning-board-monitor.cjs");
const directory="outputs/free-source/nhl/snapshots";
function main(env=process.env){
 const files=fs.existsSync(directory)?fs.readdirSync(directory).map(f=>path.join(directory,f)):[];
 const result=captureGate({now:new Date().toISOString(),eventName:env.GITHUB_EVENT_NAME,
  runAttempt:Number(env.GITHUB_RUN_ATTEMPT||1),files,
  readFile:p=>fs.readFileSync(p,"utf8")});
 console.log(JSON.stringify(result));
 if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,
  "allow="+result.allow+"\nalready="+result.alreadyArchived+"\n");
 if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
  "NHL 09:00 fresh-source retry: "+(result.allow?"requested":"skipped")+
  ". "+(result.reasons.join(", ")||"No duplicate complete archive.")+
  "; late="+result.late+"\n");
 return result;
}
if(require.main===module)try{main()}catch(e){
 console.error(e.message);process.exitCode=1;
}
module.exports={main};
