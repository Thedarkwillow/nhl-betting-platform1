"use strict";
/** Strict read-only independent official-schedule + Git commit audit. */
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const ROOT=path.resolve(__dirname,"..");
const parseTime=v=>Number.isFinite(Date.parse(v))?Date.parse(v):null;
function auditSnapshot(snapshot,{gitCommitAt,gitCommitSha,pathInRepo,gitCommitsTouchingFile,schedule}){
 if(snapshot?.kind!=="nhl_live_distribution_shadow_unconfirmed_git_archive"||
    !Array.isArray(snapshot.rows)||!schedule?.complete||!Array.isArray(schedule.games)||
    !parseTime(gitCommitAt)||!/^[0-9a-f]{40}$/i.test(String(gitCommitSha))||
    !Number.isInteger(gitCommitsTouchingFile)||gitCommitsTouchingFile<1)
  throw Error("Missing frozen NHL distribution snapshot, official schedule or Git commit evidence");
 const original=Number.isFinite(parseTime(snapshot.generatedAt))?parseTime(snapshot.generatedAt):null;
 const commitAt=parseTime(gitCommitAt),officialById=new Map(schedule.games.map(g=>[g.id,g]));
 const details=[],counts={sourceRows:snapshot.rows.length,proofRows:0,rejectedRows:0,
  missingOfficialGame:0,officialStartConflict:0,gitCommittedAfterStart:0,
  badSourceTimestamp:0,modifiedAfterFirstCommit:0,duplicateOffer:0,other:0};
 const ids=new Set();
 for(const row of snapshot.rows){
  let reason=null;
  const id=row.gameId,official=officialById.get(id),start=parseTime(official?.startTimeUTC),
   sourceObserved=parseTime(row.sourceObservedAt),sourceCaptured=parseTime(row.sourceCapturedAt),
   offerStart=parseTime(row.eventStartsAt),asOf=parseTime(row.asOf);
  const key=[id,row.playerId,row.market,row.line,row.tier,row.selectedSide].join("|");
  if(ids.has(key))reason="duplicateOffer";
  ids.add(key);
  if(!reason&&(!official||!start||!Number.isInteger(id)))reason="missingOfficialGame";
  if(!reason&&(!offerStart||Math.abs(start-offerStart)>5*60000||
   !Number.isFinite(start)))reason="officialStartConflict";
  if(!reason&&(!sourceObserved||!sourceCaptured||!asOf||!original||
   sourceObserved>sourceCaptured||sourceCaptured>asOf||asOf!==original||
   asOf>commitAt||sourceCaptured>=start))reason="badSourceTimestamp";
  if(!reason&&commitAt>=start)reason="gitCommittedAfterStart";
  if(!reason&&gitCommitsTouchingFile!==1)reason="modifiedAfterFirstCommit";
  if(!reason&&(!Number.isInteger(row.playerId)||row.playerId<=0||
   !Number.isFinite(row.line)||row.line<0||!Number.isFinite(row.originalHigher)||
   !Number.isFinite(row.shadowHigher)||!["Higher","Lower"].includes(row.selectedSide)))
   reason="other";
  if(reason){counts.rejectedRows++;counts[reason]++;}
  else counts.proofRows++;
  details.push({playerId:row.playerId,gameId:id,market:row.market,line:row.line,
   tier:row.tier,selectedSide:row.selectedSide,
   officialGameStartAt:official?.startTimeUTC||null,sourceObservedAt:row.sourceObservedAt,
   snapshotAsOf:row.asOf,gitCommitAt,
   sourceObservedBeforeGame:sourceObserved!==null&&start!==null&&sourceObserved<start,
   gitCommitBeforeGame:commitAt!==null&&start!==null&&commitAt<start,
   officialGameIdentityMatched:reason!=="missingOfficialGame"&&reason!=="officialStartConflict",
   auditStatus:reason||"git_timing_and_official_start_reconciled",
   eligibleForFutureOfficialNhlStatGrading:reason===null,
   officialResult:null,originalPlatformOfferVerified:false,
   originalPlatformSettlementVerified:false,commercialDistributionCalibrated:false});
 }
 return {schemaVersion:1,kind:"nhl_git_verified_shadow_pregame_timestamp_audit",
  snapshotFile:pathInRepo,sourceSnapshotAsOf:snapshot.generatedAt,
  gitCommitSha,gitCommitAt,commitHistoryCount:gitCommitsTouchingFile,
  officialScheduleSeason:schedule.season||null,
  counts,details,prospectiveStatForecastArchiveCandidates:counts.proofRows,
  authenticatedOriginalPrizePicksOfferAndSettlement:false,
  allGameOutcomesPending:true,officialResultsGraded:0,
  payoutEVVerified:false,independentGitServerPushTimeVerified:false,
  caveat:"Git commit metadata and official NHL schedule verify chronological archive candidates, not the original fantasy platform quote authenticity, platform settlement, or future statistical correctness. Git dates can be user-set; independent GitHub Actions run/push timestamps can strengthen time proof. Actual game official FINAL stats still required."};
}
function newestSnapshots(dir){return fs.readdirSync(dir).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort().slice(-25);}
function gitEvidence(file){
 const raw=cp.execFileSync("git",["log","-1","--format=%H|%cI","--",file],{cwd:ROOT,encoding:"utf8"}).trim();
 const [sha,date]=raw.split("|");
 const count=Number(cp.execFileSync("git",["rev-list","--count","HEAD","--",file],{cwd:ROOT,encoding:"utf8"}).trim());
 return {sha,date,count};
}
function main(){
 const dir=path.join(ROOT,"outputs/projections/distribution-snapshots");
 if(!fs.existsSync(dir))throw Error("No original distribution-shadows captured");
 const schedule=JSON.parse(fs.readFileSync(path.join(ROOT,"outputs/official-nhl/season-schedules/2026-27.json"),"utf8"));
 const result=[],error=[];
 for(const name of newestSnapshots(dir)){
  const rel=path.posix.join("outputs/projections/distribution-snapshots",name);
  try{
   const frozen=JSON.parse(fs.readFileSync(path.join(ROOT,rel),"utf8")),
    git=gitEvidence(rel);
   result.push(auditSnapshot(frozen,{gitCommitAt:git.date,gitCommitSha:git.sha,
    pathInRepo:rel,gitCommitsTouchingFile:git.count,schedule}));
  }catch(e){error.push({snapshot:rel,reason:e.message});}
 }
 if(!result.length)throw Error("No audit-eligible Git distribution snapshots found: "+JSON.stringify(error));
 const out={kind:"nhl_distribution_shadow_pregame_archive_proof",
  generatedAt:new Date().toISOString(),source:"Git commit history plus official NHL season schedule",
  snapshots:result.length,totalOfferedRows:result.reduce((s,r)=>s+r.counts.sourceRows,0),
  gitAndOfficialStartMatchedRows:result.reduce((s,r)=>s+r.counts.proofRows,0),
  rejectedRows:result.reduce((s,r)=>s+r.counts.rejectedRows,0),
  errors:error,bySnapshot:result,
  originalPlatformSettlementVerified:false,officialOutcomesGraded:false,
  modelChallengerDeployed:false,
  warning:"Recorded-before-start Git metadata with official game IDs, not independently authenticated PrizePicks offers or statistically graded decisions. No money results. Git authored/committer times can be user-controlled; record CI run creation time as further provenance."};
 const p=path.join(ROOT,"outputs/backtests/nhl-distribution-pregame-proof-latest.json");
 fs.mkdirSync(path.dirname(p),{recursive:true});
 fs.writeFileSync(p,JSON.stringify(out,null,2)+"\n");
 console.log(JSON.stringify({snapshots:out.snapshots,rows:out.totalOfferedRows,
  timingProof:out.gitAndOfficialStartMatchedRows,rejected:out.rejectedRows,
  errorSnapshots:error.length,platformSettlement:false}));
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={auditSnapshot,gitEvidence,main};
