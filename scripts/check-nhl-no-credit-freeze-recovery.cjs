"use strict";
const fs=require("node:fs"),path=require("node:path");
const {framesFromGit}=require("./build-nhl-private-ledger-and-labs.cjs");
const {freezeIndividualPreferences}=require("../src/nhl-frozen-individual-props.cjs");
const {pacificDate}=require("../src/nhl-daily-prospective-gate.cjs");
const {recoveryGate}=require("../src/nhl-no-credit-freeze-recovery.cjs");
const ROOT=path.resolve(__dirname,"..");
const read=rel=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,rel),"utf8"))}catch{return null}};
function main(){
 const now=new Date().toISOString(),official=read("outputs/official-nhl/season-schedules/2026-27.json");
 if(official?.complete!==true||!Array.isArray(official.games))
  throw Error("Cached independent official NHL schedule is missing or incomplete");
 const frozen=freezeIndividualPreferences(framesFromGit(),official.games);
 const today=pacificDate(now);
 const archivedToday=frozen.explicit.filter(r=>
  pacificDate(r.snapshotArchivedAt)===today&&
  Number.isFinite(Date.parse(r.snapshotArchivedAt))&&
  Date.parse(r.snapshotArchivedAt)<Date.parse(r.gameStartAt));
 const board=read("outputs/free-source/nhl/latest.json");
 const upcoming=official.games.filter(g=>Number.isInteger(g.id)&&
   Number.isFinite(Date.parse(g.startTimeUTC))&&
   Date.parse(g.startTimeUTC)>Date.parse(now)+15*60000&&
   Date.parse(g.startTimeUTC)<Date.parse(now)+72*3600000);
 const audit=upcoming.length===0?{datePacific:today,
  status:"no_scheduled_eligible_future_nhl_games",
  recover:false,sourceAgeMinutes:null}:recoveryGate({now,board,alreadyFrozen:archivedToday.length});
 console.log(JSON.stringify({status:audit.status,datePacific:audit.datePacific,
  archivedOriginalModelPicks:archivedToday.length,
  originalSnapshotAudit:{unproven:frozen.audit.unprovenSnapshots,
   invalid:frozen.audit.invalidIdentityOrPregameProof},
  independentSourceAgeMinutes:audit.sourceAgeMinutes,
  sourceQuotaCalls:0,noWagers:true}));
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,
  "recover="+audit.recover+"\nverified="+(archivedToday.length>0)+"\nskip="+(upcoming.length===0)+"\nstatus="+audit.status+"\n");
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  "06 AM no-credit NHL pregame freeze: "+audit.status+
  "; actual source age minutes="+audit.sourceAgeMinutes+
  "; original same-day Git-frozen selections="+archivedToday.length+
  ". No paid provider request; no guaranteed successful original app offers.\n");
 return audit;
}
if(require.main===module)try{main()}catch(e){
 console.error("::error::"+e.message);process.exitCode=1;}
module.exports={main};
