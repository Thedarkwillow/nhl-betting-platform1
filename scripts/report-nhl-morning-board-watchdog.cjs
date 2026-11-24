"use strict";
const fs=require("node:fs"),path=require("node:path");
const {watchdog}=require("../src/nhl-morning-board-monitor.cjs");
const snapshotDir="outputs/free-source/nhl/snapshots";
function main(env=process.env){
 const files=fs.existsSync(snapshotDir)?
  fs.readdirSync(snapshotDir).map(f=>path.join(snapshotDir,f)):[];
 const deltaPath="outputs/free-source/nhl/movement-latest.json";
 let movement=null;
 if(fs.existsSync(deltaPath)){
  try{movement=JSON.parse(fs.readFileSync(deltaPath,"utf8"));}catch{}
 }
 const state=watchdog({now:new Date().toISOString(),files,
  readFile:p=>fs.readFileSync(p,"utf8"),movement});
 const stage=env.NHL_MORNING_WATCHDOG_STAGE||"both";
 if(!["six","both"].includes(stage))throw Error("Invalid morning watchdog stage");
 const errors=[];
 if(state.missingSix)errors.push("06:00 Pacific complete source board is missing");
 if(stage==="both"&&state.missingNine)errors.push("09:00 Pacific complete source board is missing");
 if(stage==="both"&&state.missingDelta)errors.push("06:00 versus 09:00 change report is missing or mismatched");
 const report={...state,stage,healthy:errors.length===0,errors};
 fs.mkdirSync("outputs/health",{recursive:true});
 fs.writeFileSync("outputs/health/nhl-morning-board-watchdog.json",JSON.stringify(report,null,2)+"\n");
 if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
  "## Morning NHL full-board capture audit\n"+
  "Stage: "+stage+"; Date Pacific: "+state.datePacific+"\n"+
  "06:00: "+(state.six.complete?"complete":"MISSING")+
  "; 09:00: "+(state.nine.complete?"complete":"MISSING")+
  "; delta: "+(state.validSameDayDelta?"verified independent-source comparison":"missing/mismatch")+
  "\nLate slot-intent captures (not on-time proof): 06:00 "+
  (state.lateSlotIntentCaptures?.six?.at||"none")+", 09:00 "+
  (state.lateSlotIntentCaptures?.nine?.at||"none")+
  "\n"+(errors.join("; ")||"Source archive gates passed.")+"\n");
 if(errors.length){
  for(const error of errors)console.error("::error::"+error);
  process.exitCode=1;
 }else console.log(JSON.stringify({status:"passed",...report}));
 return report;
}
if(require.main===module)try{main()}catch(e){console.error(e);process.exitCode=1;}
module.exports={main};
