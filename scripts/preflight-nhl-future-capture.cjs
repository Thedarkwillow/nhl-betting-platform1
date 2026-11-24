"use strict";
/** Cache-only prerequisite check before metered independent provider calls. */
const fs=require("node:fs"),path=require("node:path");
const {sourceReadiness}=require("../src/nhl-prospective-freeze-readiness.cjs");
const ROOT=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
function main({now=new Date().toISOString()}={}){
 const result=sourceReadiness({
  now,schedule:read("outputs/official-nhl/season-schedules/2026-27.json"),
  history:read("outputs/history/players.json"),
  projections:read("outputs/projections/players.json")
 });
 console.log(JSON.stringify({sourceReady:result.ready,
  preflightNoCredit:true,officialFutureGames:result.upcomingOfficialGames,
  officialLatestDate:result.lastOfficialStatsDate,
  frozenSelectionPolicy:result.originalSelectionPolicy,
  missingPrerequisites:result.reasons,newProviderRequests:0}));
 if(!result.ready)throw Error("No paid NHL projection requests while official model prerequisites are missing: "+result.reasons.join(", "));
 return result;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
