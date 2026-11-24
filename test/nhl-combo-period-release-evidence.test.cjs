"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {historicalDates}=require("../scripts/backfill-nhl-prior-season-periods.cjs");
const {auditSeasonCoverage,auditCalibration,auditPlatformSources,
 buildReleaseEvidence,prepareResearchFreeze}=
 require("../src/nhl-period-combo-launch-evidence.cjs");
const {optimize,requiresDedicatedSettlement}=
 require("../src/nhl-lineup-optimizer.cjs");
const at="2026-11-06T18:05:00Z",cap="2026-11-06T18:01:00Z",
 start="2026-11-07T02:00:00Z";
test("season archive counts valid completed and no-game days without equating a batch success to full coverage",()=>{
 const all=historicalDates(),hist={sourceDates:[all[0],all[1],all[0],"2030-01-01"]};
 const r=auditSeasonCoverage(hist,[all[2],all[2]],{
  sourceStatus:"batch_complete",completeDates:[{date:all[1]}],failed:[],paidProviderRequests:0});
 assert.equal(r.completeOfficialGameDates,2);
 assert.equal(r.verifiedNoGameDates,1);
 assert.equal(r.pendingDays,all.length-3);
 assert.equal(r.earliestPendingDate,all[3]);
 assert.equal(r.historicalArchiveFullyCovered,false);
 assert.equal(r.latestBatch.status,"batch_complete");
 assert.equal(r.latestBatch.noPaidProviderRequests,true);
});
test("only complete historical calendar coverage passes stage 1, without granting lineup permission",()=>{
 const all=historicalDates();
 const r=buildReleaseEvidence({periodHistory:{sourceDates:[all[0]]},
  walkforward:{byMarket:{}},comboAudit:null,periodAudit:null,
  emptyDates:all.slice(1),now:at});
 assert.equal(r.stages["1_historical_coverage"].ready,true);
 assert.equal(r.stages["2_original_platform_source"].ready,false);
 assert.equal(r.stages["3_heldout_calibration"].ready,false);
 assert.equal(r.stages["4_frozen_prospective_settlement"].ready,false);
 assert.equal(r.stages["5_lineup_release"].ready,false);
 assert.equal(r.automaticHigherLowerEnabled,false);
 assert.equal(r.optimizedLineupEligibilityEnabled,false);
 assert.equal(r.verifiedProspectiveHitRate,null);
 assert.equal(r.expectedValue,null);
});
test("good-looking synthetic Brier scores never qualify as real platform calibrated probabilities",()=>{
 const wf={byMarket:{"1|shotsOnGoal":{
  period:1,market:"shotsOnGoal",walkForwardPlayerPeriodPredictions:500,
  distinctHeldoutGames:100,distinctHeldoutDates:30,
  poissonBrier:.18,smoothedEmpiricalBrier:.22,
  gameClusterUncertaintyComputed:false,probabilityCalibrationApproved:false,
  realPlatformOfferedLinesUsed:false}}};
 const m=auditCalibration(wf);
 assert.equal(m.marketsWithExploratorySample,1);
 assert.equal(m.marketsBeatingSyntheticThresholdBaseline,1);
 assert.equal(m.actualProviderLineMarketsValidated,0);
 assert.equal(m.approvedMarkets,0);
 assert.equal(m.markets[0].releaseApproved,false);
 assert.ok(m.markets[0].missing.includes("synthetic_thresholds_not_actual_platform_lines"));
 assert.ok(m.markets[0].missing.includes("no_game_cluster_uncertainty"));
});
test("structured combo member metadata is not proof of original platform authentication",()=>{
 const source=auditPlatformSources({
  comboRows:10,withExactStructuredMembers:8,originalProviderAuthenticated:false
 },{
  periodRows:22,completeSourceAndModelResearchPreferences:10,
  originalProviderOffersAuthenticated:false
 });
 assert.equal(source.structuredComboRowsObserved,8);
 assert.equal(source.conditionalPeriodResearchRows,10);
 assert.equal(source.automaticPickSourceReady,false);
 assert.equal(source.originalPlatformSettlementVerified,false);
});
const base={kind:"period",platform:"PrizePicks",sourceQuoteId:"q-123",
 sourceVersion:"v9",market:"shotsOnGoal",period:1,line:1.5,
 officialPlayerId:8479999,officialGameId:2026020264,
 sourceCapturedAt:cap,eventStartsAt:start};
const model={researchOnly:true,modelBuiltAt:"2026-11-06T17:59:00Z",
 modelVersion:"period-shadow-v1",lean:"Higher",probability:.63};
test("qualified exact snapshots can be locally hashed but are NEVER proven Git-frozen or payout verified",()=>{
 const x=prepareResearchFreeze(base,model,{asOf:at});
 assert.equal(x.eligible,true);
 assert.equal(x.researchOnly,true);
 assert.match(x.localFreezeHash,/^[a-f0-9]{64}$/);
 assert.equal(x.record.gitCommitPredatesEveryGame,false);
 assert.equal(x.record.originalPlatformAuthenticated,false);
 assert.equal(x.record.platformSettlementVerified,false);
 assert.equal(x.record.eligibleForOptimizedLineups,false);
 assert.equal(x.record.estimatedProbability,.63);
 assert.notEqual(prepareResearchFreeze({...base,line:2.5},model,{asOf:at}).localFreezeHash,x.localFreezeHash);
});
test("premature timestamps, missing quote version, fake member IDs and post-start collection fail closed",()=>{
 assert.equal(prepareResearchFreeze({...base,sourceVersion:null},model,{asOf:at}).reason,
  "original_quote_locator_or_version_missing");
 assert.equal(prepareResearchFreeze({...base,officialPlayerId:null},model,{asOf:at}).reason,
  "exact_member_game_or_time_identity_missing");
 assert.equal(prepareResearchFreeze({...base,eventStartsAt:"2026-11-06T18:10:00Z"},model,{asOf:at}).reason,
  "pregame_time_or_model_freeze_invalid");
 assert.equal(prepareResearchFreeze(base,{...model,modelBuiltAt:"2026-11-06T18:03:00Z"},{
  asOf:at}).reason,"pregame_time_or_model_freeze_invalid");
});
test("distinct-game exact combo freezes are research only, invalid duplicated player membership is blocked",()=>{
 const o={...base,kind:"combo",period:"full_game",
  memberPlayerIds:[8479999,8480000],
  officialGameIds:[2026020264,2026020265],
  eventStartsAt:[start,"2026-11-07T03:00:00Z"]};
 const r=prepareResearchFreeze(o,model,{asOf:at});
 assert.equal(r.eligible,true);
 assert.deepEqual(r.record.officialGameIds,[2026020264,2026020265]);
 assert.equal(r.record.eligibleForAutomaticHigherLower,false);
 assert.equal(prepareResearchFreeze({...o,memberPlayerIds:[8479999,8479999]},
  model,{asOf:at}).reason,"exact_member_game_or_time_identity_missing");
});
test("production optimizer rejects all raw combo and period variants, including missing member metadata",()=>{
 const raw=[
  {market:"Goals (Combo)",playerId:10},
  {market:"shotsOnGoalCombo",playerId:11},
  {market:"1st Period Shots On Goal",playerId:12},
  {market:"shotsOnGoal",scoringPeriod:"2P",playerId:13},
  {market:"shotsOnGoal",members:[{playerId:12}],playerId:14},
  {market:"shotsOnGoal",kind:"combo",playerId:15}
 ];
 raw.forEach(x=>assert.equal(requiresDedicatedSettlement(x),true));
 const bad=raw.map((x,i)=>({...x,playerId:i+100,matchup:"bad "+i,
  tier:"Standard",lean:"Higher",probability:.999}));
 const good=[{playerId:1,matchup:"good 1"},{playerId:2,matchup:"good 2"}]
  .map(x=>({...x,market:"shotsOnGoal",tier:"Standard",
   lean:"Higher",probability:.65}));
 const r=optimize([...bad,...good]);
 assert.deepEqual(r[2].picks.map(x=>x.playerId),[1,2]);
 assert.equal(r[3],null);
});

test("game-cluster bootstrap is deterministic and never turns a synthetic comparison into an approved platform bet",()=>{
 const {bootstrapGameBrierDifference}=require("../src/nhl-period-count-model.cjs");
 const rows=Array.from({length:35},(_,i)=>({diff:-(i%5+1)/100,n:3}));
 const x=bootstrapGameBrierDifference(rows);
 assert.equal(x.unit,"NHL_official_game_cluster");
 assert.ok(x.upper<0&&x.lower<0);
 assert.deepEqual(x,bootstrapGameBrierDifference(rows));
 assert.equal(bootstrapGameBrierDifference(rows.slice(0,9)),null);
});
