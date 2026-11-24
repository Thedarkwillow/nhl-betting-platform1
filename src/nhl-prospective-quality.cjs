"use strict";
/**
 * Prospective NHL research verification. This module DOES NOT infer a new
 * game ID, edit a frozen prediction, or treat game outcomes as platform
 * settlements. It reports why independently archived picks remain pending.
 */
const FINAL_STATES=new Set(["OFF","FINAL"]);
function analyzeProspective(report,officialGames=[],{now=new Date().toISOString(),missingIdentity=[]}={}){
 const current=Date.parse(now);
 if(!Number.isFinite(current))throw Error("Invalid prospective evaluation time");
 const byId=new Map(officialGames.filter(g=>Number.isInteger(g?.id)).map(g=>[g.id,g]));
 const pending={notStarted:0,liveOrPendingFinal:0,finalWithoutPlayerStats:0,unknownOfficialStatus:0};
 const games={notStarted:new Set(),liveOrPendingFinal:new Set(),finalWithoutPlayerStats:new Set(),unknownOfficialStatus:new Set()};
 for(const p of report.pending||[]){
  const game=byId.get(p.gameId),at=Date.parse(game?.startTimeUTC);
  const category=!game||!Number.isFinite(at)?"unknownOfficialStatus":
   FINAL_STATES.has(String(game.gameState).toUpperCase())||game.finalized===true?"finalWithoutPlayerStats":
   at>current?"notStarted":"liveOrPendingFinal";
  pending[category]++;games[category].add(p.gameId);
 }
 const selected=report.individualPropAudit?.kind==="nhl_frozen_individual_prop_preference_audit_v1"?
  report.individualPropAudit:null;
 const explicit=selected?.explicitProspective||null;
 const legacy=selected?.legacyRetrospective||null;
 const lineup=report.selectedLineupAudit?.kind==="nhl_git_frozen_optimizer_selected_directions"?
  report.selectedLineupAudit:null;
 const graded=(report.graded||[]).filter(p=>typeof p.correct==="boolean");
 const wins=graded.filter(p=>p.correct===true).length;
 const alwaysLower=graded.filter(p=>p.result==="Lower").length;
 const alwaysHigher=graded.filter(p=>p.result==="Higher").length;
 const marketSummary={};
 for(const p of graded){
  const k=String(p.market||"unknown");
  const x=marketSummary[k]||(marketSummary[k]={decisions:0,modelCorrect:0,alwaysLowerCorrect:0,alwaysHigherCorrect:0});
  x.decisions++;x.modelCorrect+=p.correct?1:0;x.alwaysLowerCorrect+=p.result==="Lower"?1:0;x.alwaysHigherCorrect+=p.result==="Higher"?1:0;
 }
 const rawIssues=missingIdentity.map(row=>({
  snapshotFile:row.snapshotFile??null,
  recordedAt:row.recordedAt??null,
  archivedMatchup:row.prop?.matchup??null,
  missingFields:["team","opponent","eventStartsAt","capturedAt"].filter(k=>!row.prop?.[k]),
  reason:row.reason??"unknown"
 }));
 const fields={};for(const r of rawIssues)for(const f of r.missingFields)fields[f]=(fields[f]||0)+1;
 const audit=report.snapshotAudit||{};
 return {schemaVersion:1,generatedAt:now,source:"Git-archived pregame NHL research snapshots with official NHL game IDs",
  accuracyType:"prospective_archived_research_directions_not_confirmed_platform_settlements",
  totalRankedProps:audit.totalRankedProps??0,
  eligiblePredictions:audit.eligiblePredictions??0,
  gameIdentityRecoveredFromOfficialSchedule:audit.recoveredGameIdentity??0,
  unresolvedIdentityCount:audit.skipped?.missingGameIdentity??0,
  unresolvedIdentityFields:fields,
  unresolvedIdentityExamples:rawIssues.slice(0,12),
  identityPolicy:"No player-name guessing. Resolve from immutable original opponent and event time, or strict original @/vs opponent plus unique official matchup within 48h of pregame source capture; always require pre-puck-drop Git archive proof.",
  pregameProofSkipped:audit.skipped?.notProvenPregame??0,
  duplicateSnapshotsExcluded:audit.skipped?.duplicate??0,
  gradedDecisions:explicit?.decided??0,gradedProps:explicit?.graded??0,
  selectedIndividualProps:explicit?.uniqueSelections??0,
  selectedIndividualPending:explicit?.pending??0,
  verifiedProspectiveModelHitRate:explicit?.hitRate??null,
  prospectiveAlwaysLowerBaseline:explicit?.alwaysLowerBaseline??null,
  prospectiveAlwaysHigherBaseline:explicit?.alwaysHigherBaseline??null,
  marketSummary:explicit?.byMarket||{},
  distinctGradedGames:explicit?.distinctGradedGames??0,
  legacyModelPreferenceReconstruction:legacy?{
   selectedUniqueProps:legacy.uniqueSelections,
   decided:legacy.decided,correct:legacy.correct,
   observedResultRate:legacy.hitRate,
   byTier:legacy.byTier,byMarket:legacy.byMarket,byGameDate:legacy.byGameDate,
   explicitlyPrecommittedBeforeGames:false,
   retrospectivePolicyWrittenAfterGames:true,
   notVerifiedProspectiveStrategyHitRate:true
  }:null,
  optimizerLineupAudit:lineup?{
   selectedUniqueProps:lineup.selectedDistinctOriginalOffers,
   decided:lineup.decided,correct:lineup.correct,
   observedResultRate:lineup.observedSelectedDirectionHitRate,
   lineupPerformanceCorrelationsVerified:false
  }:null,
  rawOfferedSideRowsGraded:report.graded?.length||0,
  rawOfferedSideDecisions:graded.length,
  rawOfferedSideCorrectRate:graded.length?wins/graded.length:null,
  rawOfferedSideAlwaysLowerFraction:graded.length?alwaysLower/graded.length:null,
  rawOfferedSideAlwaysHigherFraction:graded.length?alwaysHigher/graded.length:null,
  rawOfferedSideMarketSummary:marketSummary,
  pendingTotal:(report.pending||[]).length,pendingReasons:pending,
  distinctPendingGames:Object.fromEntries(Object.entries(games).map(([k,v])=>[k,v.size])),
  calibrated:false,originalPrizePicksSettlementVerified:false,expectedValueVerified:false,
  warning:"Primary NHL model direction score uses explicitly Git-frozen individual prop preferences, regardless of lineup membership, from a policy committed before future games. Historic raw Higher/Lower offered sides were not recommendations. Retrospective reconstructed preferences from pregame probability vectors are labeled as exploratory, not a precommitted prospective selection strategy. Lineup model performance is secondary. NHL FINAL boxscores do not establish platform settlement, EV, or calibration."};
}
module.exports={analyzeProspective,FINAL_STATES};
