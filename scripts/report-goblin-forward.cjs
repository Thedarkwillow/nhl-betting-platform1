"use strict";
/**
 * Private no-credit NHL Goblin future-only shadow. Do not reuse prior frozen
 * 6AM board after a new policy commit; a new original Git source is mandatory.
 * No raw player data is written to public repositories.
 */
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const {mergeHistory}=require("../src/nhl-specialist-history-recovery.cjs");
const goblin=require("../src/goblin-opportunity-evidence.cjs");
const {filterNHL}=require("../src/goblin-selective-abstention-v1.cjs");
const {summarize: goblinScreenAudit}=require("../src/goblin-prospective-selectivity-audit.cjs");
const {pendingTriage,standardMarkets,sportsbookGap,calibrationHoldout}=require("../src/nhl-four-priority-research-audit.cjs");
const {auditNFL}=require("../src/nfl-goblin-identity-audit-v1.cjs");
const {build:buildNFLGameBridge}=require("../src/nfl-goblin-schedule-bridge-v1.cjs");
const {build:buildNFLIdentityCandidates}=require("../src/nfl-goblin-free-identity-research.cjs");
const {scan:scanOfficialNFLActive}=require("../src/nfl-goblin-official-active-mentions.cjs");
const {summarize:summarizeNFLReported}=require("../src/nfl-official-injury-evidence-counts.cjs");
const {summarize:summarizeNFLInjuryOverlap}=require("../src/nfl-goblin-independent-injury-corroboration.cjs");
const {gunzipSync}=require("node:zlib");
const {canonical}=require("../src/nhl-opponent-context.cjs");
const ROOT=path.resolve(__dirname,".."),SRC="outputs/research/snapshots",
 DEST="outputs/research/goblin-future",HEALTH="outputs/health/goblin-forward-latest.json";
const COHORT_FILE=/^\d{8}T\d{6}Z\.json$/;
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
const list=(dir,re)=>fs.existsSync(path.join(ROOT,dir))?
 fs.readdirSync(path.join(ROOT,dir)).filter(x=>re.test(x)).sort():[];
const git=(...args)=>cp.execFileSync("git",args,{cwd:ROOT,timeout:25000,
 encoding:"utf8",maxBuffer:36*1024*1024}).trim();
function firstGit(file){
 try{
  const commits=git("log","--diff-filter=A","--format=%H","--",file).split("\n").filter(Boolean);
  if(commits.length!==1)return null;
  const at=git("show","-s","--format=%cI",commits[0]);
  if(!Number.isFinite(Date.parse(at)))return null;
  return {commit:commits[0],at};
 }catch{return null;}
}
function original(file){
 const id=firstGit(file);if(!id)return null;
 try{
  const current=read(file),frozen=JSON.parse(git("show",id.commit+":"+file));
  if(JSON.stringify(current)!==JSON.stringify(frozen))return null;
  return {...id,data:frozen};
 }catch{return null;}
}
function playerHistory(){
 const training="outputs/period-stats/training-source",
 pp="outputs/research/nhl-pp-history";
 return mergeHistory(read("outputs/history/players.json"),
  list(training,/^\d{4}-\d{2}-\d{2}\.json$/).map(n=>read(training+"/"+n)),
  list(pp,/^\d{4}-\d{2}-\d{2}\.json$/).flatMap(n=>{
   const r=read(pp+"/"+n);
   return r.kind==="official_nhl_exact_game_pp_time_v1"?r.rows:[];
  })).history;
}
const n=x=>Number.isInteger(x)&&x>=0;
function buildOpponentHistory(history,sourceAt){
 const end=new Date(Date.parse(sourceAt)-48*3600000).toISOString().slice(0,10);
 const byGame=new Map(),teams=new Map(),league=[];
 for(const h of Object.values(history?.players||{})){
  for(const x of h.games||[]){
   if(x?.type!=="skater"||!["OFF","FINAL"].includes(x.gameState)||
    !n(x.gameId)||!n(x.playerId)||!n(x.shotsOnGoal)||
    !n(x.goals)||x.goals>x.shotsOnGoal||
    !(x.gameDate<end)||!canonical(x.team))continue;
   const b=byGame.get(x.gameId)||[];b.push(x);byGame.set(x.gameId,b);
  }
 }
 for(const rows of byGame.values()){
  const teamsInGame=new Map();
  for(const row of rows){
   const k=canonical(row.team),t=teamsInGame.get(k)||[];
   t.push(row);teamsInGame.set(k,t);
  }
  if(teamsInGame.size!==2||[...teamsInGame.values()].some(a=>a.length!==18)||
   new Set(rows.map(x=>x.playerId)).size!==36||
   new Set(rows.map(x=>x.gameDate)).size!==1)continue;
  const entries=[...teamsInGame],clubShots=entries.map(([,rs])=>
   rs.reduce((v,x)=>v+x.shotsOnGoal,0));
  for(let i=0;i<2;i++){
   const [team]=entries[i],at=rows[0].gameDate,
    t=teams.get(team)||[];
   t.push({date:at,shotsAllowed:clubShots[1-i]});teams.set(team,t);
   league.push(clubShots[i]);
  }
 }
 const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
 const leagueMean=league.length?avg(league):null;
 return {get(opponent){
  const t=teams.get(canonical(opponent))||[];
  const h=t.sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
  if(h.length<8||!leagueMean||!Number.isFinite(leagueMean))return null;
  const knownAt=h.at(-1).date+"T23:59:59Z";
  if(Date.parse(knownAt)>=Date.parse(sourceAt))return null;
  return {source:"prior_complete_official_games",games:h.length,
   ratio:avg(h.map(x=>x.shotsAllowed))/leagueMean,
   gameDate:h.at(-1).date,knownAt};
 }};
}
function write(file,value,immutable=false){
 const output=path.join(ROOT,file);
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(value,null,2)+"\n",
  immutable?{flag:"wx"}:{});
}
/** Original NHL pregame freezes use snapshotKind, not kind. This exact
 * schema is checked before any candidate is built; all original source
 * first-Git chronology and the 30-minute cutoff remain mandatory.
 */
function sourceEligibility({policy,source,now}={}){
 const fail=status=>({eligible:false,status});
 const p=Date.parse(policy?.at),t=Date.parse(now),s=Date.parse(source?.data?.generatedAt),
   committed=Date.parse(source?.at),d=source?.data;
 if(!Number.isFinite(p))return fail("original_goblin_policy_first_git_missing");
 if(!source||!d)return fail("original_nhl_snapshot_first_git_missing");
 if(d.snapshotKind!=="nhl_partner_direct_original_pregame_candidate_unproven_until_first_git_commit"||
   d.originalModelSelectionGitFrozen!==false||
   d.boardFresh!==true||d.boardCoverageComplete!==true||
   d.captureScopeComplete!==true||!Array.isArray(d.rankedProps))
  return fail("wrong_original_nhl_snapshot_schema");
 if(![t,s,committed].every(Number.isFinite)||s<=p||
   committed<s-1000||committed>t||
   t<s||t-s>30*60000)
  return fail("source_before_policy_or_outside_first_git_30min_window");
 if(!d.rankedProps.length)return fail("original_nhl_snapshot_has_no_ranked_props");
 return {eligible:true,status:"eligible_new_original_git_source"};
}
/** A previously remotely first-Git-archived cohort wins. Do not refreeze
 * the same source when the 6:37/9:37 schedule or workflow_run retries.
 * Grading remains allowed with fresh official outcomes.
 */
function existingFirstGitSource(sourceFile,sourceCommit,records){
 const n=(records||[]).find(x=>x?.data?.kind===
  "nhl_goblin_first_git_pending_precommit_v1"&&
  x?.data?.modelPromoted===false&&x.data.sourceSnapshotFile===sourceFile&&
  x.data.sourceCommit===sourceCommit&&
  Array.isArray(x.data.records)&&x.data.records.length>0&&
  Number.isFinite(Date.parse(x.at)));
 return n||null;
}
/** A second 9AM source may quote the exact same original player/game/
 * market/line that was already frozen at 6AM. Preserve the first original
 * direction and count only genuinely new thresholds as new evidence.
 */
function previouslyFrozenOriginalKeys(archives){
 const keys=new Set();
 for(const a of archives||[]){
  if(a?.data?.kind!=="nhl_goblin_first_git_pending_precommit_v1"||
     a.data.modelPromoted!==false||!Number.isFinite(Date.parse(a.at)))
    continue;
  for(const r of a.data.records||[]){
   if(r?.tier!=="Goblin"||!r.sourceRankedKey)continue;
   keys.add(r.sourceRankedKey);
  }
 }
 return keys;
}
/** Keep exactly one original direction/line after multiple triggered
 * jobs have first-Git-archived copies of the SAME source. Preserve all
 * immutable files for audit, but NEVER multiply effective sample size.
 */
function earliestOriginalLineOnly(records){
 const rows=[...(records||[])].sort((a,b)=>
  Date.parse(a.shadowFirstGitAt)-Date.parse(b.shadowFirstGitAt)||
  String(a.sourceSnapshotFile||"").localeCompare(String(b.sourceSnapshotFile||"")));
 const chosen=new Map(),quarantined=[];
 for(const r of rows){
  const key=[r.sport,r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
  if(chosen.has(key)){quarantined.push(key);continue;}
  chosen.set(key,r);
 }
 return {rows:[...chosen.values()],duplicatesQuarantined:quarantined.length};
}
function originalNHLNegativeStatus(now){
 const folder="outputs/pregame-availability/official-preview-snapshots",
  files=list(folder,COHORT_FILE).reverse();
 for(const name of files){
  const found=original(folder+"/"+name),capture=found?.data?.capturedAt;
  if(found&&Array.isArray(found.data.rows)&&
   Number.isFinite(Date.parse(capture))&&
   Date.parse(capture)<=Date.parse(now)&&
   Date.parse(found.at)<=Date.parse(now))
   return found.data;
 }
 return null;
}
/** Read only the CURRENT file if its bytes match the previously Git-committed
 * archive. The schedule must predate the board, so later updates cannot
 * retroactively create a prospective match.
 */
function committedNFLHistory(dataset){
 if(!["schedule","weekly_rosters"].includes(dataset))return null;
 const file="outputs/nfl/history/2026/"+dataset+".json.gz";
 try{
  const sha=git("log","-1","--format=%H","--",file);
  if(!sha||git("hash-object",file)!==git("rev-parse",sha+":"+file))
   return null;
  const at=git("show","-s","--format=%cI",sha);
  const value=JSON.parse(gunzipSync(fs.readFileSync(path.join(ROOT,file))).toString("utf8"));
  if(value.dataset!==dataset||!Array.isArray(value.rows)||
     value.recordCount!==value.rows.length||value.rows.length<(dataset==="schedule"?200:1000))
   return null;
  return {rows:value.rows,at,source:"nflverse_archived_"+dataset};
 }catch{return null;}
}
function committedNFLSeasonSchedule(){return committedNFLHistory("schedule");}
function auditOriginalNFL(now){
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",
  day:"2-digit"}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 const base="outputs/manual-board-captures/"+p.year+"-"+p.month+"-"+p.day;
 const last=list(base,/^\d{8}T\d{6}Z$/).at(-1);
 const manifest=last?original(base+"/"+last+"/manifest.json"):null;
 const empty=auditNFL([],{sourceAt:null,now});
 if(!manifest||manifest.data.source!=="partner-api.prizepicks.com"||
  manifest.data.completePagination!==true||
  !Array.isArray(manifest.data.columns)||!Array.isArray(manifest.data.sports))
  return {...empty,sourceStatus:"no_certified_recent_nfl_board_manifest"};
 const info=manifest.data.sports.find(x=>x.sport==="NFL");
 if(!info||!Number.isInteger(info.parts)||info.parts<1)
  return {...empty,sourceStatus:"no_complete_nfl_offer_parts"};
 const C=manifest.data.columns,rows=[];
 for(let i=1;i<=info.parts;i++){
  const file=base+"/"+last+"/nfl-"+String(i).padStart(2,"0")+".json",
   part=original(file);
  if(!part||part.commit!==manifest.commit||part.data.sport!=="NFL"||
     !Array.isArray(part.data.rows))
   return {...empty,sourceStatus:"nfl_source_chunk_not_first_git"};
  for(const v of part.data.rows){
   if(!Array.isArray(v)||v.length!==C.length)
    return {...empty,sourceStatus:"nfl_source_chunk_schema_invalid"};
   rows.push(Object.fromEntries(C.map((key,j)=>[key,v[j]])));
  }
 }
 if(rows.length!==info.rawCount)
  return {...empty,sourceStatus:"nfl_source_chunk_count_mismatch"};
 let official=null;
 try{official=read("outputs/nfl/availability/official-report-latest.json");}catch{}
 const stored=committedNFLSeasonSchedule();
 const schedule=buildNFLGameBridge(rows,stored?.rows||[],{
  sourceCapturedAt:manifest.data.captureFinishedUTC,
  scheduleCommittedAt:stored?.at??null,now});
 const roster=committedNFLHistory("weekly_rosters");
 const conditionalIdentities=buildNFLIdentityCandidates(rows,roster?.rows||[],schedule.rows,{
  sourceCapturedAt:manifest.data.captureFinishedUTC,
  rosterFirstGitAt:roster?.at??null,now});
 const officialFiles=list("outputs/nfl/availability/official-positive-snapshots",COHORT_FILE);
 const officialFirstGit=officialFiles.length?
  original("outputs/nfl/availability/official-positive-snapshots/"+officialFiles.at(-1)):null;
 const confirmedMentions=scanOfficialNFLActive(conditionalIdentities.rows,
  officialFirstGit?.data??null,schedule.rows,{
   firstGitAt:officialFirstGit?.at??null,now});
 const firstOfficial=list("outputs/nfl/availability/official-snapshots",COHORT_FILE).at(-1);
 const injuryOriginal=firstOfficial?
  original("outputs/nfl/availability/official-snapshots/"+firstOfficial):null;
 const publishedRisks=summarizeNFLReported(injuryOriginal?.data??null,{
  firstGitAt:injuryOriginal?.at??null,now});
 const injuryOverlap=summarizeNFLInjuryOverlap(conditionalIdentities.rows,
  injuryOriginal?.data??null,{
   officialFirstGitAt:injuryOriginal?.at??null,
   boardCapturedAt:manifest.data.captureFinishedUTC,now});
 // A near-kickoff ORIGINAL partner observation only counts when EVERY
 // source chunk was first Git-archived before the scheduled kickoff.
 const frozen=manifest.data.nflGamedaySourceProof;
 const kicks=Array.isArray(frozen?.futureGames)?frozen.futureGames:[];
 const gamedayMode=manifest.data.snapshotMode==="nfl_verified_gameday_source_only";
 const firstSourceTime=Date.parse(manifest.at),sourceTime=Date.parse(manifest.data.captureFinishedUTC);
 const futureKickoffs=kicks.map(x=>Date.parse(x.kickoff));
 const gamedayOriginalVerified=gamedayMode&&
  frozen?.kind==="nfl_precapture_game_window_v1"&&
  frozen.bettingEligible===false&&frozen.playerGSISVerified===false&&
  frozen.officialActiveRosterVerified===false&&kicks.length>=1&&
  futureKickoffs.every(Number.isFinite)&&
  Number.isFinite(firstSourceTime)&&firstSourceTime>=sourceTime-1000&&
  futureKickoffs.every(t=>t-firstSourceTime>=15*60000)&&
  Date.parse(now)-sourceTime<=30*60000;
 const audited=auditNFL(rows,{sourceAt:manifest.data.captureFinishedUTC,
  now,originalArchiveFirstGitAt:manifest.at,
  // Independent archived schedule ONLY verifies game context. Player-ID
  // GSIS and positive game-day active confirmation still need real sources.
  officialStatus:official,gameCrosswalk:schedule.rows,playerCrosswalk:[]});
 return {...audited,
  gamedayOriginalEvidence:gamedayMode?{
   kind:"nfl_partner_gameday_original_firstgit_counts_v1",
   sourceFirstGitVerified:gamedayOriginalVerified&&audited.firstGitOriginalBoardVerified,
   capturedAt:manifest.data.captureFinishedUTC,
   sourceGameKeys:gamedayOriginalVerified?kicks.length:0,
   originalBoardOffers:rows.length,
   sourceAuthenticatedApp:false,providerGSISIdentityVerified:false,
   positiveGamedayActiveVerified:false,modelPromoted:false,
   approvedSelections:0
  }:null,
  officialIdentityInjuryOverlap:injuryOverlap,
  officialInjuryEvidence:publishedRisks,
  officialPositiveEvidence:confirmedMentions,
  conditionalIdentityEvidence:{
   kind:conditionalIdentities.kind,status:conditionalIdentities.status,
   originalProviderPlayers:conditionalIdentities.originalProviderPlayers,
   candidateMatches:conditionalIdentities.candidateMatches,
   ambiguousPlayers:conditionalIdentities.ambiguousPlayers,
   insufficientPriorWeeks:conditionalIdentities.insufficientPriorWeeks,
   noRosterMatch:conditionalIdentities.noRosterMatch,
   conflictingSourceIdentity:conditionalIdentities.conflictingSourceIdentity,
   invalidPlayerEntries:conditionalIdentities.invalidPlayerEntries,
   rosterProvenanceVerified:conditionalIdentities.rosterProvenanceVerified,
   independentlyVerifiedMappings:0,officialGameDayActiveVerified:0,
   playerCrosswalkSourceVerified:false,paidProviderRequests:0,modelPromoted:false
  },
scheduleEvidence:{kind:schedule.kind,
  source:schedule.source,status:schedule.status,
  verifiedGames:schedule.verifiedGameMappings,
  originalGames:schedule.sourceGameKeys,
  sourceProvenanceValid:schedule.provenanceValid,
  conflictingSourceGames:schedule.conflictingSourceGames,
  missingScheduleMatches:schedule.missingScheduleMatches,
  ambiguousScheduleMatches:schedule.ambiguousScheduleMatches,
  sourceFirstParty:false,noPlayerIdentityProof:true,
  paidProviderRequests:0,modelPromoted:false},
  sourceStatus:!audited.firstGitOriginalBoardVerified?
   "stale_original_first_git_nfl_board":
   schedule.verifiedGameMappings>0?
    "fresh_board_independent_game_schedule_matched_gsis_and_active_missing":
    "fresh_board_game_schedule_crosswalk_unverified"};
}
function run({now=new Date().toISOString()}={}){
 const policy=firstGit("src/goblin-opportunity-evidence.cjs"),
  selectivePolicy=firstGit("src/goblin-selective-abstention-v1.cjs"),
  latest=list(SRC,/^\d{8}T\d{6}Z\.json$/).at(-1),
  source=latest?original(SRC+"/"+latest):null;
 const out={kind:"private_goblin_forward_evidence_v1",generatedAt:now,
  policyAt:policy?.at||null,sourceAt:source?.data?.generatedAt||null,
  NHL:{originalGoblinOffersExamined:0,newResearchCandidates:0,
   newAbstentions:0,archivedFirstGitRecords:0},
  NFL:{historicalOpportunityContractImplemented:true,
   prospectiveOfficialInjuryAndIdentityVerified:false,
   freshGoblinBoardFirstGitVerified:false,
   newEligibleFirstGitRecords:0},
  comparison:{kind:"future_only_goblin_original_line_comparison_v1",
   decided:0,registered:0,minimumReviewSampleMet:false,
   verifiedOutperformance:false},
  calibration:{separateGoblinMarketTier:true,fitAfterOriginalResultsOnly:true,
   independentFutureApproval:false},
  lineups:{powerFlex2to6ResearchQuoteGateImplemented:true,
   exactGoblinEntryMultipliersCaptured:false,
   eligibleForEVComparison:false,approvedLineups:0},
  researchOnly:true,calibratedProbabilityApproved:false,
  modelPromoted:false,actualWagersPlaced:0,providerRequests:0};
 let newRows=[],newArchive=null;
 const nflAudit=auditOriginalNFL(now);
 out.NFL.auditedOriginalGoblinOffers=nflAudit.originalOfferRows;
 out.NFL.eligibilityReasonCounts=nflAudit.reasons;
 out.NFL.prerequisiteGaps=nflAudit.prerequisiteGaps;
 out.NFL.sourceStatus=nflAudit.sourceStatus;
 out.NFL.scheduleEvidence=nflAudit.scheduleEvidence??null;
 out.NFL.conditionalIdentityEvidence=nflAudit.conditionalIdentityEvidence??null;
 out.NFL.officialPositiveEvidence=nflAudit.officialPositiveEvidence??null;
 out.NFL.officialInjuryEvidence=nflAudit.officialInjuryEvidence??null;
 out.NFL.officialIdentityInjuryOverlap=nflAudit.officialIdentityInjuryOverlap??null;
 out.NFL.gamedayOriginalEvidence=nflAudit.gamedayOriginalEvidence??null;
 out.NFL.freshFirstGitSourceVerified=nflAudit.firstGitOriginalBoardVerified;
 out.NFL.officialActiveRosterVerified=nflAudit.officialActiveRostersVerified;
 out.NFL.identityReadyForNextModelStage=nflAudit.eligibleModelInputRows;
 const sourceStatus=sourceEligibility({policy,source,now});
 const validSource=sourceStatus.eligible;
 const selectiveFresh=Boolean(validSource&&selectivePolicy&&
  Date.parse(source.data.generatedAt)>Date.parse(selectivePolicy.at));
 out.NHL.sourceEligibilityStatus=sourceStatus.status;
 out.NHL.selectivePolicySourceEligible=selectiveFresh;
 out.NHL.selectivePolicyAt=selectivePolicy?.at||null;
 // Never build a second model cohort from the SAME originally committed board.
 const existingArchives=list(DEST,COHORT_FILE)
  .map(n=>original(DEST+"/"+n)).filter(Boolean);
 const alreadyArchived=source&&existingFirstGitSource(SRC+"/"+latest,
  source.commit,existingArchives);
 const earlierKeys=previouslyFrozenOriginalKeys(existingArchives);
 out.NHL.sameOriginalSourceAlreadyFrozen=Boolean(alreadyArchived);
 out.NHL.existingOriginalThresholdsSkipped=0;
 if(selectiveFresh&&!alreadyArchived){
  const h=playerHistory(),opponent=buildOpponentHistory(h,source.data.generatedAt);
  const officialPreview=originalNHLNegativeStatus(now);
  const seen=new Set();
  for(const p of source.data.rankedProps){
   if(p?.tier!=="Goblin"||!goblin.NHL.has(p.market))continue;
   const key=[p.gameId,p.playerId,p.market,p.line,p.tier].join("|");
   if(seen.has(key))continue;
   seen.add(key);
   if(earlierKeys.has(key)){
    out.NHL.existingOriginalThresholdsSkipped++;
    continue;
   }
   out.NHL.originalGoblinOffersExamined++;
   const hist=h.players?.[String(p.playerId)]?.games||[];
   const match=opponent.get(p.opponent);
   const predicted=goblin.makeNHL(p,hist,{now,opponent:match});
   // Even model-abstentions due to incomplete historical features are
   // precommitted with original line/side, never only winning candidates.
   const frozenModel=predicted.kind?predicted:{
    ...predicted,kind:"goblin_two_stage_nhl_first_git_shadow_v1",
    sport:"NHL",tier:"Goblin",gameId:p.gameId,playerId:p.playerId,
    market:p.market,line:p.line,originalSide:p.lean,
    sourceCapturedAt:p.capturedAt,gameStartsAt:p.gameStartAt,
    originalHigher:p.probabilities?.higher??null,
    challengerHigher:p.probabilities?.higher??null,
    internalChallengerSide:null,bettingEligible:false,
    modelPromoted:false,probabilityCalibrated:false};
   const row=filterNHL(p,hist,frozenModel,{now,opponent:match,officialPreview});
   if(row.status==="shadow_candidate")out.NHL.newResearchCandidates++;
   else out.NHL.newAbstentions++;
   // Preserve abstentions before outcomes; never filter postgame winners.
   if(row.kind){
    row.sourceSnapshotFile=SRC+"/"+latest;
    row.originalSourceCommit=source.commit;
    row.sourceFirstGitAt=source.at;
    row.shadowCreatedAt=now;
    row.sourceRankedKey=key;
    newRows.push(row);
   }
  }
  if(newRows.length){
   const file=DEST+"/"+now.slice(0,19).replace(/[-:]/g,"")+"Z.json";
   if(!fs.existsSync(path.join(ROOT,file))){
    write(file,{kind:"nhl_goblin_first_git_pending_precommit_v1",
     generatedAt:now,sourceSnapshotFile:SRC+"/"+latest,
     sourceCommit:source.commit,sourceFirstGitAt:source.at,
     policyFirstGitAt:policy.at,records:newRows,
     notYetFirstGitEligible:true,modelPromoted:false},true);
    newArchive=file;
   }
  }
 }
 const originalByFile=new Map(),official=(()=>{try{return playerHistory()}catch{return null}})();
 const all=[];
 for(const file of list(DEST,COHORT_FILE)){
  const rel=DEST+"/"+file,shadow=original(rel);
  if(!shadow||shadow.data.kind!=="nhl_goblin_first_git_pending_precommit_v1"||
   shadow.data.modelPromoted!==false||!policy||
   Date.parse(shadow.at)<=Date.parse(policy.at))continue;
  let origin=originalByFile.get(shadow.data.sourceSnapshotFile);
  if(origin===undefined){origin=original(shadow.data.sourceSnapshotFile);
   originalByFile.set(shadow.data.sourceSnapshotFile,origin);}
  if(!origin||origin.commit!==shadow.data.sourceCommit||
    !Array.isArray(origin.data.rankedProps))continue;
  for(const r of shadow.data.records||[]){
   const ranks=origin.data.rankedProps.filter(x=>x.tier==="Goblin"&&
    [x.gameId,x.playerId,x.market,x.line,x.tier].join("|")===r.sourceRankedKey&&
    x.lean===r.originalSide&&x.capturedAt===r.sourceCapturedAt&&
    x.probabilities?.higher===r.originalHigher);
   if(ranks.length!==1)continue;
   all.push({...r,sourceFirstGitAt:origin.at,
    shadowFirstGitAt:shadow.at,
    originalFirstGitVerified:true,shadowFirstGitVerified:true,
    sourceIdentityVerified:true});
  }
 }
 const unique=earliestOriginalLineOnly(all);
 out.NHL.archivedFirstGitRecords=unique.rows.length;
 out.NHL.quarantinedDuplicateFirstGitRows=unique.duplicatesQuarantined;
 out.NHL.postPolicyScreening=goblinScreenAudit(unique.rows,selectivePolicy?.at||null);
 const officialResults=[];
 const includedOfficial=new Set();
 if(official)for(const r of unique.rows){
  for(const g of official.players?.[String(r.playerId)]?.games||[]){
   if(g.gameId!==r.gameId||!n(g[r.market])||g.playerId!==r.playerId||
    !["FINAL","OFF"].includes(g.gameState))continue;
   const officialKey=[r.gameId,r.playerId,r.market].join("|");
   if(includedOfficial.has(officialKey))continue;
   includedOfficial.add(officialKey);
   officialResults.push({sport:"NHL",gameId:r.gameId,playerId:r.playerId,
    market:r.market,actual:g[r.market],gameState:g.gameState,
    officialVerified:true,
    // This timestamp is when this report independently observed final stats.
    // It is NOT a claim about the game's exact final-whistle time.
    officialFinalAt:now});
  }
 }
 if(policy)out.comparison=goblin.gradeFrozen(unique.rows,officialResults,
  {policyFirstGitAt:policy.at});
 // Distinguish FUTURE/underway/after-start without FINAL from real outcomes;
 // never count an unconfirmed final or absent player row as a model loss.
 out.NHL.pendingOfficialTriage=pendingTriage(unique.rows,officialResults,{
  policyAt:policy?.at,now,grade:out.comparison});
 out.NHL.standardMarketSameLineAudit=(()=>{try{return standardMarkets(
  read("outputs/health/nhl-frozen-baseline-challenge-latest.json"))}
  catch{return standardMarkets(null)}})();
 out.NHL.sportsbookSourceCoverage=(()=>{
  try{return sportsbookGap(
   read("outputs/sportsbooks/bounded-live/matched-board-latest.json"),
   read("outputs/health/nhl-sportsbook-comparison-latest.json"))}
  catch{return sportsbookGap(null,null)}})();
 out.NHL.standardCalibrationHoldout=(()=>{
  try{return calibrationHoldout(
   read("outputs/health/nhl-prospective-validation-latest.json"))}
  catch{return calibrationHoldout(null)}})();

 // Calibrate strictly within Goblin sport × market using only verified
 // original postpolicy first-Git decisions and completed official stats.
 // No training on an active/slate's future result and no auto-release.
 const outcomes=new Map();
 for(const x of officialResults){
  const k=[x.sport,x.gameId,x.playerId,x.market].join("|");
  const a=outcomes.get(k)||[];a.push(x);outcomes.set(k,a);
 }
 const fitData=[];
 for(const r of unique.rows){
  if(!goblin.validateFirstGit(r,policy?.at)||r.status!=="shadow_candidate")
   continue;
  const k=[r.sport,r.gameId,r.playerId,r.market].join("|");
  const g=outcomes.get(k)||[];
  if(g.length!==1||g[0].actual===r.line)continue;
  fitData.push({sport:r.sport,market:r.market,tier:"Goblin",
   gameId:String(r.gameId),slate:r.gameStartsAt.slice(0,10),
   originalOfferKey:[r.gameId,r.playerId,r.market,r.line].join("|"),
   originalSourceAt:r.sourceCapturedAt,
   originalFirstGitAt:r.shadowFirstGitAt,
   gameStartsAt:r.gameStartsAt,officialFinalAt:g[0].officialFinalAt,
   originalFirstGitVerified:true,officialStatVerified:true,
   sideUnchanged:true,originalHigher:r.originalHigher,
   higherOutcome:Number(g[0].actual>r.line)});
 }
 out.calibration.byMarket=Object.fromEntries([...new Set(
  fitData.map(x=>x.sport+"|"+x.market))].map(k=>{
  const observations=fitData.filter(x=>x.sport+"|"+x.market===k);
  const v=goblin.calibrateGoblin(observations,{fitAt:now});
  return [k,{status:v.status,training:v.training,
   future:v.future,fittedModels:v.fittedModels||[],
   calibratedProbabilityApproved:false,modelPromoted:false}];
 }));
 out.calibration.verifiedOriginalDecisionRows=fitData.length;
 out.calibration.calibratedProbabilityApproved=false;
 out.NHL.newPrecommitFile=newArchive;
 out.NHL.currentSourceEligibleForNewPolicy=Boolean(selectiveFresh);
 write(HEALTH,out);
 console.log(JSON.stringify({kind:out.kind,sourceEligible:Boolean(validSource),
  examined:out.NHL.originalGoblinOffersExamined,
  newNhlGoblinCandidates:out.NHL.newResearchCandidates,
  newNhlGoblinAbstentions:out.NHL.newAbstentions,
  firstGitArchived:out.NHL.archivedFirstGitRecords,
  graded:out.comparison.decided??0,precommitFile:newArchive,
  NFLStatus:"await_verified_prior_week_and_current_goblin_offer",
  platformMultiplierVerified:false,providerRequests:0}));
 return out;
}
if(require.main===module)try{run()}catch(e){console.error(e.stack||e);
 process.exitCode=1;}
module.exports={run,buildOpponentHistory,firstGit,original,sourceEligibility,existingFirstGitSource,previouslyFrozenOriginalKeys,COHORT_FILE,earliestOriginalLineOnly};
