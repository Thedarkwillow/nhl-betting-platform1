"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {grade,verify}=require("../src/nfl-matchup-shadow-grading.cjs");
const origAt="2026-11-10T13:02:11Z",shadowAt="2026-11-10T13:12:12Z",
 start="2026-11-10T22:00:00Z";
const original={id:"nfl-one",sourceGameId:"game1",
 historicalPlayerId:"player1",eventStartsAt:start,
 market:"passing_yards",line:220.5,selectedSide:"Higher",
 historicalProjection:250,tier:"Standard"};
const record={id:"nfl-one",sourceSnapshotFirstGitCommitAt:origAt,
 gameStartAt:start,originalSelectedSide:"Higher",
 originalOfferedSideUnchanged:true,originalLine:220.5,
 originalProjection:250,shadowStatus:"research_shadow_only",
 shadowProjection:230,shadowDirection:"Higher",
 calibratedProbability:null,autoPickEligible:false};
const shadow={kind:"nfl_pregame_matchup_all_sources_shadow_v1",schemaVersion:1,
 createdAt:"2026-11-10T13:12:11.250Z",originalFirstGitCommittedAt:origAt,
 sourceBoardAsOfAt:"2026-11-10T13:00:10Z",
 originalHigherLowerDirectionsImmutable:true,championModelUnchanged:true,
 trueProspectiveOnlyAfterOwnFirstGitCommitBeforeKickoff:true,
 calibratedProbabilities:false,rows:[record]};
const gradeOriginal={kind:"nfl_private_pregame_evidence_separated_outcome_audit_v1",
 generatedAt:"2026-11-11T12:00:00Z",
 nflverseFinalStatsNotPlatformSettlement:true,
 explicitFrozenDirections:{rows:[{id:"nfl-one",market:"passing_yards",
 line:220.5,modeledSide:"Higher",firstGitCommittedAt:origAt,
 status:"decided",actual:210,actualSide:"Lower",
 selectedSideResult:"incorrect",officialScheduleGameId:"game1-verified"}]}};
const params={originalSnapshots:[{snapshot:{
 kind:"nfl_independent_partner_standard_directional_original_research_v1",
 sourceBoardAsOfAt:"2026-11-10T13:00:10Z",
 createdAt:"2026-11-10T13:02:10.250Z",
 selections:[original]},
 gitHistoryCount:1,firstCommittedAt:origAt}],snapshots:[{
 snapshot:shadow,gitHistoryCount:1,firstCommittedAt:shadowAt
 }],originalGrade:gradeOriginal};
test("independently future-first-Git challenger really scores changed yard forecast",()=>{
 const x=grade(params);
 assert.equal(x.originalFirstGitSnapshotsVerified,1);
 assert.equal(x.combined.decided,1);
 assert.equal(x.combined.originalMAE,40);
 assert.equal(x.combined.contextMAE,20);
 assert.equal(x.combined.pairedMAEImprovement,20);
 assert.equal(x.combined.correctChampion,0);
 assert.equal(x.combined.correctContext,0);
 assert.equal(x.combined.correctLower,1);
 assert.equal(x.productionChampionUnchanged,true);
 assert.equal(x.november9GameCannotBePrecommittedChallengerEvidence,true);
});
test("no first Git proof, premature commit, edited frozen projection and side cannot score",()=>{
 assert.equal(verify({...shadow,createdAt:"2026-11-10T13:14:00Z"},shadowAt),false);
 assert.equal(verify(shadow,"2026-11-10T21:59:00Z"),false);
 assert.throws(()=>grade({...params,snapshots:[{snapshot:shadow,gitHistoryCount:2,
  firstCommittedAt:shadowAt}]}),/first Git/);
 assert.throws(()=>grade({...params,snapshots:[{
  snapshot:{...shadow,rows:[{...record,originalProjection:777}]},
  gitHistoryCount:1,firstCommittedAt:shadowAt}]}),/same original/);
 assert.throws(()=>grade({...params,originalGrade:{...gradeOriginal,
  explicitFrozenDirections:{rows:[{...gradeOriginal.explicitFrozenDirections.rows[0],
  actualSide:"Higher"}]}}}),/Invalid original/);
});
test("duplicate original game/player/market quote is not treated as independent result",()=>{
 const more={...shadow,createdAt:"2026-11-10T13:13:11.000Z"};
 const x=grade({...params,snapshots:[...params.snapshots,
  {snapshot:more,gitHistoryCount:1,firstCommittedAt:"2026-11-10T13:13:12Z"}]});
 assert.equal(x.combined.decided,1);
 assert.equal(x.duplicateAndAbstentionExclusions.duplicate_original_game_market_line,1);
});
test("no new shadow produces zero hit rate instead of retroactively scoring November 9",()=>{
 const x=grade({...params,snapshots:[]});
 assert.equal(x.combined.decided,0);
 assert.equal(x.combined.contextHypotheticalHitRate,null);
 assert.equal(x.combined.pairedMAEImprovement,null);
});

const v={kind:"nfl_empirical_threshold_shadow_v1",probabilities:{higher:.6,lower:.4,push:0},
 priorGames:10,originalLine:original.line,originalSide:original.selectedSide,
 originalMean:original.historicalProjection,sourceGameId:original.sourceGameId,
 historicalPlayerId:original.historicalPlayerId,createdAt:shadow.createdAt,
 calibrated:false,conditionalOnPlaying:true,researchOnly:true,modelPromoted:false};
const empiricalParams=(value=v)=>({...params,empiricalPolicyAt:"2026-11-10T12:00:00Z",
 snapshots:[{...params.snapshots[0],snapshot:{...shadow,rows:[{...record,empiricalThresholdShadow:value}]}}]});
test("exact frozen NFL probability distribution scores original outcomes, including context abstention",()=>{
 let p=empiricalParams();
 p.snapshots[0].snapshot.rows[0].shadowStatus="abstain_missing_core_or_injury";
 const r=grade(p).empiricalThresholdResearch;
 assert.equal(r.overall.resolved,1);assert.equal(r.overall.correctOriginalSide,0);
 assert.ok(Math.abs(r.overall.threeOutcomeBrier-.72)<1e-9);
 assert.ok(Math.abs(r.overall.threeOutcomeLogLoss+Math.log(.4))<1e-9);
 assert.equal(r.overall.independentlyCalibrated,false);
});
test("invalid probability vector, changed line, missing policy and future policy fail closed independently",()=>{
 for(const bad of [{...v,probabilities:{higher:.6,lower:.5,push:.1}},{...v,originalLine:225},{...v,createdAt:"2026-11-11T00:00:00Z"}]){
  const r=grade(empiricalParams(bad));
  assert.equal(r.empiricalThresholdResearch.overall.registered,0);
  assert.equal(r.empiricalThresholdResearch.invalidProbabilities,1);
  assert.equal(r.combined.decided,1);
 }
 for(const at of [null,"2026-11-11T00:00:00Z"])
  assert.equal(grade({...empiricalParams(),empiricalPolicyAt:at}).empiricalThresholdResearch.overall.registered,0);
});
test("pending and repeated exact NFL probability observations never inflate resolved sample",()=>{
 const p=empiricalParams();
 p.originalGrade={...gradeOriginal,explicitFrozenDirections:{rows:[{...gradeOriginal.explicitFrozenDirections.rows[0],status:"pending_official_final"}]}};
 p.snapshots.push(p.snapshots[0]);
 const r=grade(p).empiricalThresholdResearch.overall;
 assert.equal(r.registered,1);assert.equal(r.pending,1);assert.equal(r.threeOutcomeBrier,null);
});
test("integer original NFL threshold push gets its own probability mass",()=>{
 const p=empiricalParams({...v,originalLine:210,probabilities:{higher:.5,lower:.3,push:.2}});
 p.originalSnapshots=[{...params.originalSnapshots[0],snapshot:{...params.originalSnapshots[0].snapshot,selections:[{...original,line:210}]}}];
 p.snapshots[0].snapshot.rows[0].originalLine=210;
 p.originalGrade={...gradeOriginal,explicitFrozenDirections:{rows:[{...gradeOriginal.explicitFrozenDirections.rows[0],line:210,status:"push",actualSide:"Push",selectedSideResult:null}]}};
 const r=grade(p).empiricalThresholdResearch.overall;
 assert.equal(r.pushes,1);assert.equal(r.resolved,1);
 assert.ok(Math.abs(r.threeOutcomeBrier-.98)<1e-9);
});
