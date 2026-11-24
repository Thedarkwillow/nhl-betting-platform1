"use strict";
const fs=require("node:fs"),path=require("node:path");
const {execFileSync}=require("node:child_process");
const {gradePredictions,validArchiveChronology}=require("../src/grade-nhl-predictions.cjs");
const {resolveArchivedGameIdentity}=require("../src/nhl-archived-game-identity.cjs");
const {analyzeProspective}=require("../src/nhl-prospective-quality.cjs");
const {gradeFrozenSelectedLineups}=require("../src/nhl-frozen-selected-lineup-grader.cjs");
const {gradeIndividualPreferences}=require("../src/nhl-frozen-individual-props.cjs");
const root=path.resolve(__dirname,".."),dir=path.join(root,"outputs/research/snapshots");
const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort():[];
const historyPath=path.join(root,"outputs/history/players.json");
if(!fs.existsSync(historyPath))throw Error("Player history unavailable");
const history=JSON.parse(fs.readFileSync(historyPath,"utf8"));
const scheduleFiles=["2026-27","2025-26"];
const scheduleGames=[];
for(const season of scheduleFiles){
 const file=path.join(root,"outputs/official-nhl/season-schedules/"+season+".json");
 if(!fs.existsSync(file))continue;
 let doc;
 try{doc=JSON.parse(fs.readFileSync(file,"utf8"));}
 catch{throw Error("Invalid cached official NHL schedule for "+season);}
 if(doc.complete!==true||!Array.isArray(doc.games))
  throw Error("Cached official NHL schedule not verified complete for "+season);
 scheduleGames.push(...doc.games);
}
const predictions=[],frozenLineupFrames=[];
const seen=new Set(),unresolvedIdentity=[];
const snapshotAudit={totalRankedProps:0,eligiblePredictions:0,
 recoveredGameIdentity:0,recoveredFromArchivedMatchup:0,sameSecondGitProof:0,
 officialScheduleGamesAvailable:scheduleGames.length,
 identityResolutionStatuses:{},
 skipped:{missingGameIdentity:0,missingGameStartAt:0,missingArchiveProof:0,notProvenPregame:0,duplicate:0}};
function firstCommittedAt(file){
 const relative="outputs/research/snapshots/"+file;
 try{
  const output=execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","--",relative],{cwd:root,encoding:"utf8",timeout:10000}).trim();
  return output||null;
 }catch{return null;}
}
for(const file of files){
 const snap=JSON.parse(fs.readFileSync(path.join(dir,file),"utf8"));
 const archivedAt=firstCommittedAt(file);
 const pathInGit="outputs/research/snapshots/"+file;
 const gitHistoryCount=Number(execFileSync("git",["rev-list","--count","HEAD","--",pathInGit],
  {cwd:root,encoding:"utf8",timeout:10000}).trim());
 frozenLineupFrames.push({snapshot:snap,firstCommittedAt:archivedAt,
  gitHistoryCount,path:pathInGit});
 const savedAt=snap.generatedAt;
 for(const archivedProp of snap.rankedProps||[]){
  snapshotAudit.totalRankedProps++;
  // Only recover *identity metadata* at grading time from pre-existing exact
  // teams + event time. The saved snapshot itself remains immutable.
  const resolution=resolveArchivedGameIdentity(archivedProp,scheduleGames);
  const p=resolution.prop;
  snapshotAudit.identityResolutionStatuses[resolution.status]=
   (snapshotAudit.identityResolutionStatuses[resolution.status]||0)+1;
  if(resolution.status==="recovered_from_official_schedule"||resolution.status==="recovered_from_archived_matchup_and_official_schedule")
   snapshotAudit.recoveredGameIdentity++;
  if(resolution.status==="recovered_from_archived_matchup_and_official_schedule")
   snapshotAudit.recoveredFromArchivedMatchup++;
  if(!Number.isInteger(p.gameId)){
   snapshotAudit.skipped.missingGameIdentity++;
   unresolvedIdentity.push({snapshotFile:file,recordedAt:savedAt,reason:resolution.status,
    prop:{team:p.team,matchup:p.matchup,opponent:p.opponent,eventStartsAt:p.eventStartsAt,capturedAt:p.capturedAt}});
   continue;
  }
  if(!p.gameStartAt){snapshotAudit.skipped.missingGameStartAt++;continue;}
  if(!archivedAt||!savedAt){snapshotAudit.skipped.missingArchiveProof++;continue;}
  const generated=Date.parse(savedAt),archived=Date.parse(archivedAt),start=Date.parse(p.gameStartAt);
  if(!validArchiveChronology(Date.parse(p.capturedAt),generated,archived,start)){
   snapshotAudit.skipped.notProvenPregame++;continue;
  }
  if(generated>archived&&Math.floor(generated/1000)===Math.floor(archived/1000))
   snapshotAudit.sameSecondGitProof++;
  const k=[p.playerId,p.gameId,p.market,p.line,p.tier,p.lean].join("|");
  if(seen.has(k)){snapshotAudit.skipped.duplicate++;continue;}
  seen.add(k);
  predictions.push({...p,predictionRecordedAt:savedAt,snapshotArchivedAt:archivedAt});
 }
}
snapshotAudit.eligiblePredictions=predictions.length;
const result=gradePredictions(predictions,history);
result.selectedLineupAudit=gradeFrozenSelectedLineups(frozenLineupFrames,scheduleGames,history);
result.individualPropAudit=gradeIndividualPreferences(frozenLineupFrames,scheduleGames,history);
// Broad source rows include BOTH offered sides; their correctness is not
// verified selection accuracy. Keep the raw numerator but revoke the label.
result.summary.rawOfferedSideCorrectRate=result.summary.verifiedHitRate;
result.summary.verifiedHitRate=null;
result.summary.cohort="raw_offered_higher_and_lower_options_not_optimizer_choices";
result.outcomeEvidence.sourceCohort=result.summary.cohort;
result.summary.modelHitRateFromRawOptionsForbidden=true;
result.snapshotAudit=snapshotAudit;
result.categoryAccuracy=require('../src/nhl-graded-summary.cjs').summarizeGraded(result.graded);
result.categoryAccuracyCohort="raw_offered_sides_not_model_selected";
result.calibration=require("../src/nhl-calibration-gate.cjs").calibrationStatus(result);
result.prospectiveQuality=analyzeProspective(result,scheduleGames,{
 now:new Date().toISOString(),missingIdentity:unresolvedIdentity});
result.generatedAt=new Date().toISOString();
result.predictionSnapshots=files.length;
const output=path.join(root,"outputs/grading/nhl-latest.json");
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({snapshots:files.length,graded:result.summary.graded,
 pending:result.pending.length,pendingReasons:result.prospectiveQuality.pendingReasons,
 frozenIndividualPropPreferences:{
  explicit:result.individualPropAudit.explicitProspective,
  legacyReconstructed:result.individualPropAudit.legacyRetrospective,
  verifiedOriginalPlatformSettlements:false
 },
 selectedOptimizer:result.selectedLineupAudit,
 identityRecovered:snapshotAudit.recoveredGameIdentity,
 identityQuarantined:snapshotAudit.skipped.missingGameIdentity,
 rejected:result.rejected.length,snapshotAudit}));
