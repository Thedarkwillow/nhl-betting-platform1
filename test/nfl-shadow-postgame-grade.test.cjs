"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createShadow}=require("../src/nfl-prospective-shadow.cjs");
const {gradeProspectiveShadows}=require("../src/nfl-shadow-postgame-grade.cjs");
const origCommit="2026-11-10T13:02:11Z",shadowCommit="2026-11-10T13:05:10Z";
const sourceAt="2026-11-10T13:00:10Z",starts="2026-11-12T23:00:00Z";
const p=(id,line,projected,last5,side)=>({id,sourceGameId:"G3",
 historicalPlayerId:"P"+id,team:"WAS",opponent:"NYG",
 eventStartsAt:starts,market:"receiving_yards",tier:"Standard",
 line,historicalProjection:projected,last5Baseline:last5,
 selectedSide:side,offeredSide:side,priorRecordedGames:12,
 probability:null,autoPickEligible:false});
const original={kind:"nfl_independent_partner_standard_directional_original_research_v1",
 createdAt:"2026-11-10T13:02:10Z",sourceBoardAsOfAt:sourceAt,
 selections:[p("a",40,48,45,"Higher"),p("b",40,41,42,"Higher"),
   p("c",40,30,33,"Lower"),p("d",40,52,37,"Higher")]};
const shadow=createShadow(original,{sourceFirstGitCommittedAt:origCommit,
 now:"2026-11-10T13:05:10.250Z"});
const graded=original.selections.map((x,i)=>({
 id:x.id,status:"decided",market:x.market,line:x.line,
 sourceGameId:x.sourceGameId,modelProjection:x.historicalProjection,
 modeledSide:x.selectedSide,firstGitCommittedAt:origCommit,
 actual:[51,31,50,70][i],
 actualSide:["Higher","Lower","Higher","Higher"][i],
 selectedSideResult:["correct","incorrect","incorrect","correct"][i],
 officialScheduleGameId:"OFF3"}));
const report={kind:"nfl_private_pregame_evidence_separated_outcome_audit_v1",
 generatedAt:"2026-11-13T14:00:00Z",nflverseFinalStatsNotPlatformSettlement:true,
 neverClaimNumericSideAsPreviouslyFrozenHigherLower:true,
 explicitFrozenDirections:{rows:graded}};
const params={grade:report,originalSnapshots:[{snapshot:original,gitHistoryCount:1,
 firstCommittedAt:origCommit}],shadowSources:[{shadow,gitHistoryCount:1,
 firstCommittedAt:shadowCommit}]};
test("original first-Git future shadow grades only its frozen abstention decisions",()=>{
 const g=gradeProspectiveShadows(params);
 assert.equal(g.originalGitShadowSnapshotsVerified,1);
 assert.equal(g.uniqueOriginalFrozenQuotes,4);
 assert.equal(g.byPolicy.relativeMargin10.researchSelections,3);
 assert.equal(g.byPolicy.relativeMargin10.decided,3);
 assert.equal(g.byPolicy.relativeMargin10.correct,2);
 assert.equal(g.byPolicy.relativeMargin10.hypotheticalAlwaysHigher,3);
 assert.equal(g.byPolicy.baselineAgreementAndMargin10.researchSelections,2);
 assert.equal(g.byPolicy.baselineAgreementAndMargin10.correct,1);
 assert.equal(g.officialWagersPlaced,0);
 assert.equal(g.payoutAdjustedEV,null);
});
test("never count the same game player quote twice from separate copies",()=>{
 const s2={...shadow,createdAt:"2026-11-10T13:06:10Z"};
 const repeated=[...params.shadowSources,{shadow:s2,gitHistoryCount:1,
  firstCommittedAt:"2026-11-10T13:06:10Z"}];
 const g=gradeProspectiveShadows({...params,shadowSources:repeated});
 assert.equal(g.duplicateQuotesNotCounted,4);
 assert.equal(g.uniqueOriginalFrozenQuotes,4);
 assert.equal(g.byPolicy.relativeMargin10.decided,3);
});
test("shadows with late first Git, altered quote or grading outcome cannot pass",()=>{
 const late=[{shadow,gitHistoryCount:1,firstCommittedAt:"2026-11-12T22:59:00Z"}];
 assert.throws(()=>gradeProspectiveShadows({...params,shadowSources:late}),/before-kickoff/);
 const manipulated={...shadow,selected:shadow.selected.map((p,i)=>i? p:{...p,line:20})};
 assert.throws(()=>gradeProspectiveShadows({...params,shadowSources:[{
  shadow:manipulated,gitHistoryCount:1,firstCommittedAt:shadowCommit}]}),/identical|before-kickoff|selection/);
 const changed={...report,explicitFrozenDirections:{rows:graded.map((x,i)=>i?x:{...x,line:22})}};
 assert.throws(()=>gradeProspectiveShadows({...params,grade:changed}),/identical/);
});
