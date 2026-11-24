"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {analyzeNhlSourceCoverage}=require("../src/nhl-source-coverage-audit.cjs");
const {pearsonWithInterval,officialPairedCountStats,evaluateNhlCountStatDependence}=
 require("../src/nhl-historical-pair-correlation.cjs");
const {buildPublicProspectiveCohort,pacificDay,wilson95}=
 require("../src/nhl-public-prospective-cohort.cjs");
const boardTime="2026-11-05T17:00:00Z",start="2026-11-05T20:00:00Z";
const schedule={complete:true,games:[
 {id:2026020101,home:"BOS",away:"NYR",startTimeUTC:start},
 {id:2026020102,home:"LAK",away:"SEA",startTimeUTC:"2026-11-06T00:00:00Z"}]};
const base={projectionId:"pp1",player:"Example Skater",team:"BOS",matchup:"NYR",
 market:"Shots On Goal",period:"Full game",tier:"Standard",line:2.5,
 side:"Higher",observedAt:"2026-11-05T16:58:00Z",
 capturedAt:boardTime,eventStartsAt:start};
const archived={provider:"independent_approved_source",generatedAt:boardTime,
 completePagination:true,sourceStatus:"fresh",safeForLiveUse:true,
 totalOffers:1,rows:[base]};
test("independent source coverage counts exact official scheduled games, never asserts original app coverage",()=>{
 const d=analyzeNhlSourceCoverage(archived,{rankedProps:[{
  gameId:2026020101,playerId:123}]},schedule,{asOf:"2026-11-05T17:05:00Z"});
 assert.equal(d.status,"complete_independent_source_response_not_original_platform_coverage");
 assert.equal(d.officialGamesInWindow,2);
 assert.equal(d.officialGamesWithObservedOffers,1);
 assert.equal(d.officialGameObservedShare,.5);
 assert.equal(d.uniqueProviderProjectionIds,1);
 assert.equal(d.matchedEligibleSideRows,1);
 assert.equal(d.sourceFreshForLiveUse,true);
 assert.equal(d.originalPlatformOffersAuthenticated,false);
 assert.equal(d.entireOriginalPrizePicksBoardVerified,false);
});
test("independent board unknown schedule, malformed identity and started games fail safely",()=>{
 const no=analyzeNhlSourceCoverage(archived,null,null,{asOf:"2026-11-05T17:05:00Z"});
 assert.equal(no.officialGamesInWindow,null);
 assert.equal(no.sourceFreshForLiveUse,false);
 const bad=analyzeNhlSourceCoverage({...archived,rows:[base,
  {...base,projectionId:"pp2",team:"PIT"},
  {...base,projectionId:"pp3",period:"1st period"},
  {...base,projectionId:"pp4",capturedAt:"2026-11-05T20:30:00Z"}]},
 null,schedule,{asOf:"2026-11-05T20:30:00Z"});
 assert.equal(bad.matchedEligibleSideRows,1);
 assert.equal(bad.rejectedRows.unmatchedOfficialGame,1);
 assert.equal(bad.rejectedRows.marketOrPeriodUnsupported,1);
 assert.equal(bad.rejectedRows.staleOrAfterStart,1);
 assert.equal(bad.sourceFreshForLiveUse,false);
});
function makeCountPair(n=18){
 const a=[],b=[];
 for(let i=0;i<n;i++){
  const date="2026-10-"+String(i+1).padStart(2,"0");
  const gameId=3000+i;
  a.push({gameId,playerId:11,team:"BOS",gameDate:date,shotsOnGoal:i+1});
  b.push({gameId,playerId:12,team:"BOS",gameDate:date,points:(i+1)*2+1});
 }
 a.push({gameId:4000,playerId:11,team:"BOS",gameDate:"2026-11-05",shotsOnGoal:999});
 b.push({gameId:4000,playerId:12,team:"BOS",gameDate:"2026-11-05",points:0});
 return {players:{"11":{games:a},"12":{games:b}}};
}
const pa={gameId:2026020101,playerId:11,team:"BOS",opponent:"NYR",
 market:"shotsOnGoal",tier:"Standard",lean:"Higher",probability:.69,
 capturedAt:boardTime,eventStartsAt:start};
const pb={...pa,playerId:12,market:"points",lean:"Lower",probability:.68};
test("real repeated-game count correlations use dated past-only official NHL games, not future result leaks",()=>{
 const history=makeCountPair(18);
 const pairs=officialPairedCountStats(pa,pb,history);
 assert.equal(pairs.length,18);
 assert.ok(pairs.every(x=>x.date<"2026-11-05"));
 const raw=pearsonWithInterval(pairs);
 assert.equal(raw.status,"descriptive_repeat_pair_stat_correlation");
 assert.equal(raw.countStatPearson,1);
 assert.ok(raw.approxFisher95.lower>.99);
 const report=evaluateNhlCountStatDependence(history,[pa,pb],
  {asOf:"2026-11-05T17:05:00Z"});
 assert.equal(report.evaluatedPairs,1);
 assert.equal(report.measuredPairs,1);
 assert.equal(report.pairs[0].sideAlignedCountCorrelation,-1);
 assert.equal(report.measuredPropWinEventCorrelations,false);
 assert.equal(report.modelOrOptimizerModified,false);
 assert.equal(report.verifiedJointLineupProbability,false);
});
test("insufficient historical games and zero variance never invent a correlation",()=>{
 const h=makeCountPair(8);
 const r=evaluateNhlCountStatDependence(h,[pa,pb],
 {asOf:"2026-11-05T17:05:00Z"});
 assert.equal(r.measuredPairs,0);
 assert.equal(r.pairs[0].countStatPearson,null);
 assert.equal(r.pairs[0].status,"insufficient_repeated_official_games");
 const same=pearsonWithInterval(Array.from({length:18},(_,i)=>({x:1,y:i+1})));
 assert.equal(same.status,"zero_stat_variance");
 assert.throws(()=>pearsonWithInterval([{x:1,y:2}],{minimumPairedGames:3}),/>=12/);
});
const t={gameStartAt:"2026-11-06T01:00:00Z",
 firstGitCommittedAt:"2026-11-06T00:15:04Z",selectedSide:"Higher",
 market:"shotsOnGoal",tier:"Standard"};
function ledgerFor(statuses){
 const records=statuses.map((status,i)=>({
  ...t,id:"nhl-unique-"+i,selectionStatus:status
 }));
 const counts={registered:records.length,correct:0,incorrect:0,push:0,pending:0};
 for(const r of records){if(r.selectionStatus==="pending_official_player_stats")counts.pending++;
  else counts[r.selectionStatus]++;}
 return {kind:"private_immutable_source_linked_nhl_selected_predictions",
  cohort:"explicit_original_Git_precommitted_standalone_model_directions",
  counts,records};
}
test("public cohort publishes only grouped counts; small samples and never formula/private player info",()=>{
 const statuses=[...Array(8).fill("correct"),...Array(3).fill("incorrect"),
  "push","pending_official_player_stats"];
 const source=ledgerFor(statuses);
 source.records.forEach((r,i)=>{r.playerId=100+i;r.rawVendorPayout="DO_NOT_PUBLISH";});
 const d=buildPublicProspectiveCohort(source);
 assert.equal(d.counts.registered,13);
 assert.equal(d.decided,11);
 assert.equal(d.byMarket[0].correct,8);
 assert.equal(d.byMarket[0].incorrect,3);
 assert.equal(d.byMarket[0].push,1);
 assert.equal(d.byMarket[0].pending,1);
 assert.equal(d.byMarket[0].observedRate,.7273);
 assert.equal(d.byTier[0].group,"Standard");
 assert.equal(d.byPacificGameDay[0].group,"2026-11-05");
 assert.equal(d.originalFrozenPickIdentifiersNotPublic,true);
 assert.ok(!JSON.stringify(d).includes("DO_NOT_PUBLISH"));
 assert.ok(!JSON.stringify(d).includes("playerId"));
 assert.ok(!JSON.stringify(d).includes("firstGitCommittedAt"));
});
test("0 or tiny prospective decisions never manufactures a prospective hit rate",()=>{
 const d=buildPublicProspectiveCohort(ledgerFor(Array(5).fill("correct")));
 assert.equal(d.prospectiveRate,null);
 assert.equal(d.smallSampleWithheld,true);
 assert.equal(d.byMarket[0].observedRate,null);
 assert.equal(buildPublicProspectiveCohort(ledgerFor(Array(5).fill("pending_official_player_stats"))).smallSampleWithheld,false);
 assert.equal(wilson95(0,0),null);
 assert.ok(wilson95(5,10).lower<.5);
});
test("cohort identity conflicts, impossible chronology and mismatched totals do not publish rates",()=>{
 const source=ledgerFor(["correct","incorrect"]);
 assert.equal(buildPublicProspectiveCohort({...source,records:[source.records[0],source.records[0]]}).cohortVerified,false);
 assert.equal(buildPublicProspectiveCohort({...source,
  records:source.records.map(x=>({...x,firstGitCommittedAt:"2026-11-06T02:00:00Z"}))}
 ).cohortVerified,false);
 assert.equal(buildPublicProspectiveCohort({...source,counts:{...source.counts,correct:5}}).cohortVerified,false);
 assert.equal(buildPublicProspectiveCohort(null).status,"original_commit_ledger_missing");
 assert.equal(pacificDay("2026-11-06T01:00:00Z"),"2026-11-05");
});

test("cached official previous-season player games extend repeated-pair correlation without fabricated team histories",()=>{
 const {mergePriorOfficialPairHistory}=require("../src/nhl-historical-pair-source.cjs");
 const archive="cached-archive",auditAt="2026-11-02T00:00:00Z",
  audit={generatedAt:auditAt,archiveGeneratedAt:archive};
 const g=(id,playerId,statName,value)=>({gameId:2025020000+id,
  gameDate:"2026-01-"+String(id).padStart(2,"0"),season:"2025-26",
  [statName]:value});
 const prior={schemaVersion:2,
  source:"NHL Web game logs with official NHL Stats REST per-game blocked shots and goalie saves",
  archiveGeneratedAt:archive,lineOutcomeAuditGeneratedAt:auditAt,errors:[{error:"Unresolved source"}],
  logs:{"11":Array.from({length:18},(_,i)=>g(i+1,11,"shotsOnGoal",i+1)),
   "12":Array.from({length:18},(_,i)=>g(i+1,12,"points",2*i+3))}};
 const base=makeCountPair(8);
 const accepted=mergePriorOfficialPairHistory(base,prior,audit);
 assert.equal(accepted.metadata.status,"cached_official_prior_season_player_game_logs_provenance_matched");
 assert.equal(accepted.metadata.addedOfficialPlayerGames,36);
 assert.equal(accepted.metadata.historicalTeamLabelsAvailable,false);
 assert.equal(accepted.metadata.sourceErrorCount,1);
 assert.equal(accepted.metadata.officialSeasonCompletenessVerified,false);
 const samples=officialPairedCountStats(pa,pb,accepted.history);
 assert.equal(samples.length,26);
 assert.equal(samples.filter(x=>x.historicalTeamRelationVerified===false).length,18);
 const report=evaluateNhlCountStatDependence(accepted.history,[pa,pb],
  {asOf:"2026-11-05T17:05:00Z"});
 assert.equal(report.measuredPairs,1);
 assert.equal(report.pairs[0].historicalTeamRelationVerified,false);
 assert.equal(report.pairs[0].pairedGamesWithoutTeamLabels,18);
 assert.equal(report.pairs[0].prospectivePropCoHitRateVerified,false);
 assert.equal(accepted.metadata.providerCallsMade,0);
 const rejected=mergePriorOfficialPairHistory(base,prior,{...audit,generatedAt:"wrong"});
 assert.equal(rejected.metadata.addedOfficialPlayerGames,0);
 assert.equal(evaluateNhlCountStatDependence(rejected.history,[pa,pb],
  {asOf:"2026-11-05T17:05:00Z"}).measuredPairs,0);
});
