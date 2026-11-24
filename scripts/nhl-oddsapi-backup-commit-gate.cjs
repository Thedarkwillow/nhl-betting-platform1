"use strict";
/** Git-only gate: avoid a second paid vendor request after any valid
 * prospective pregame selection, and verify this backup's archive.
 */
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {verifyFrozenCommit}=require("../src/nhl-frozen-commit-verifier.cjs");
const ROOT=path.resolve(__dirname,"..");
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),"utf8"));
function verifyPath(relative,official){
 const snapshot=read(relative);
 const committed=execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","--",relative],
  {cwd:ROOT,encoding:"utf8",timeout:12000}).trim();
 const count=Number(execFileSync("git",["rev-list","--count","HEAD","--",relative],
  {cwd:ROOT,encoding:"utf8",timeout:12000}).trim());
 return verifyFrozenCommit({research:snapshot,snapshot,gitCommittedAt:committed,
  gitHistoryCount:count,officialGames:official.games});
}
function existingFrozenCohort(since="2026-11-05T00:00:00Z"){
 const official=read("outputs/official-nhl/season-schedules/2026-27.json");
 if(official.complete!==true)throw Error("No complete official NHL schedule");
 const dir="outputs/research/snapshots",abs=path.join(ROOT,dir);
 if(!fs.existsSync(abs))return {exists:false};
 for(const name of fs.readdirSync(abs).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort().reverse()){
  const relative=dir+"/"+name,doc=read(relative);
  if(!Number.isFinite(Date.parse(doc.generatedAt))||Date.parse(doc.generatedAt)<Date.parse(since))break;
  if(!Array.isArray(doc.individualPropSelections)||!doc.individualPropSelections.length)continue;
  const verified=verifyPath(relative,official);
  if(verified.verified)return {exists:true,path:relative,verifiedSelections:verified.eligible};
 }
 return {exists:false};
}
function verifyLatestBackup(){
 const backup=read("outputs/prizepicks-backup/nhl/research-latest.json");
 if(backup.sourceScope!=="verified_selected_events"||backup.boardCoverageComplete!==false)
  throw Error("Backup original research misclassified as a full NHL board");
 const age=Date.now()-Date.parse(backup.generatedAt);
 if(!Number.isFinite(age)||age<0||age>60*60000)
  throw Error("Backup model Git proof out of current pregame time window");
 const stamp=backup.generatedAt.slice(0,19).replace(/[-:]/g,"")+"Z";
 const relative="outputs/research/snapshots/"+stamp+".json";
 const original=read(relative);
 if(JSON.stringify(original)!==JSON.stringify(backup))
  throw Error("Backup latest research differs from original committed selection");
 const official=read("outputs/official-nhl/season-schedules/2026-27.json");
 const result=verifyPath(relative,official);
 console.log(JSON.stringify({verified:result.verified,selected:result.eligible,
  sourceScope:"one_or_two_verified_NHL_events",fullBoardCoverage:false,
  originalPrizePicksPlatformAuthenticated:false,
  originalPlatformPayoutVerified:false,originalFile:relative,
  reason:result.reason}));
 if(!result.verified)throw Error("Backup original individual directions are not Git-frozen pregame");
 return result;
}
if(require.main===module)try{
 const mode=process.argv[2];
 if(mode==="guard"){const x=existingFrozenCohort();
  console.log(JSON.stringify(x));process.exitCode=x.exists?0:1;
 }else if(mode==="verify")verifyLatestBackup();
 else throw Error("Use guard or verify");
}catch(e){console.error("NHL backup Git gate: "+e.message);process.exitCode=2;}
module.exports={existingFrozenCohort,verifyLatestBackup};
