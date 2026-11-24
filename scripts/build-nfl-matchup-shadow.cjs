"use strict";
/** PRIVATE ONLY: snapshot archived before future games, no original bet-side changes. */
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib"),
 {execFileSync}=require("node:child_process"),
 {project}=require("../src/nfl-pregame-matchup-challenger.cjs"),
 {verifyCommitChronology}=require("../src/nfl-prospective-freeze.cjs");
const {candidate:thresholdCandidate}=require("../src/nfl-empirical-threshold-shadow.cjs");
const ROOT=path.resolve(__dirname,"..");
function original(pathName){
 const at=execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","--",pathName],
  {cwd:ROOT,encoding:"utf8",timeout:10000}).trim();
 const count=Number(execFileSync("git",["rev-list","--count","HEAD","--",pathName],
  {cwd:ROOT,encoding:"utf8",timeout:10000}).trim());
 if(count!==1||!Number.isFinite(Date.parse(at)))throw Error("Original NFL research source not immutable first Git");
 return {firstGitCommittedAt:at,gitHistoryCount:count};
}
function readDataset(year,key,{required=false}={}){
 const f=path.join(ROOT,"outputs/nfl/history",String(year),key+".json.gz");
 if(!fs.existsSync(f)){
  if(required)throw Error("Missing required historical dataset "+year+"/"+key);
  return [];
 }
 const doc=JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8"));
 if(doc.sport!=="NFL"||doc.dataset!==key||!Array.isArray(doc.rows)||
   doc.recordCount!==doc.rows.length||
   doc.retrospectivePlayerStatsNotPregameLines!==true)
  throw Error("Invalid archived NFL source "+key+"/"+year);
 return doc.rows;
}
function teamWithPace(teams,snaps){
 const by=new Map();
 for(const r of snaps){
  if(!r.game_id||!r.team||!Number.isFinite(r.offense_snaps))continue;
  const k=String(r.game_id)+"|"+String(r.team).toUpperCase();
  by.set(k,Math.max(by.get(k)||0,r.offense_snaps));
 }
 return teams.map(x=>({...x,
  priorOffenseSnaps:by.get(String(x.game_id)+"|"+String(x.team).toUpperCase())??null}));
}
function loadHistory(){
 const raw={};
 const names=["player_weekly","team_weekly","snap_counts","schedule",
  "nextgen_passing","nextgen_rushing","nextgen_receiving",
  "pfr_pass","pfr_rush","pfr_rec","pfr_def","ftn_charting_research_only"];
 for(const key of names)raw[key]=[2024,2025,2026].flatMap(y=>
  readDataset(y,key,{required:["player_weekly","team_weekly","snap_counts"].includes(key)}));
 const named={playerWeekly:raw.player_weekly,snapCounts:raw.snap_counts,schedule:raw.schedule,
  teamWeekly:teamWithPace(raw.team_weekly,raw.snap_counts),
  nextgen:[...raw.nextgen_passing,...raw.nextgen_receiving,...raw.nextgen_rushing],
  pfr:[...raw.pfr_pass,...raw.pfr_rush,...raw.pfr_rec,...raw.pfr_def],
  ftn:raw.ftn_charting_research_only};
 return named;
}
function externalSnapshot(originalSnap,{now}){
 // Optional trusted snapshots, not an unauthorized automated paywall scraper.
 const dir=path.join(ROOT,"outputs/nfl/context/approved-pregame");
 if(!fs.existsSync(dir))return [];
 const rows=[],games=new Set(originalSnap.selections.map(x=>x.sourceGameId));
 const firstGitTime=Date.parse(now);
 for(const filename of fs.readdirSync(dir).filter(x=>x.endsWith(".json"))){
  const relative="outputs/nfl/context/approved-pregame/"+filename;
  const doc=JSON.parse(fs.readFileSync(path.join(ROOT,relative),"utf8"));
  if(doc.kind!=="nfl_approved_pregame_context_snapshot_v1"||
     !Array.isArray(doc.records)||!Number.isFinite(Date.parse(doc.observedAt))||
     Date.parse(doc.observedAt)>firstGitTime)continue;
  let git;
  try{git=original(relative)}catch{continue;}
  const at=Date.parse(git.firstGitCommittedAt);
  if(at>firstGitTime||Date.parse(doc.observedAt)>at+1000)continue;
  for(const e of doc.records){
   if(!games.has(e.sourceGameId)||e.licenseForResearch!==true||
      e.commercialRightsVerified!==true&&e.sourceId!=="weather"&&
      e.sourceId!=="nflverse_injury_snapshot"||
      Date.parse(e.observedAt)>at+1000||
      !Number.isFinite(Date.parse(e.issuedAt)))continue;
   rows.push({...e,originalEvidenceGitCommitAt:git.firstGitCommittedAt});
  }
 }
 return rows;
}
// Use only original Git-archived league report observations already present
// before this shadow is created. A report created after an original board
// can affect this later shadow, never the historical original choice.
function archivedOfficialReport(now){
 const d="outputs/nfl/availability/official-snapshots",dir=path.join(ROOT,d);
 if(!fs.existsSync(dir))return null;
 for(const file of fs.readdirSync(dir).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort().reverse()){
  try{const rel=d+"/"+file,report=JSON.parse(fs.readFileSync(path.join(ROOT,rel),"utf8")),proof=original(rel),at=Date.parse(proof.firstGitCommittedAt),captured=Date.parse(report.capturedAt),end=Date.parse(now);
   if(report.kind==="nfl_first_party_published_game_status_v1"&&at<=end&&captured<=at+1000&&end-captured<=12*3600000&&captured<=end)return {...report,sourceFirstGitCommittedAt:proof.firstGitCommittedAt};
  }catch{}
 }
 return null;
}
function applyOfficialRisk(result,p,report,now){
 const {attachNflAvailability}=require("../src/nfl-current-injury-evidence.cjs");
 const evidence=attachNflAvailability(p,report,now);
 const output={...result,officialReportedAvailability:{...evidence,sourceFirstGitCommittedAt:report?.sourceFirstGitCommittedAt??null}};
 if(evidence.blocksResearch){output.shadowProjection=null;output.shadowDirection=null;output.shadowStatus="abstain_missing_core_or_injury";output.reasons=[...output.reasons,"official_pregame_report_risk_abstain"];}
 return output;
}
function make(snapshot,{firstGitCommittedAt,gitHistoryCount=1,now=new Date().toISOString(),
 history=loadHistory(),external=[],officialReport=null}={}){
 if(snapshot?.kind!=="nfl_independent_partner_standard_directional_original_research_v1"||
    gitHistoryCount!==1||
    !verifyCommitChronology(snapshot,firstGitCommittedAt).verified||
    !Number.isFinite(Date.parse(now))||
    Date.parse(now)<Date.parse(firstGitCommittedAt)||
    Date.parse(now)-Date.parse(snapshot.sourceBoardAsOfAt)>30*60000||
    Date.parse(now)<Date.parse(snapshot.sourceBoardAsOfAt))
  throw Error("Context shadow requires fresh original NFL Git-proven pregame source");
 const rows=[],counts={eligible:0,abstained:0,withOpponentDefense:0,
  withTeamOffense:0,withPace:0,withUsage:0,
  withRealPregameWeather:0,withRealPregameInjuries:0,officialReportRiskAbstentions:0,
  withNGSHistory:0,withPFRHistory:0,ftnIsolated:0};
 const identities=new Set(),posContexts=new Map(),posModel=require("../src/nfl-position-opportunity-matchup.cjs");
 for(const original of snapshot.selections){
  if(original.tier!=="Standard"||
    !["Higher","Lower"].includes(original.selectedSide)||
    original.selectedSide!==original.offeredSide||
    Date.parse(original.eventStartsAt)-Date.parse(now)<15*60000)
    continue;
  const k=[original.sourceGameId,original.historicalPlayerId,original.market,
    original.line,original.sourceObservedAt].join("|");
  if(identities.has(k))throw Error("Original duplicate player-game-market-line in shadow cohort");
  identities.add(k);
  const p={...original,sourceSnapshotFirstGitCommitAt:firstGitCommittedAt};
  const result=applyOfficialRisk(project(p,{...history,external,now}),p,officialReport,now);
  // Additional frozen research field, never used for original direction.
  try{result.empiricalThresholdShadow=result.officialReportedAvailability.blocksResearch?null:thresholdCandidate(p,history.playerWeekly||[],now);}catch{result.empiricalThresholdShadow=null;}
  try{const k=p.season+"|"+p.week;if(!posContexts.has(k))posContexts.set(k,posModel.prepare(history.playerWeekly||[],history.schedule||[],p.season,p.week));result.positionOpportunityShadow=result.officialReportedAvailability.blocksResearch?null:posModel.candidate(posContexts.get(k),p);}catch{result.positionOpportunityShadow=null;}
  rows.push(result);
  counts.eligible+=result.shadowStatus==="research_shadow_only";
  counts.abstained+=result.shadowStatus!=="research_shadow_only";
  counts.withOpponentDefense+=result.factorEvidence.defense!==null;
  counts.withTeamOffense+=result.factorEvidence.offense!==null;
  counts.withPace+=result.factorEvidence.pace!==null;
  counts.withUsage+=result.factorEvidence.playerUsage!==null;
  counts.withRealPregameWeather+=!!result.sourceAvailability.weather;
  counts.withRealPregameInjuries+=!!result.sourceAvailability.injury;
  counts.officialReportRiskAbstentions+=Number(result.officialReportedAvailability.blocksResearch);
  counts.withNGSHistory+=result.advancedResearch.nextgen==="past_week_player_identity_matched";
  counts.withPFRHistory+=result.advancedResearch.pfr==="past_week_player_identity_matched";
  counts.ftnIsolated+=result.advancedResearch.ftn!=="license_isolated_do_not_promote";
 }
 if(!rows.length)throw Error("No future NFL Standard original research rows for context challenger");
 return {schemaVersion:1,kind:"nfl_pregame_matchup_all_sources_shadow_v1",
  createdAt:now,sourceBoardAsOfAt:snapshot.sourceBoardAsOfAt,
  originalFirstGitCommittedAt:firstGitCommittedAt,
  originalSourceResearchOnly:true,
  candidateCounts:counts,rows,
  derivedFromExactSameOriginalStandardLines:true,
  originalHigherLowerDirectionsImmutable:true,
  championModelUnchanged:true,
  historicalLeagueTeamRowsPreviousWeeksOnly:true,
  injurySourceMissingDoesNotImplyHealthy:true,
  actualGameWeatherNeverSubstitutedForForecast:true,
  nextgenAndPFRHistoryDoNotProvePregameLiveAccess:true,
  ftnChartingRetrospectiveResearchOnlyCCBYSA:true,
  archivedMoneyPuckAndDailyFaceoffRemainNHLOnly:true,
  unauthorizedPaidWebsiteContentsNotCollected:true,
  hypotheticalPolicyDesignedAfterNov9Results:true,
  trueProspectiveOnlyAfterOwnFirstGitCommitBeforeKickoff:true,
  calibratedProbabilities:false,originalPrizePicksAppQuoteVerified:false,
  authenticatedSettlementVerified:false,EV:null,liveLineupEligible:false,
  wagersPlaced:0};
}
function main(){
 const folder="outputs/nfl/prospective";
 const sourceDir=path.join(ROOT,folder);
 const newest=fs.existsSync(sourceDir)?
  fs.readdirSync(sourceDir).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort().at(-1):null;
 const file=process.argv[2]|| (newest?folder+"/"+newest:null),now=new Date().toISOString();
 if(!file){
  const skipped={status:"skipped_no_original_nfl_snapshot",frozenNewFutureContextRows:0};
  console.log(JSON.stringify(skipped));return skipped;
 }
 const relative=file.replace(/^\.\//,"");
 if(!/^outputs\/nfl\/prospective\/\d{8}T\d{6}Z\.json$/.test(relative))
  throw Error("Not an original prospective NFL research snapshot path");
 const snap=JSON.parse(fs.readFileSync(path.join(ROOT,relative),"utf8"));
 const age=Date.parse(now)-Date.parse(snap.sourceBoardAsOfAt);
 if(!Number.isFinite(age)||age<0||age>30*60000){
  const skipped={status:"skipped_no_fresh_first_git_original_board",
   observedAt:snap.sourceBoardAsOfAt,frozenNewFutureContextRows:0};
  console.log(JSON.stringify(skipped));return skipped;
 }
 const folderOut=path.join(ROOT,"outputs/nfl/context-shadow");
 if(fs.existsSync(folderOut)&&fs.readdirSync(folderOut).some(file=>{
  if(!file.endsWith(".json"))return false;
  try{return JSON.parse(fs.readFileSync(path.join(folderOut,file),"utf8"))
   .sourceOriginalFrozenFile===relative}catch{return false}
 })){
  const skipped={status:"skipped_already_frozen_same_original_source",
   frozenNewFutureContextRows:0};console.log(JSON.stringify(skipped));return skipped;
 }
 const origin=original(relative);
 const report=make(snap,{...origin,now,external:externalSnapshot(snap,{now}),officialReport:archivedOfficialReport(now)});
 const out="outputs/nfl/context-shadow/"+now.slice(0,19).replace(/[-:]/g,"")+"Z.json";
 fs.mkdirSync(path.dirname(path.join(ROOT,out)),{recursive:true});
 fs.writeFileSync(path.join(ROOT,out),JSON.stringify({...report,
   sourceOriginalFrozenFile:relative},null,2)+"\n",{flag:"wx"});
 const output={status:"candidate_pending_separate_first_Git_commit",
   file:out,sourceOriginalFrozenFile:relative,counts:report.candidateCounts,
   pregameOriginalModelUnchanged:true,commercialLicenseReviewed:false,
   futureFrozenShadowVerified:false,autoWagers:0};
 console.log(JSON.stringify(output));return output;
}
if(require.main===module)try{main()}catch(e){console.error(e);process.exitCode=1;}
module.exports={original,readDataset,teamWithPace,loadHistory,externalSnapshot,archivedOfficialReport,applyOfficialRisk,make,main};
