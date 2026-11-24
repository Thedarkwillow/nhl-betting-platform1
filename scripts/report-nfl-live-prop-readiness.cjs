"use strict";
/**
 * Offline private NFL quote/active/EV readiness report. Zero source calls,
 * no new model directions, never mutates the original frozen preview.
 * Reports ALL unique pregame market/line/side observations, plus Rice/Pollard.
 */
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {evaluate,KIND}=require("../src/nfl-point-in-time-readiness-v1.cjs");
const {assess:positiveNamed}=require("../src/nfl-official-named-positive-active-v1.cjs");
const ROOT=path.resolve(__dirname,".."),file="outputs/health/nfl-live-prop-readiness-latest.json";
const optional=p=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"))}catch{return null}};
const git=(...args)=>{try{return execFileSync("git",args,{cwd:ROOT,encoding:"utf8",timeout:15000,maxBuffer:16*1024*1024}).trim()}catch{return null}};
function firstGitEvidence(preview,asOf){
 const empty=reason=>({firstGitVerified:false,reason,
  immutableBoardArchive:null,immutableForwardArchive:null,
  originalFutureSelections:0});
 const obs=preview?.boardAt,created=preview?.generatedAt;
 if(!Number.isFinite(Date.parse(obs))||!Number.isFinite(Date.parse(created))||
  !Number.isFinite(Date.parse(asOf))||created<obs)return empty("original_board_clock_missing");
 const stamp=obs.slice(0,19).replace(/[-:]/g,"")+"Z",
  boardFile="outputs/nfl/independent-source/snapshots/"+stamp+".json",
  forwardFile="outputs/nfl/independent-source/forward-snapshots/"+stamp+".json";
 const first=(p)=>{
  const raw=git("log","--format=%H","HEAD","--",p);
  if(!raw)return null;
  const commits=raw.split("\n").filter(Boolean);
  if(commits.length!==1)return null;
  const sha=commits[0],date=git("show","-s","--format=%cI",sha);
  if(!Number.isFinite(Date.parse(date))||Date.parse(date)>Date.parse(asOf))return null;
  const committed=git("show",sha+":"+p);
  if(!committed)return null;
  const disk=optional(p);
  if(!disk)return null;
  let original;try{original=JSON.parse(committed)}catch{return null}
  // Reject mutable disk versions or post-commit rewrites: exact JSON equality
  // after independent first-Git read, not a mutable 'latest' pointer.
  if(JSON.stringify(original)!==JSON.stringify(disk))return null;
  return {path:p,firstGitAt:date,document:original};
 };
 const b=first(boardFile),f=first(forwardFile);
 if(!b||!f)return empty("immutable_original_board_or_shadow_first_git_missing");
 if(b.document.provider!=="prizepicksapi.com"||
  b.document.league!=="NFL"||
  b.document.scope!=="standard_full_game_replay"||
  b.document.generatedAt!==obs||
  b.document.completePagination!==true||
  f.document.kind!=="nfl_independent_scoped_original_probability_research_v1"||
  f.document.generatedAt!==created||f.document.boardAt!==obs||
  !Array.isArray(f.document.rows)||
  Date.parse(b.firstGitAt)<Date.parse(obs)||
  Date.parse(f.firstGitAt)<Date.parse(created)||
  f.document.rows.some(x=>Date.parse(x.eventStartsAt)-Date.parse(f.firstGitAt)<15*60000))
  return empty("immutable_board_or_frozen_forward_original_contract_mismatch");
 const original=new Map((preview.rows||[]).map(x=>[
  [x.gameId,x.historicalPlayerId,x.market,x.line,x.tier,x.side,x.sourceProjectionId].join("|"),x]));
 let matched=0;
 for(const x of f.document.rows){
  const k=[x.gameId,x.historicalPlayerId,x.market,x.line,x.tier,x.side,x.sourceProjectionId].join("|");
  const p=original.get(k);
  if(!p||p.capturedAt!==obs||p.probability!==x.probability||
   p.observedAt!==x.observedAt)
   return empty("first_git_shadow_not_same_exact_original_line_and_side");
  matched++;
 }
 if(matched<1)return empty("no_original_forward_selections");
 return {firstGitVerified:true,reason:null,
  immutableBoardArchive:boardFile,boardFirstGitAt:b.firstGitAt,
  immutableForwardArchive:forwardFile,forwardFirstGitAt:f.firstGitAt,
  originalFutureSelections:matched,
  latestMutablePreviewIsNotFirstGitEvidence:true,
  independentPlatformAppNotAuthenticated:true};
}
// Private immutable NFL.com individual statement archive: never a complete
// game-day roster. First Git must be before the research observation time.
function firstGitNamedPositive(asOf){
 const dir="outputs/nfl/availability/official-positive-snapshots",
  abs=path.join(ROOT,dir);
 if(!fs.existsSync(abs))return {document:null,firstGitAt:null};
 const names=fs.readdirSync(abs).filter(n=>/^\d{8}T\d{6}Z\.json$/.test(n))
  .sort().reverse().slice(0,20);
 for(const name of names){
  const p=dir+"/"+name,raw=git("log","--format=%H","HEAD","--",p);
  if(!raw)continue;
  const commits=raw.split("\n").filter(Boolean);
  if(commits.length!==1)continue;
  const firstGitAt=git("show","-s","--format=%cI",commits[0]);
  if(!Number.isFinite(Date.parse(firstGitAt))||Date.parse(firstGitAt)>Date.parse(asOf))
   continue;
  let original;try{original=JSON.parse(git("show",commits[0]+":"+p))}catch{continue}
  const disk=optional(p);
  if(!disk||JSON.stringify(disk)!==JSON.stringify(original)||
   original.kind!=="nfl_official_explicit_active_news_archive_v1"||
   !Number.isFinite(Date.parse(original.capturedAt))||
   Date.parse(original.capturedAt)>Date.parse(firstGitAt)||
   Date.parse(asOf)-Date.parse(original.capturedAt)>12*3600000)continue;
  return {document:original,firstGitAt};
 }
 return {document:null,firstGitAt:null};
}
// Immutable official BOTH-team active-roster snapshots (one game per file).
// Never trust self-reported `firstGitCommittedAt` or a mutable latest pointer.
// An authorized official source is still required before such a file exists.
function firstGitOfficialRosters(asOf){
 const dir="outputs/nfl/availability/official-game-day-active-snapshots",
  abs=path.join(ROOT,dir),out=[];
 if(!fs.existsSync(abs))return out;
 const names=fs.readdirSync(abs).filter(n=>/^\d{8}T\d{6}Z__[0-9A-Z_]+\.json$/.test(n))
  .sort().reverse().slice(0,60);
 const seen=new Set();
 for(const name of names){
  const p=dir+"/"+name,raw=git("log","--format=%H","HEAD","--",p);
  if(!raw)continue;
  const commits=raw.split("\n").filter(Boolean);
  if(commits.length!==1)continue;
  const firstGitAt=git("show","-s","--format=%cI",commits[0]);
  if(!Number.isFinite(Date.parse(firstGitAt))||
     Date.parse(firstGitAt)>Date.parse(asOf))continue;
  let original;try{original=JSON.parse(git("show",commits[0]+":"+p))}catch{continue}
  const disk=optional(p);
  if(!disk||JSON.stringify(disk)!==JSON.stringify(original)||
     original.kind!=="nfl_exact_official_game_day_active_roster_v1"||
     original.fullGameRosterAuthenticated!==true||
     typeof original.gameId!=="string"||seen.has(original.gameId)||
     !Number.isFinite(Date.parse(original.capturedAt))||
     Date.parse(original.capturedAt)>Date.parse(firstGitAt)||
     Date.parse(asOf)-Date.parse(original.capturedAt)>4*3600000||
     !Array.isArray(original.entries))continue;
  seen.add(original.gameId);
  // Source document's false "firstGit" claim is never passed to evaluator.
  out.push({...original,firstGitCommittedAt:firstGitAt,firstGitSourceVerified:true});
 }
 return out;
}
function build({preview,official,practice,comparison,now=new Date().toISOString(),
  appOffers=[],calibration=null,gameDayRoster=null,
  positiveNews=null,positiveNewsFirstGitAt=null}={}){
 const fail=reason=>({kind:KIND,generatedAt:now,status:"no_eligible_fresh_source",
  reason,rowsAudited:0,bookableApproved:0,bettingEligible:false,
  expectedValue:null,providerRequests:0});
 if(preview?.kind!=="nfl_independent_standard_research_preview_v1"||
  preview.calibrated!==false||preview.originalPlatformSettlementVerified!==false||
  preview.autoPickEligible!==false||!Array.isArray(preview.rows)||
  !Number.isFinite(Date.parse(preview.generatedAt))||
  Date.parse(preview.generatedAt)>Date.parse(now)||
  Date.parse(now)-Date.parse(preview.generatedAt)>6*3600000)
  return fail("latest_independent_standard_snapshot_invalid_or_old");
 const candidates=[],originalCandidates=[],seen=new Set();
 for(const p of preview.rows){
  if(p.side!=="Higher"&&p.side!=="Lower")continue;
  const key=[p.gameId,p.historicalPlayerId,p.market,p.line,p.tier,p.side].join("|");
  if(seen.has(key))continue;seen.add(key);
  const matchedRoster=Array.isArray(gameDayRoster)?
   gameDayRoster.find(x=>x.gameId===p.gameId)||null:gameDayRoster;
  const audit=evaluate(p,{asOf:now,officialReport:official,
   clubPractice:practice,comparisonDoc:comparison,appOffers,
   calibrationCertificate:calibration,gameDayRoster:matchedRoster});
  candidates.push(audit);originalCandidates.push(p);
 }
 const selected=[
  {player:"Rashee Rice",market:"receiving_yards",line:48.5,side:"Higher",team:"KC"},
  {player:"Tony Pollard",market:"receptions",line:3.5,side:"Lower",team:"TEN"}];
 const focus=selected.map(s=>({
  ...s,match:candidates.find(x=>x.player===s.player&&x.market===s.market&&
   x.line===s.line&&x.side===s.side&&x.team===s.team)||null
 }));
 const positive=originalCandidates.map(p=>positiveNamed(p,positiveNews,{
  firstGitAt:positiveNewsFirstGitAt,asOf:now}));
 const namedKeys=new Set(positive.filter(x=>x.namedFirstPartyStatementFound)
  .map(x=>[x.player,x.team,x.gameId].join("|")));
 const reasons={};
 for(const v of candidates)for(const reason of v.reasons||[])reasons[reason]=(reasons[reason]||0)+1;
 const proof=firstGitEvidence(preview,now);
 const result={kind:KIND,status:"research_only_unverified",
  generatedAt:now,originalIndependentPreviewAt:preview.generatedAt,
  originalIndependentBoardAt:preview.boardAt,
  firstGitSource:proof,rowsAudited:candidates.length,
  officialClubPracticeReportsFound:candidates.filter(x=>x.clubPractice?.officialTeamReport).length,
  independentlyConfirmedGameDayActive:candidates.filter(x=>x.gameDayActive?.gameDayActiveVerified).length,
  immutableOfficialFullRosterSnapshotsFound:Array.isArray(gameDayRoster)?
   gameDayRoster.length:Number(!!gameDayRoster?.firstGitSourceVerified),
  rosterOmissionsNeverBecomeActive:true,
  separatelyArchivedFirstPartyNamedActiveResearch:namedKeys.size,
  namedPositiveNeverSatisfiesOfficialRosterOrGSIS:true,
  namedPositiveFirstGitVerified:!!positiveNewsFirstGitAt,
  authenticatedExactAppOffers:candidates.filter(x=>x.authenticatedPlatformQuote?.authenticatedExactOriginalAppOffer).length,
  independentlyProspectivelyCalibrated:candidates.filter(x=>x.prospectiveCalibration?.verified).length,
  payableEntriesVerified:0,bookableApproved:0,
  blockersByCount:reasons,focus,providerRequests:0,
  directOriginalAppAccessConnected:false,actualPayoutQuoteConnected:false,
  fullNFLBoardVerified:preview.fullNFLBoardVerified===true,
  researchOnly:true,probabilitiesNotCalibrated:true,
  payoutExpectedValue:null,automaticWagersPlaced:0,
  noMedicalClearanceByOmission:true};
 return result;
}
function main(){
 const now=new Date().toISOString(),report=build({
  preview:optional("outputs/nfl/independent-source/research-preview-latest.json"),
  official:optional("outputs/nfl/availability/official-report-latest.json"),
  practice:optional("outputs/nfl/availability/club-practice-latest.json"),
  comparison:optional("outputs/nfl/research/platform-comparison-rice-pollard-2026-11-22.json"),
  gameDayRoster:firstGitOfficialRosters(now),
  appOffers:optional("outputs/nfl/platform/authenticated-app-offers-latest.json")?.offers??[],
  calibration:optional("outputs/nfl/calibration/prospective-certified-latest.json"),
  ...(()=>{const p=firstGitNamedPositive(now);
    return {positiveNews:p.document,positiveNewsFirstGitAt:p.firstGitAt};})(),
  now});
 const abs=path.join(ROOT,file);fs.mkdirSync(path.dirname(abs),{recursive:true});
 fs.writeFileSync(abs,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({kind:KIND,status:report.status,
  rowsAudited:report.rowsAudited,
  practiceReports:report.officialClubPracticeReportsFound??0,
  confirmedGamedayActive:report.independentlyConfirmedGameDayActive??0,
  separatelyNamedOfficialPositive:report.separatelyArchivedFirstPartyNamedActiveResearch??0,
  originalAppOffers:report.authenticatedExactAppOffers??0,
  calibrated:report.independentlyProspectivelyCalibrated??0,
  approved:report.bookableApproved,expectedValue:null,
  sourceCalls:0,bettingEligible:false,output:file}));
 return report;
}
module.exports={build,main,firstGitEvidence,firstGitNamedPositive,firstGitOfficialRosters};

if(require.main===module){try{main()}catch(e){console.error(e);process.exitCode=1}
 try{require("./report-nfl-qb-live-context.cjs").main()}catch{console.warn("QB live context unavailable; no new eligibility approved.");}}
