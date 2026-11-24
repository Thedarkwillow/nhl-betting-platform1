"use strict";
/**
 * One reproducible PRIVATE checkpoint for seven roadmap workstreams.
 * Every cross-platform, model and EV claim remains independently gated.
 * The public site receives ONLY the separately allowlisted count summaries.
 */
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const {buildStructuralLineups}=require("../src/nfl-frozen-structural-lineups.cjs");
const {marketReadiness}=require("../src/sport-market-release-readiness.cjs");
const ROOT=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
function latest(dir,re){
 const base=path.join(ROOT,dir);
 if(!fs.existsSync(base))return null;
 const items=fs.readdirSync(base).filter(x=>re.test(x)).sort();
 return items.length?dir+"/"+items[items.length-1]:null;
}
function firstGit(file){
 const at=cp.execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","--",file],
  {cwd:ROOT,encoding:"utf8",timeout:15000}).trim();
 const count=Number(cp.execFileSync("git",["rev-list","--count","HEAD","--",file],
  {cwd:ROOT,encoding:"utf8",timeout:15000}).trim());
 return count===1?at:null;
}
function maybe(file){try{return read(file)}catch{return null}}
function captureStatus(now){
 const {pacificClock}=require("./collect-live-partner-nhl-nfl.cjs");
 const clock=pacificClock(new Date(now)),date=clock.day;
 const root=path.join(ROOT,"outputs/manual-board-captures",date);
 const slots={"06:00":null,"09:00":null};
 if(fs.existsSync(root))for(const name of fs.readdirSync(root)){
  const file=path.join(root,name,"manifest.json");
  if(!fs.existsSync(file))continue;
  let m;
  try{m=JSON.parse(fs.readFileSync(file,"utf8"));}catch{continue;}
  const slot=m.captureSlotPacific;
  if(!Object.hasOwn(slots,slot)||m.completePagination!==true||
     m.actualCaptureInRequestedHour!==true||m.pacificDate!==date||
     !Array.isArray(m.sports)||!["NHL","NFL"].every(s=>
       m.sports.some(x=>x.sport===s&&x.rawCount>0)))continue;
  const st=pacificClock(new Date(m.captureStartedUTC));
  const en=pacificClock(new Date(m.captureFinishedUTC));
  if(st.day!==date||en.day!==date||st.hour!==Number(slot.slice(0,2))||
    en.hour!==Number(slot.slice(0,2)))continue;
  if(!slots[slot]||Date.parse(slots[slot])<Date.parse(m.captureFinishedUTC))
   slots[slot]=m.captureFinishedUTC;
 }
 return {day:date,slots,originalSixAndNineBothVerified:!!(slots["06:00"]&&slots["09:00"]),
  sourceComparisonCannotInventMissedSix:!slots["06:00"]};
}
function main(now=new Date().toISOString()){
 const reportAt=Date.parse(now);
 if(!Number.isFinite(reportAt))throw Error("Invalid roadmap report clock");
 const nflPath=latest("outputs/nfl/prospective",/^\d{8}T\d{6}Z\.json$/);
 const nfl=nflPath?read(nflPath):null;
 const nflaudit=maybe("outputs/nfl/backtests/pregame-forecast-proof-latest.json");
 const nhl=maybe("outputs/health/nhl-standard-triple-challenger-latest.json");
 const markets=marketReadiness(),captures=captureStatus(now);
 const nflLineups=nfl&&nflPath?buildStructuralLineups(nfl,{
  firstCommittedAt:firstGit(nflPath),now}):null;
 const report={schemaVersion:1,kind:"private_seven_roadmap_tracks_integrated_readiness_v1",
  generatedAt:now,
  status:"partial_research_not_approved_betting",
  tracks:{
   nhlStandardAccuracy:{
    status:nhl?.actualPrecommitted?.pairedSameLineResearch?
     "paired_prospective_model_audit_available":"waiting_for_paired_report_refresh",
    pairedSameOriginalLines:nhl?.actualPrecommitted?.pairedSameLineResearch||null,
    originalVsReconstructedSeparated:!!nhl?.retrospectiveResearchOnly,
    modelPromotionApproved:false},
   nflOfficialOutcomes:{
    status:nflaudit?.kind==="nfl_private_pregame_evidence_separated_outcome_audit_v1"?
     "original_numeric_and_explicit_directions_graded_separately":"pending",
    savedOriginalNumeric:nflaudit?.numeric?.registered??null,
    decidedOriginalNumeric:nflaudit?.numeric?.decided??null,
    decidedFrozenExplicitDirections:nflaudit?.explicitFrozenDirections?.decided??null,
    frozenExplicitPending:nflaudit?.explicitFrozenDirections?.pending??null,
    authenticatedPlatformSettlements:false},
   morningCollectionReliability:{
    status:"scheduled_retry_and_independent_public_manifest_monitor",
    originalSixAndNineBothVerified:captures.originalSixAndNineBothVerified,
    actualPacificCaptureArchiveAt:captures.slots,
    automaticLiveAcceptanceRequiresMultipleConsecutiveSuccessfulDays:true},
   publicWebsite:{
    status:"public_nhl_nfl_counts_only_sport_view",
    nflIndividualPropsReleased:false,publicPayoutEV:false},
   specialtyMarketModels:{
    status:"source_settlement_calibration_gates_block_automatic_picks",
    nhlMarkets:markets.nhl,nflMarkets:markets.nfl,
    readyAutomaticMarkets:markets.eligibleAutomaticMarketCount},
   lineupOptimization:{
    status:nflLineups?.originalCommitChronologyVerified?
      "frozen_nfl_distinct_game_research_only":"no_verified_future_snapshot",
    nflStructural:nflLineups,
    calibratedJointProbability:null,payoutEV:null},
   platformComparison:{
    status:"no_current_authorized_underdog_offer_snapshot",
    exactIdentitySameMarketAndTimeGuardsImplemented:true,
    realTimeTwoPlatformPricingAvailable:false,
    originalPlatformSettlementsVerified:false}
  },
  originalHistoricalProjectionsNeverRelabeledAsFrozenDirections:true,
  originalPlatformPayoutExpectedValue:null,
  automaticWagersPlaced:0};
 const target="outputs/health/seven-roadmap-readiness-latest.json";
 fs.mkdirSync(path.dirname(path.join(ROOT,target)),{recursive:true});
 fs.writeFileSync(path.join(ROOT,target),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({report:target,
  nhlPairedAudit:report.tracks.nhlStandardAccuracy.status,
  nflFrozenDecided:report.tracks.nflOfficialOutcomes.decidedFrozenExplicitDirections,
  nflStructuralSizes:Object.entries(nflLineups?.bySize||{}).filter(([,v])=>v.candidates>0).map(([k])=>k),
  nhlMarketCount:markets.nhl.length,nflMarketCount:markets.nfl.length,
  approvedMarkets:0,EV:null,automatedWagers:0}));
 return report;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main,latest,firstGit,captureStatus};
