"use strict";
/**
 * Rebuild a private immutable-evidence ledger from original single-commit
 * research snapshots plus official NHL player-game history. No vendor calls.
 */
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {freezeIndividualPreferences}=require("../src/nhl-frozen-individual-props.cjs");
const {gradePredictions}=require("../src/grade-nhl-predictions.cjs");
const {canonicalSelectedLedger,describeHistoricalMatchup,fairConsensusCoverage,
 groupAlternateLadders}=require("../src/nhl-roadmap-foundations.cjs");
const {analyzeNhlSourceCoverage}=require("../src/nhl-source-coverage-audit.cjs");
const {evaluateNhlCountStatDependence}=require("../src/nhl-historical-pair-correlation.cjs");
const {mergePriorOfficialPairHistory}=require("../src/nhl-historical-pair-source.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}catch{return null;}};
function framesFromGit(){
 const dir="outputs/research/snapshots",abs=path.join(root,dir);
 return (fs.existsSync(abs)?fs.readdirSync(abs):[]).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x))
 .sort().map(name=>{
  const relative=dir+"/"+name,git=(args)=>execFileSync("git",args,
   {cwd:root,encoding:"utf8",timeout:15000}).trim();
  return {path:relative,snapshot:read(relative),
   firstCommittedAt:git(["log","--diff-filter=A","-1","--format=%cI","--",relative]),
   gitHistoryCount:Number(git(["rev-list","--count","HEAD","--",relative]))};
 });
}
function build(now=new Date().toISOString()){
 const histories=read("outputs/history/players.json"),schedule=read("outputs/official-nhl/season-schedules/2026-27.json");
 if(!histories?.players||schedule?.complete!==true||!Array.isArray(schedule.games))
  throw Error("Exact official complete NHL schedule and historical boxscores required");
 const frames=framesFromGit();
 const frozen=freezeIndividualPreferences(frames,schedule.games);
 const official=gradePredictions(frozen.explicit,histories);
 const ledger=canonicalSelectedLedger(frozen.explicit,official);
 const candidateBoard=read("outputs/free-source/nhl/research-latest.json");
 const sourceBoard=read("outputs/free-source/nhl/latest.json");
 const sportsbook=read("outputs/sportsbooks/latest.json");
 const props=Array.isArray(candidateBoard?.rankedProps)?candidateBoard.rankedProps:[];
 const sourceCoverage=analyzeNhlSourceCoverage(sourceBoard,candidateBoard,schedule,{
  asOf:now,horizonHours:48});
 const historicalPairSource=mergePriorOfficialPairHistory(histories,
  read("outputs/oddspapi/nhl/official-historical-player-logs-latest.json"),
  read("outputs/oddspapi/nhl/outcome-audit-latest.json"));
 const pastPairDependence=evaluateNhlCountStatDependence(historicalPairSource.history,props,{
  asOf:candidateBoard?.generatedAt||now,minimumPairedGames:12,maxPlayersPerGame:8,maxPairs:600});
 const audit={
  schemaVersion:1,kind:"private_nhl_data_readiness_sprint",
  asOf:now,providerRequests:0,
  sourceSnapshotLineage:frames.map(f=>({snapshot:f.path,originalGitCommitAt:f.firstCommittedAt,
   singleCommit:f.gitHistoryCount===1})),
  selectedOriginalCohort:ledger.counts,
  sourceCoverageSummary:{status:sourceCoverage.status,
   officialGamesInWindow:sourceCoverage.officialGamesInWindow,
   officialGamesWithObservedOffers:sourceCoverage.officialGamesWithObservedOffers,
   matchedEligibleSideRows:sourceCoverage.matchedEligibleSideRows,
   originalPlatformOffersAuthenticated:false},
  historicalPairCorrelationSummary:{evaluated:pastPairDependence.evaluatedPairs,
   measured:pastPairDependence.measuredPairs,
   priorSeasonOfficialGameRowsAdded:historicalPairSource.metadata.addedOfficialPlayerGames,
   historicalTeammateRelationVerified:false,
   countStatOnly:true,propHitCorrelationVerified:false},
  sourceBoard:{generatedAt:sourceBoard?.generatedAt??null,
   completePagination:sourceBoard?.completePagination===true,
   quotaUnit:sourceBoard?.quotaUnit??"unknown",
   lastKnownRemaining:sourceBoard?.creditsRemaining??null},
  matchupDescriptions:props.slice(0,800).filter(p=>Number.isInteger(p.playerId)).map(p=>{
   const r=describeHistoricalMatchup(p,histories);
   return r?{gameId:p.gameId,playerId:p.playerId,market:p.market,...r}:null;
  }).filter(Boolean),
  sportsbookFairConsensus:fairConsensusCoverage(sportsbook?.rows||[],{now}),
  alternateLineLadders:groupAlternateLadders(props),
  privateOnly:true,modelPromoted:false,
  originalPlatformPayoutOrSettlementVerified:false
 };
 const save=(rel,doc)=>{
  const target=path.join(root,rel);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(doc,null,2)+"\n");
 };
 save("outputs/research/registry/nhl-precommitted-ledger-latest.json",{...ledger,builtAt:now,
  originalFrozenSnapshots:frames.length,archiveValidation:frozen.audit});
 save("outputs/health/nhl-roadmap-readiness-latest.json",audit);
 save("outputs/health/nhl-source-coverage-latest.json",sourceCoverage);
 save("outputs/research/correlation/nhl-count-stat-dependence-latest.json",{
  ...pastPairDependence,priorSeasonSource:historicalPairSource.metadata});
 console.log(JSON.stringify({frozen:ledger.counts,snapshots:frames.length,
  matchupDescriptions:audit.matchupDescriptions.length,
  consensusGroups:audit.sportsbookFairConsensus.groups,
  multiBookGroups:audit.sportsbookFairConsensus.multiBookGroups,
  alternateLadders:audit.alternateLineLadders.multiThresholdSides,
  sourceOfficialGames:sourceCoverage.officialGamesInWindow,
  sourceMatchedOfficialGames:sourceCoverage.officialGamesWithObservedOffers,
  sourceMatchedSideRows:sourceCoverage.matchedEligibleSideRows,
  historicalPairSamples:pastPairDependence.evaluatedPairs,
  measuredCountStatPairs:pastPairDependence.measuredPairs,
  addedHistoricalOfficialGameRows:historicalPairSource.metadata.addedOfficialPlayerGames,
  supplementErrorsUnresolved:historicalPairSource.metadata.sourceErrorCount,
  newPaidRequests:0,originalPlatformSettlementsVerified:false}));
 return {ledger,audit};
}
if(require.main===module)try{build();}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={build,framesFromGit};
