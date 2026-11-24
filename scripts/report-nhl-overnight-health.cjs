"use strict";
/** Read-only NHL overnight research audit: never requests a paid API or makes wagers. */
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}catch{return null;}};
const nonnegative=x=>Number.isInteger(x)&&x>=0?x:0;
function auditOvernight({at,stats,grading,research,board,approvedScorecard}){
 const now=Date.parse(at);
 if(!Number.isFinite(now))throw Error("Invalid ISO audit timestamp");
 const exp=grading?.individualPropAudit?.explicitProspective,
  legacy=grading?.individualPropAudit?.legacyRetrospective;
 const timestamp=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?
  new Date(x).toISOString():null;
 const statsComplete=!!stats&&stats.scheduledGames===stats.completedGames&&
  stats.completedGames===stats.collectedGames&&!(stats.errors||[]).length;
 const cases=stats?{date:stats.requestedDate,scheduledGames:nonnegative(stats.scheduledGames),
  officialFinalGames:nonnegative(stats.completedGames),
  archivedGames:nonnegative(stats.collectedGames),complete:statsComplete}:null;
 const latestResearch=timestamp(research?.generatedAt);
 const ageHours=latestResearch?Math.max(0,Number(((now-Date.parse(latestResearch))/3600000).toFixed(1))):null;
 const boardAt=timestamp(board?.generatedAt);
 const boardAgeMinutes=boardAt?Number(((now-Date.parse(boardAt))/60000).toFixed(1)):null;
 const boardChronologyValid=boardAgeMinutes!==null&&boardAgeMinutes>=0;
 const complete=board?.completePagination===true;
 const confirmedFreshBoard=boardChronologyValid&&boardAgeMinutes<=30&&complete&&
   board?.sourceStatus==="fresh";
 const boardMatchesResearch=!!boardAt&&research?.boardGeneratedAt===board?.generatedAt;
 const credits=Number.isInteger(board?.creditsRemaining)&&board.creditsRemaining>=0?
   board.creditsRemaining:null;
 const kind=grading?.individualPropAudit?.kind==="nhl_frozen_individual_prop_preference_audit_v1";
 const candidateCount=kind?nonnegative(exp?.uniqueSelections):0,
  graded=kind?nonnegative(exp?.decided):0,
  correctly=kind?nonnegative(exp?.correct):0;
 return {
  schemaVersion:1,kind:"nhl_overnight_research_ops_summary",
  createdAt:new Date(now).toISOString(),
  officialGameStats:cases,
  archivedIndividualProps:{precommittedUnique: candidateCount,
   precommittedDecided:graded,precommittedCorrect:correctly,
   precommittedObservedRate:graded?correctly/graded:null,
   pending:kind?nonnegative(exp?.pending):0,
   historicalReconstructedUnique:kind?nonnegative(legacy?.uniqueSelections):0,
   historicalReconstructedDecided:kind?nonnegative(legacy?.decided):0,
   historicalReconstructedCorrect:kind?nonnegative(legacy?.correct):0,
   historicalReconstructedNotProspective:true,
   sourceRawOfferSideDecisions:nonnegative(grading?.summary?.decisions),
   rawOfferSidesAreModelPicks:false},
  approvedMoneyPuck:{
   graded:nonnegative(approvedScorecard?.counts?.gradedRows??approvedScorecard?.matchedOfficialFinalDecisions),
   pending:nonnegative(approvedScorecard?.counts?.pendingRows??approvedScorecard?.pendingRows),
   modelDeployed:false,
   originalPlatformSettlementVerified:false},
  source:{lastModelResearchSnapshot:latestResearch,ageHours,
   lastCompleteBoardCapture:boardAt,boardAgeMinutes,
   boardCompletePagination:complete,boardTotalOffers:nonnegative(board?.totalOffers),
   boardNormalizedRows:nonnegative(board?.normalizedRows),
   confirmedFreshBoardAtAudit:confirmedFreshBoard,
   boardMatchesResearch,quotaUnit:board?.quotaUnit||"unknown",
   lastKnownCreditsRemaining:credits,
   latestRunSuccessFromGitHubActionsVerified:false,
   currentSourceProofRequiresFreshOfferAndGameNotStarted:true,
   rateAndCommercialLicenseVerified:false},
  controls:{
   newPaidApiRequests:0,
   officialFantasyPlatformSettlementsVerified:false,
   individualProbabilityCalibrationVerified:false,
   correlationAdjustedLineupProfitVerified:false,
   wagersPlaced:0,
   sourceSnapshotModifiedByAudit:false,
   historicalMlbRepositoryModified:false},
  checklist:[
   statsComplete?"Latest archived NHL game day fully FINAL.":"Latest archived NHL game day not fully FINAL; automatic date catch-up must continue.",
   candidateCount===0?"No explicit precommitted standalone prop cohort has been graded yet.":"Explicit frozen standalone prop cohort exists; check decided and pending separately.",
   !boardAt?"No independent NHL full-board archive timestamp available.":
    !complete?"Independent NHL board archive does not prove complete pagination.":
    !boardChronologyValid?"Independent board archive timestamp invalid or in the future.":
    !confirmedFreshBoard?"Independent NHL board archive is not current for live-prop display (30-minute gate).":
    !boardMatchesResearch?"Archived board is fresh but model research has different board lineage.":
    "Latest archived independent NHL board and research lineage pass freshness checks; this does not verify current platform availability.",
   "Older source offer directions and later reconstructed preferences must never count as prospective strategy wins.",
   "PrizePicks/Underdog original settlement, DNP/reboot and payout tiers remain unverified."
  ],
  warning:"Read-only operational monitoring, not a betting model promotion. No live availability or value claim."
 };
}
function main(){
 const at=new Date().toISOString();
 const dir=path.join(root,"outputs/player-stats"),
  fileNames=fs.existsSync(dir)?fs.readdirSync(dir).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort():[],
  stats=fileNames.length?read("outputs/player-stats/"+fileNames.at(-1)):null;
 const report=auditOvernight({
  at,stats,grading:read("outputs/grading/nhl-latest.json"),
  research:read("outputs/free-source/nhl/research-latest.json"),
  board:read("outputs/free-source/nhl/latest.json"),
  approvedScorecard:read("outputs/backtests/nhl-approved-source-prospective-latest.json")
 });
 const target=path.join(root,"outputs/health/nhl-overnight-status.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
 const s=report.officialGameStats,i=report.archivedIndividualProps;
 const md=[
  "# NHL Overnight Research Status",
  "",
  "Read-only, no paid API calls and no wagers. Generated "+report.createdAt,
  "",
  "| Verification | Status |","|---|---|",
  "| Latest NHL official stats | "+(s?s.date+" · "+s.archivedGames+"/"+s.scheduledGames+" games · "+(s.complete?"complete":"incomplete"):"unavailable")+" |",
  "| Frozen independent prop selections | "+i.precommittedUnique+" original choices / "+i.precommittedDecided+" graded / "+i.pending+" pending |",
  "| Independently observed selected direction rate | "+(i.precommittedDecided?(100*i.precommittedObservedRate).toFixed(1)+"%":"not established")+" |",
  "| Exploratory old-snapshot model preferences | "+i.historicalReconstructedDecided+" graded (NOT precommitted prospective picks) |",
  "| Archived raw offered Higher/Lower sides | "+i.sourceRawOfferSideDecisions+" (NOT selected picks) |",
  "| MoneyPuck model shadow | "+report.approvedMoneyPuck.graded+" graded; "+report.approvedMoneyPuck.pending+" pending |",
  "| Latest research snapshot | "+(report.source.lastModelResearchSnapshot||"missing")+" · age "+(report.source.ageHours??"unknown")+" h |",
  "| Independent NHL full board | "+(report.source.lastCompleteBoardCapture||"missing")+" · "+report.source.boardTotalOffers+" offers · pagination "+(report.source.boardCompletePagination?"complete":"unverified")+" · currently fresh "+report.source.confirmedFreshBoardAtAudit+" |",
  "| Model/board lineage | "+(report.source.boardMatchesResearch?"matched":"unmatched or unavailable")+" |",
  "| Provider quota | "+report.source.quotaUnit+" · last archived remaining "+(report.source.lastKnownCreditsRemaining??"unverified")+" (NOT live balance) |",
  "",
  "No independently verified platform settlements, calibrated bankroll edge or proven lineup EV.",
  ""
 ].join("\n");
 console.log(md);
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
 if(!s?.complete)console.log("::warning::Official final-game player stats incomplete; existing NHL collector retries unfinished dates");
 if(i.precommittedDecided===0)console.log("::notice::Waiting for finalized games with explicit frozen standalone prop selections");
}
if(require.main===module)main();
module.exports={auditOvernight,main};
